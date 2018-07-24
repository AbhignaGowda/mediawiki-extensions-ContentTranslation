'use strict';

/**
 * CX Translation - save, fetch controller
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 *
 * @param {mw.cx.dm.Translation} translation
 * @param {ve.init.mw.CXTarget} veTarget
 * @param {mw.cx.SiteMapper} siteMapper
 * @param {Object} [config] Configuration for mw.cx.TargetArticle
 */
mw.cx.TranslationController = function MwCxTranslationController(
	translation, veTarget, siteMapper, config
) {
	this.translation = translation;
	this.veTarget = veTarget;
	this.siteMapper = siteMapper;
	this.translationView = this.veTarget.translationView;

	// Mixin constructors
	OO.EventEmitter.call( this );

	// Properties
	this.saveRequest = null;
	this.failCounter = 0;
	this.isFailedUnrecoverably = false; // TODO: This is still unused
	// Associative array of translation units queued to be saved
	this.saveQueue = {};
	this.saveTimer = null;
	this.sourceCategoriesSaved = false;
	this.targetCategoriesChanged = 0;
	this.savedTargetTitle = this.translation.getTargetTitle();
	this.targetArticle = new mw.cx.TargetArticle( this.translation, this.veTarget, config );
	this.schedule = OO.ui.throttle( this.processSaveQueue.bind( this ), 15 * 1000 );
	this.translationTracker = new mw.cx.TranslationTracker( this.translation, this.veTarget, config );
	this.saveTracker = {};

	// Events
	this.listen();
};

/* Inheritance */

OO.mixinClass( mw.cx.TranslationController, OO.EventEmitter );

mw.cx.TranslationController.prototype.listen = function () {
	this.translation.connect( this, {
		targetCategoriesChange: 'onTargetCategoriesChange'
	} );

	this.veTarget.connect( this, {
		surfaceReady: 'onSurfaceReady',
		saveSection: 'save',
		publish: 'publish',
		targetTitleChange: 'onTargetTitleChange'
	} );

	this.targetArticle.connect( this, {
		captchaCancel: 'onPublishCancel',
		publishCancel: 'onPublishCancel',
		publishSuccess: 'onPublishSuccess',
		publishError: 'onPublishFailure'
	} );

	// Save when CTRL+S is pressed.
	// TODO: This should use VE's Trigger/Command system, and be registered with the help dialog
	document.onkeydown = function ( e ) {
		// See https://medium.engineering/the-curious-case-of-disappearing-polish-s-fa398313d4df
		if ( ( e.metaKey || e.ctrlKey && !e.altKey ) && e.which === 83 ) {
			this.processSaveQueue();
			return false;
		}
	}.bind( this );

	window.onbeforeunload = this.onPageUnload.bind( this );
};

ve.ui.commandHelpRegistry.register( 'other', 'autoSave', {
	shortcuts: [ {
		mac: 'cmd+s',
		pc: 'ctrl+s'
	} ],
	label: OO.ui.deferMsg( 'cx-save-draft-shortcut-label' )
} );

/**
 * Save the translation to database
 *
 * @param {Object} sectionData
 */
mw.cx.TranslationController.prototype.save = function ( sectionData ) {
	if ( !sectionData ) {
		return;
	}

	// Keep records indexed by section numbers to avoid duplicates.
	// When more than one changes to a single translation unit comes, only
	// the last one needs to be considered for saving.
	this.saveQueue[ sectionData.sectionNumber ] = sectionData;

	this.schedule();
};

/**
 * Return true if there aren't any new changes to be saved.
 *
 * @return {boolean}
 */
mw.cx.TranslationController.prototype.noNewChanges = function () {
	return ( !this.saveQueue || !Object.keys( this.saveQueue ).length ) &&
		!this.targetTitleChanged() &&
		this.targetCategoriesChanged === 0;
};

/**
 * Return true if target title is changed and needs to be saved.
 *
 * @return {boolean}
 */
mw.cx.TranslationController.prototype.targetTitleChanged = function () {
	return this.savedTargetTitle !== this.translation.getTargetTitle();
};

/**
 * Process the save queue. Save the changed translation units.
 *
 * @param {boolean} [isRetry] Whether this is a retry or not.
 */
mw.cx.TranslationController.prototype.processSaveQueue = function ( isRetry ) {
	var numOfChangedCategories, savedSections, params,
		api = new mw.Api();

	if ( this.noNewChanges() ) {
		return;
	}

	if ( this.failCounter > 0 && isRetry !== true ) {
		// Last save failed, and a retry has been scheduled. Don't allow starting new
		// save requests to avoid overloading the servers, unless this is the retry.
		mw.log( '[CX] Save request skipped because a retry has been scheduled' );
		return;
	}

	// Starting the real save API call.
	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-saving' ) );

	if ( this.saveRequest ) {
		mw.log( '[CX] Aborted active save request' );
		// This causes failCounter to increase because the in-flight request fails.
		// The new request we do below will reset the fail counter on success.
		// If it does not succeed, the retry timer that was set by the failed request
		// prevents further saves before the retry has completed successfully or given up.
		this.saveRequest.abort();
	}

	params = {
		action: 'cxsave',
		assert: 'user',
		content: this.getContentToSave( this.saveQueue ),
		from: this.translation.getSourceLanguage(),
		to: this.translation.getTargetLanguage(),
		sourcetitle: this.translation.getSourceTitle(),
		title: this.translation.getTargetTitle(),
		sourcerevision: this.translation.getSourceRevisionId(),
		progress: JSON.stringify( this.translationTracker.getTranslationProgress() ),
		cxversion: 2
	};

	savedSections = Object.keys( this.saveQueue );

	if ( this.targetCategoriesChanged > 0 ) {
		// Use counter for number of changes in target categories which are attempted to be saved.
		// Once saving is successful, that number is subtracted from current number of changes in
		// target categories, which maybe got bigger while first change was being saved.
		numOfChangedCategories = this.targetCategoriesChanged;
		params.targetcategories = JSON.stringify( this.translation.getTargetCategories() );

		// Only save source categories once per session, the first time user changes target
		// categories. Both source and target categories are saved in cx_corpora table, but
		// only target categories are retrieved when saved draft is being restored. Source
		// categories are saved for completeness of cx_corpora, which pairs source and target.
		// Source categories are saved once per session, because there may have been changes
		// to source categories in the mean time.
		if ( !this.sourceCategoriesSaved ) {
			params.sourcecategories = JSON.stringify( this.translation.getSourceCategories() );
		}
	}

	if ( this.failCounter > 0 ) {
		mw.log( '[CX] Retrying to save the translation. Failed ' + this.failCounter + ' times so far.' );
	}

	this.saveRequest = api.postWithToken( 'csrf', params )
		.done( function ( saveResult ) {
			this.onSaveComplete( saveResult );

			if ( this.targetTitleChanged() ) {
				mw.log( '[CX] Target title saved.' );
			}
			this.savedTargetTitle = params.title;

			if ( params.sourcecategories ) {
				this.sourceCategoriesSaved = true;
			}

			if ( numOfChangedCategories ) {
				this.targetCategoriesChanged -= numOfChangedCategories;
			}

			// Remove saved sections from the queue
			savedSections.forEach( function ( sectionId ) {
				delete this.saveQueue[ sectionId ];
			}.bind( this ) );

			// Reset fail counter.
			if ( this.failCounter > 0 ) {
				this.failCounter = 0;
				mw.log( '[CX] Retry successful. Save succeeded.' );
			}
		}.bind( this ) ).fail( function ( errorCode, details ) {
			var delay;
			this.failCounter++;

			mw.log.warn( '[CX] Saving Failed. Error code: ' + errorCode );
			if ( details.exception !== 'abort' ) {
				this.onSaveFailure( errorCode, details );
			}

			if ( this.failCounter > 5 ) {
				// If there are more than a few errors, stop autosave at timer triggers.
				// Show a bigger error message at this point.
				this.translationView.showMessage( 'error', mw.msg( 'cx-save-draft-error' ) );
				// This will allow any change to trigger save again
				this.failCounter = 0;
				mw.log.error( '[CX] Saving failed repeatedly. Stopping retries.' );
			} else {
				// Delay in seconds, failCounter is [1,5]
				delay = 60 * this.failCounter;
				// Schedule retry.
				setTimeout( this.processSaveQueue.bind( this, true ), delay * 1000 );
				mw.log( '[CX] Retry scheduled in ' + delay / 60 + ' minutes.' );
			}
		}.bind( this ) ).always( function () {
			this.saveRequest = null;
		}.bind( this ) );
};

/**
 * Find out if there is any "dirty" section translation units.
 * Inform about sections not saved to the user.
 *
 * @return {string|undefined} The message to be shown to the user
 */
mw.cx.TranslationController.prototype.onPageUnload = function () {
	if ( Object.keys( this.saveQueue ).length > 0 ) {
		this.schedule();
		return mw.msg( 'cx-warning-unsaved-translation' );
	}
};

mw.cx.TranslationController.prototype.onSaveComplete = function ( saveResult ) {
	var sectionNumber, section, validation, validations, minutes = 0;

	if ( this.targetCategoriesChanged > 0 ) {
		mw.log( '[CX] Target categories saved.' );
	}

	validations = saveResult.cxsave.validations;

	for ( sectionNumber in this.saveQueue ) {
		validation = validations[ sectionNumber ];

		if ( !this.saveQueue.hasOwnProperty( sectionNumber ) ) {
			continue;
		}

		if ( validation && validation.length > 0 ) {
			// FIXME. Not nice to append the prefix below.
			section = this.veTarget.getTargetSectionNode( 'cxTargetSection' + sectionNumber );
			if ( section ) {
				// Annotate the section with errors if any.
				this.onSaveValidation( section, validation );
			}
		}

		mw.log( '[CX] Section ' + sectionNumber + ' saved.' );
	}

	// Show saved status with a time after last save.
	clearTimeout( this.saveTimer );
	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-save-success', 0 ) );

	this.saveTimer = setInterval( function () {
		if ( this.failCounter > 0 ) {
			// Don't overwrite error message of failure with this timer controlled message.
			return;
		}

		minutes++;
		this.translationView.setStatusMessage(
			mw.msg( 'cx-save-draft-save-success', mw.language.convertNumber( minutes ) )
		);
	}.bind( this ), 60 * 1000 );
};

mw.cx.TranslationController.prototype.onSaveFailure = function ( errorCode, details ) {
	if ( errorCode === 'assertuserfailed' ) {
		this.translationView.showMessage( 'error', mw.msg( 'cx-lost-session-draft' ) );
	}

	if ( details && details.exception instanceof Error ) {
		details.exception = details.exception.toString();
		details.errorCode = errorCode;
	}

	this.translationView.setStatusMessage( mw.msg( 'cx-save-draft-error' ) );
};

/**
 * Validation result handler
 *
 * @param {ve.dm.CXSectionNode} section
 * @param {Object[]} validations
 */
mw.cx.TranslationController.prototype.onSaveValidation = function ( section, validations ) {
	var id, validation, message, error, results = [];

	this.saveTracker[ section.getSectionNumber() ] = this.saveTracker[ section.getSectionNumber() ] ||
		{ count: 0, error: false };

	if ( validations && Object.keys( validations ).length === 0 ) {
		this.saveTracker[ section.getSectionNumber() ].error = false;
		section.setLintResults( null );
		return;
	}

	this.saveTracker[ section.getSectionNumber() ].error = true;
	for ( id in validations ) {
		validation = validations[ id ];
		message = validation.warn && validation.warn.messageHtml;
		error = validation.disallow;

		if ( message ) {
			results.push( {
				message: message,
				messageInfo: {
					title: mw.msg( 'cx-tools-linter-abuse-filter' ),
					type: error ? 'error' : 'warning',
					help: 'https://www.mediawiki.org/wiki/Special:MyLanguage/Content_translation/Abuse_filter'
				}
			} );
		}
	}

	section.setLintResults( results );
};

/**
 * Get the deflated content to save from save queue.
 *
 * @param {Object[]} saveQueue
 * @return {string}
 */
mw.cx.TranslationController.prototype.getContentToSave = function ( saveQueue ) {
	var records = [];

	Object.keys( saveQueue ).forEach( function ( key ) {
		var translationUnit = saveQueue[ key ];
		this.getSectionRecords( translationUnit ).forEach( function ( data ) {
			records.push( data );
		} );
	}.bind( this ) );

	// The cxsave api accept non-deflated content too.
	// Sometimes it is helpful for testing:
	// return JSON.stringify( records );
	return EasyDeflate.deflate( JSON.stringify( records ) );
};

/**
 * Get the records for saving the translation unit.
 *
 * @param {Object} sectionData
 * @return {Object[]} Objects to save
 */
mw.cx.TranslationController.prototype.getSectionRecords = function ( sectionData ) {
	var hasNotBeenSavedBefore, saveMetadata, validate, translationSource, origin,
		records = [];

	if ( this.saveTracker[ sectionData.sectionNumber ] ) {
		hasNotBeenSavedBefore = false;
		saveMetadata = this.saveTracker[ sectionData.sectionNumber ];
	} else {
		hasNotBeenSavedBefore = true;
		saveMetadata = {
			// How many times this section has been saved in the current session
			count: 0,
			error: false
		};
	}

	// Because validation is computationally heavy and slow operation (server side),
	// do not perform validation on every request, unless there is a known validation
	// issue that should go away immediately when fixed by the user. Validation means
	// checking whether the content matches AbuseFilter rules defined in the target wiki.
	validate = saveMetadata.error ||
		saveMetadata.count % 5 === 0 ||
		translationSource === 'mt';

	// XXX should use the promise, but at this point the member variable should always be present
	translationSource = sectionData.translation.MTProvider;
	if ( translationSource === 'source' || translationSource === 'scratch' ) {
		origin = 'user';
	} else {
		origin = translationSource;
	}

	records.push( {
		content: sectionData.translation.content,
		// Use source section number as the canonical section id shared by source and target.
		sectionId: sectionData.sectionNumber,
		validate: validate,
		origin: origin
	} );

	// Save source sections only once because they do not change.
	if ( hasNotBeenSavedBefore ) {
		records.push( {
			content: sectionData.source.content,
			sectionId: sectionData.sectionNumber,
			// It makes no sense to validate source sections.
			validate: false,
			origin: 'source'
		} );
		mw.log( '[CX] Saving source content of section ' + sectionData.sectionNumber );
	}

	saveMetadata.count++;

	this.saveTracker[ sectionData.sectionNumber ] = saveMetadata;

	return records;
};

/**
 * Publish the translation
 */
mw.cx.TranslationController.prototype.publish = function () {
	mw.log( '[CX] Publishing translation...' );

	// Clear the status message
	this.translationView.setStatusMessage( '' );
	// Disable categories to prevent editing
	this.translationView.categoryUI.disableCategoryUI( true );

	this.targetArticle.publish();

	// Scroll to the top of the page, so success/fail messages become visible
	$( 'html, body' ).animate( { scrollTop: 0 }, 'fast' );
};

mw.cx.TranslationController.prototype.enableEditing = function () {
	this.translationView.categoryUI.disableCategoryUI( false );
	clearTimeout( this.saveTimer );
};

/**
 * Publish cancel handler
 */
mw.cx.TranslationController.prototype.onPublishCancel = function () {
	mw.log( '[CX] Publishing canceled' );

	this.veTarget.onPublishCancel();
	this.enableEditing();
};

/**
 * Publish success handler
 */
mw.cx.TranslationController.prototype.onPublishSuccess = function () {
	mw.log( '[CX] Publishing finished successfully' );

	this.veTarget.onPublishSuccess( this.targetArticle.getTargetURL() );
	this.enableEditing();

	// Event logging and Wikibase linking
	mw.hook( 'mw.cx.translation.published' ).fire(
		this.translation.getSourceLanguage(),
		this.translation.getTargetLanguage(),
		this.translation.getSourceTitle(),
		this.translation.getTargetTitle()
	);
};

/**
 * Publish error handler
 *
 * @param {OO.ui.Error} error
 */
mw.cx.TranslationController.prototype.onPublishFailure = function ( error ) {
	this.isFailedUnrecoverably = !error.isRecoverable();
	this.veTarget.onPublishFailure( error.getMessageText() );
	this.enableEditing();
};

/**
 * Target categories change handler.
 */
mw.cx.TranslationController.prototype.onTargetCategoriesChange = function () {
	this.targetCategoriesChanged++;
	this.schedule();
};

/**
 * Target title change handler
 */
mw.cx.TranslationController.prototype.onTargetTitleChange = function () {
	var currentTitleObj, newTitleObj,
		currentTitle = this.translation.getTargetTitle(),
		newTitle = this.translationView.targetColumn.getTitle();

	if ( currentTitle === newTitle ) {
		// Nothing really changed.
		return;
	}

	this.translation.setTargetTitle( newTitle );
	this.schedule();

	currentTitleObj = mw.Title.newFromUserInput( currentTitle );
	newTitleObj = mw.Title.newFromUserInput( newTitle );

	if (
		currentTitleObj && newTitleObj &&
		currentTitleObj.getNamespaceId() !== newTitleObj.getNamespaceId()
	) {
		this.veTarget.updateNamespace();
	}
};

mw.cx.TranslationController.prototype.onSurfaceReady = function () {
	this.translationTracker.init();
};
