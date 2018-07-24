'use strict';

/**
 * Translation progress tracker and MT abuse detection.
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 *
 * @class
 * @param {mw.cx.dm.Translation} translationModel
 * @param {ve.init.mw.CXTarget} veTarget
 * @param {Object} config
 * @cfg {String} sourceLanguage
 * @cfg {String} targetLanguage
 */
mw.cx.TranslationTracker = function MwCXTranslationTracker( translationModel, veTarget, config ) {
	this.sourceLanguage = config.sourceLanguage;
	this.targetLanguage = config.targetLanguage;
	this.veTarget = veTarget;
	this.translationModel = translationModel;

	// Threshold won't be a fixed value in future, but we start with this.
	// A value 0.75 means, we tolerate 75% unmodified machine translation in translation.
	this.unmodifiedMTThreshold = 0.75;
	// Sections in the translation. Associative array with section numbers as keys
	// and values as mw.cx.dm.SectionState
	this.sections = {};
	this.validationDelayQueue = [];
	this.changeQueue = [];
	this.changeTrackerScheduler = OO.ui.debounce( this.processChangeQueue.bind( this ), 500 );
	this.translationModel.connect( this, {
		sectionChange: 'addToChangeQueue'
	} );
};

/**
 * Initialize translation.
 */
mw.cx.TranslationTracker.prototype.init = function () {
	var i, sectionNumber, sectionModels, sectionModel, sectionState,
		savedTranslationUnits, savedTranslationUnit;

	sectionModels = this.translationModel.sourceDoc.getNodesByType( 'cxSection' );
	savedTranslationUnits = this.translationModel.savedTranslationUnits || [];
	for ( i = 0; i < sectionModels.length; i++ ) {
		sectionModel = sectionModels[ i ];

		sectionNumber = sectionModel.getSectionNumber();
		sectionState = new mw.cx.dm.SectionState( sectionNumber );
		sectionState.setSourceContent( ve.dm.converter.getDomFromNode( sectionModel ).body.textContent );
		savedTranslationUnit = savedTranslationUnits[ sectionNumber ];
		if ( savedTranslationUnit ) {
			if ( savedTranslationUnit.user ) {
				sectionState.setUserTranslationContent( $( savedTranslationUnit.user.content ).text() );
				sectionState.setCurrentMTProvider( savedTranslationUnit.user.engine );
			}
			if ( savedTranslationUnit.mt ) {
				// Machine translation, unmodified.
				sectionState.setUnmodifiedMTContent( $( savedTranslationUnit.mt.content ).text() );
				sectionState.setCurrentMTProvider( savedTranslationUnit.mt.engine );
			}
		}

		this.sections[ sectionNumber ] = sectionState;
	}

	mw.log( '[CX] Translation tracker initialized for ' + sectionModels.length + ' sections' );
};

/**
 * Catch the section changes to a queue.
 * @param {String} sectionId
 */
mw.cx.TranslationTracker.prototype.addToChangeQueue = function ( sectionId ) {
	if ( this.changeQueue.indexOf( sectionId ) < 0 ) {
		this.changeQueue.push( sectionId );
	}
	// Schedule processing this queue
	this.changeTrackerScheduler();
};

/**
 * Process the change queue.
 * This will be called by getTranslationProgress when saving happens, also
 * by section changes in debounced manner.
 */
mw.cx.TranslationTracker.prototype.processChangeQueue = function () {
	var i = this.changeQueue.length;
	while ( i-- ) {
		this.processSectionChange( this.changeQueue[ i ] );
		this.changeQueue.splice( i, 1 );
	}
};

/**
 * Section change handler
 * @param {String} sectionId
 */
mw.cx.TranslationTracker.prototype.processSectionChange = function ( sectionId ) {
	var sectionNumber, sectionModel, sectionState, newContent, existingContent,
		currentMTProvider, unmodifiedMTContent, newMTProvider, freshTranslation;

	sectionModel = this.veTarget.getTargetSectionNode( sectionId );
	if ( !sectionModel ) {
		// sectionModel can be null in case this handler is executed while the node
		// is being modified. Since this method is debounced, chances are rare.
		// Still checking for null.
		return;
	}
	sectionNumber = mw.cx.getSectionNumberFromSectionId( sectionId );
	sectionState = this.sections[ sectionNumber ];

	currentMTProvider = sectionState.getCurrentMTProvider();
	newMTProvider = sectionModel.getOriginalContentSource();
	if ( currentMTProvider !== newMTProvider ) {
		// Fresh translation or MT Engine change
		mw.log( '[CX] MT Engine change for section ' + sectionNumber + ' to MT ' + newMTProvider );
		sectionState.setCurrentMTProvider( newMTProvider );
		// Reset the saved content in section state.
		sectionState.setUserTranslationContent( null );
		freshTranslation = true;
	}

	newContent = ve.dm.converter.getDomFromNode( sectionModel ).body.textContent;
	existingContent = sectionState.getUserTranslationContent();
	unmodifiedMTContent = sectionState.getUnmodifiedMTContent();
	if ( !unmodifiedMTContent ) {
		// Fresh translation. Extract and save the unmodified MT content to section state.
		sectionState.setCurrentMTProvider( newMTProvider );
		sectionState.setUnmodifiedMTContent( newContent );
		mw.log( '[CX] Fresh translation for section ' + sectionNumber + ' with MT ' + newMTProvider );
	}
	if ( newContent !== existingContent ) {
		// A modification of user translated content. Save the modified content to section state
		sectionState.setUserTranslationContent( newContent );
		mw.log( '[CX] Content modified for section ' + sectionNumber + ' with MT ' + newMTProvider );
	} else {
		// No real content change here. May be markup change, which we don't care.
		return;
	}

	// NOTE: For unmodified MT, we use the same content for userTranslatedContent

	// Calculate and update the progress
	this.updateSectionProgress( sectionNumber );

	if ( freshTranslation ) {
		// For freshly translated section, delay the validation till next action on same section
		// or other sections.
		this.validationDelayQueue.push( sectionNumber );
		return;
	}
	if ( this.validateForMTAbuse( sectionNumber ) ) {
		this.setMTAbuseWarning( sectionModel );
	} else {
		this.clearMTAbuseWarning( sectionModel );
	}

	this.processValidationQueue();
};

/**
 * Calculate and update the section translation progress.
 * @param {Number} sectionNumber
 */
mw.cx.TranslationTracker.prototype.updateSectionProgress = function ( sectionNumber ) {
	var sectionState, unmodifiedPercentage, progress;

	sectionState = this.sections[ sectionNumber ];

	unmodifiedPercentage = mw.cx.TranslationTracker.calculateUnmodifiedContent(
		sectionState.getUnmodifiedMTContent(),
		sectionState.getUserTranslationContent(),
		this.targetLanguage
	);
	sectionState.setUnmodifiedPercentage( unmodifiedPercentage );

	// Calculate the progress. It is a value between 0 and 1
	progress = mw.cx.TranslationTracker.calculateSectionTranslationProgress(
		sectionState.getSourceContent(),
		sectionState.getUserTranslationContent(),
		this.targetLanguage
	);
	sectionState.setTranslationProgressPercentage( progress );
};

/**
 * Calculate the section translation progress based on relative number of tokens.
 * If there are 10 tokens and all translated, return 1, if 5 more tokens
 * added, return 1.5 and so on.
 * @param {String} string1
 * @param {String} string2
 * @param {String} language
 * @return {Number}
 */
mw.cx.TranslationTracker.calculateSectionTranslationProgress = function ( string1, string2, language ) {
	var tokens1, tokens2;
	if ( string1 === string2 ) {
		return 1;
	}
	if ( !string1 || !string2 ) {
		return 0;
	}

	tokens1 = mw.cx.TranslationTracker.tokenise( string1, language );
	tokens2 = mw.cx.TranslationTracker.tokenise( string2, language );

	return tokens2.length / tokens1.length;
};

/**
 * A very simple method to calculate the difference between two strings in the scale
 * of 0 to 1, based on relative number of tokens changed in string2 from string1.
 *
 * @param {String} string1
 * @param {String} string2
 * @param {String} language
 * @return {Number} A value between 0 and 1
 */
mw.cx.TranslationTracker.calculateUnmodifiedContent = function ( string1, string2, language ) {
	var unmodifiedTokens, bigSet, smallSet, tokens1, tokens2;

	if ( string1 === string2 ) {
		// Both strings are equal. So string2 is 100% unmodified version of string1
		return 1;
	}

	if ( !string1 || !string2 ) {
		return 0;
	}

	bigSet = tokens1 = mw.cx.TranslationTracker.tokenise( string1, language );
	smallSet = tokens2 = mw.cx.TranslationTracker.tokenise( string2, language );

	if ( tokens2.length > tokens1.length ) {
		// Swap the sets
		bigSet = tokens2;
		smallSet = tokens1;
	}

	// Find the intersection(tokens that did not change) two token sets
	unmodifiedTokens = bigSet.filter( function ( token ) {
		return smallSet.indexOf( token ) >= 0;
	} );

	// If string1 has 10 tokens and we see that 2 tokens are different or not present in string2,
	// we are saying that string2 is 80% (ie. 10-2/10) of unmodified version fo string1.
	return unmodifiedTokens.length / bigSet.length;
};

/**
 * Tokenize a given string. Here tokens is basically words for non CJK languages.
 * For CJK languages, we just split at each codepoint level.
 *
 * @param {String} string
 * @param {String} language
 * @return {String[]}
 */
mw.cx.TranslationTracker.tokenise = function ( string, language ) {
	if ( $.uls.data.scriptgroups.CJK.indexOf( $.uls.data.getScript( language ) ) >= 0 ) {
		return string.split( '' );
	}

	return string.match( /\S+/g ); // Match all non whitespace characters for tokens
};

/**
 * Check if a section has unmodified MT beyond a threshold. If so, add a warning issue
 * to the section model.
 * @param {Number} sectionNumber
 * @return {Boolean} Whether the section is crossing the unmodified MT threshold
 */
mw.cx.TranslationTracker.prototype.validateForMTAbuse = function ( sectionNumber ) {
	var sourceTokens,
		sectionState = this.sections[ sectionNumber ];

	sourceTokens = mw.cx.TranslationTracker.tokenise( sectionState.getSourceContent(), this.sourceLanguage );
	if ( sourceTokens.length < 10 ) {
		// Exclude smaller sections from MT abuse validations
		return false;
	}

	if ( sectionState.getUnmodifiedPercentage() > this.unmodifiedMTThreshold ) {
		// MT Abuse. Raise a warning.
		return true;
	} else {
		return false;
	}
};

mw.cx.TranslationTracker.prototype.setMTAbuseWarning = function ( sectionModel ) {
	var percentage, sectionState;

	sectionState = this.sections[ sectionModel.getSectionNumber() ];
	percentage = mw.language.convertNumber(
		Math.round( ( sectionState.getUnmodifiedPercentage() * 100 ) ) );
	mw.log( '[CX] Unmodified MT percentage for section ' + sectionModel.getSectionNumber() +
		' ' + percentage + '% crossed the threshold ' + this.unmodifiedMTThreshold * 100 );
	// FIXME: Not really a lint issue. But that is the api name.
	sectionModel.setLintResults( [ {
		message: mw.msg( 'cx-mt-abuse-warning-text' ),
		messageInfo: {
			title: mw.msg( 'cx-mt-abuse-warning-title', percentage ),
			type: 'warning',
			help: mw.msg( 'cx-tools-view-guidelines-link' )
		}
	} ] );
};

mw.cx.TranslationTracker.prototype.clearMTAbuseWarning = function ( sectionModel ) {
	sectionModel.setLintResults( [] );
};

/**
 * Calculate the percentage of machine translation for all sections.
 *
 * @return {Object} Map of weights
 * @return {number} return.any Weight of sections with content
 * @return {number} return.human Weight of sections with human modified content
 * @return {number} return.mt Weight of sections with unmodified mt content
 * @return {number} return.mtSectionsCount Count of sections with unmodified mt content
 */
mw.cx.TranslationTracker.prototype.getTranslationProgress = function () {
	var sectionNumber, sectionState,
		totalSourceSections = 0,
		sectionsWithAnyTranslation = 0,
		sectionsWithUserTranslation = 0,
		sectionsWithUnmodifiedContent = 0;

	totalSourceSections = Object.keys( this.sections ).length;

	for ( sectionNumber in this.sections ) {
		if ( !this.sections.hasOwnProperty( sectionNumber ) ) {
			continue;
		}

		// Recalculate the progress. Make sure we are not using old data.
		this.processChangeQueue();
		this.updateSectionProgress( sectionNumber );

		sectionState = this.sections[ sectionNumber ];
		if ( sectionState.getUnmodifiedMTContent() || sectionState.getUserTranslationContent() ) {
			// Section with any type of translation
			sectionsWithAnyTranslation++;
		}
		if ( sectionState.getUnmodifiedMTContent() === sectionState.getUserTranslationContent() ) {
			// Section with umodified translation
			sectionsWithUnmodifiedContent++;
		} else if ( sectionState.getUserTranslationContent() ) {
			// Section with human modified translation
			sectionsWithUserTranslation++;
		}
	}

	return {
		any: sectionsWithAnyTranslation / totalSourceSections,
		human: sectionsWithUserTranslation / totalSourceSections,
		mt: sectionsWithUnmodifiedContent / totalSourceSections,
		mtSectionsCount: sectionsWithUnmodifiedContent
	};
};

/**
 * Process any delayed validations on sections.
 */
mw.cx.TranslationTracker.prototype.processValidationQueue = function () {
	var i, sectionNumber, sectionModel;

	i = this.validationDelayQueue.length;
	while ( i-- ) {
		sectionNumber = this.validationDelayQueue[ i ];
		sectionModel = this.veTarget.getTargetSectionNodeFromSectionNumber( sectionNumber );
		if ( this.validateForMTAbuse( sectionNumber ) ) {
			this.setMTAbuseWarning( sectionModel );
		} else {
			this.clearMTAbuseWarning( sectionModel );
		}
		this.validationDelayQueue.splice( i, 1 );
	}
};
