/*!
 * ContentTranslation extension - Dashboard.
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */
( function () {
	'use strict';

	/**
	 * CXDashboard
	 *
	 * @class
	 * @param {HTMLElement} element
	 * @param {mw.cx.SiteMapper} siteMapper
	 */
	function CXDashboard( element, siteMapper ) {
		this.$container = $( element );
		this.siteMapper = siteMapper;

		this.$sidebar = null;
		this.translator = null;
		this.$publishedTranslationsButton = null;
		this.lists = {};
		this.header = null;
		this.infobar = null;
		this.$translationListContainer = null;
		this.newTranslationButton = null;
		this.filter = null;
		this.$listHeader = null;
		this.$sourcePageSelector = null;
		this.invitationWidget = null;

		this.narrowLimit = 700;
		this.isNarrowScreenSize = false;

		this.filterLabels = {};
		if ( mw.config.get( 'wgContentTranslationEnableSuggestions' ) ) {
			this.filterLabels.suggestions = {
				wide: {
					label: mw.msg( 'cx-translation-filter-suggested-translations' ),
					icon: undefined
				},
				narrow: {
					label: undefined,
					icon: 'lightbulb'
				}
			};
		}
		this.filterLabels.draft = {
			wide: {
				label: mw.msg( 'cx-translation-filter-draft-translations' ),
				icon: undefined
			},
			narrow: {
				label: undefined,
				icon: 'edit'
			}
		};
		this.filterLabels.published = {
			wide: {
				label: mw.msg( 'cx-translation-filter-published-translations' ),
				icon: undefined
			},
			narrow: {
				label: undefined,
				icon: 'check'
			}
		};
	}

	CXDashboard.prototype.init = function () {
		var self = this;

		// Render the main components
		this.render();

		// Get acceptable source/target language pairs
		this.siteMapper.getLanguagePairs().then(
			function ( data ) {
				// We store valid source and target languages as "static" variables of LanguageFilter
				mw.cx.ui.LanguageFilter.static.sourceLanguages = data.sourceLanguages;
				mw.cx.ui.LanguageFilter.static.targetLanguages = data.targetLanguages;

				self.setDefaultLanguages();

				self.initLists();
				self.listen();

				mw.hook( 'mw.cx.dashboard.ready' ).fire();
			},
			function () {
				mw.hook( 'mw.cx.error' ).fire( mw.msg( 'cx-error-server-connection' ) );
			}
		);
	};

	// Find valid source and target language pair and store them in local storage
	CXDashboard.prototype.setDefaultLanguages = function () {
		var validDefaultLanguagePair = this.findValidDefaultLanguagePair();

		mw.storage.set( 'cxSourceLanguage', validDefaultLanguagePair.sourceLanguage );
		mw.storage.set( 'cxTargetLanguage', validDefaultLanguagePair.targetLanguage );
	};

	/**
	 * Find valid source and target language pair, with different source and target language
	 *
	 * @return {Object} languages Valid and different source and target languages
	 */
	CXDashboard.prototype.findValidDefaultLanguagePair = function () {
		var sourceLanguage, targetLanguage, currentLang,
			commonLanguages, i, length,
			query = new mw.Uri().query,
			sourceLanguages = mw.cx.ui.LanguageFilter.static.sourceLanguages,
			targetLanguages = mw.cx.ui.LanguageFilter.static.targetLanguages;

		sourceLanguage = query.from || mw.storage.get( 'cxSourceLanguage' );
		targetLanguage = query.to || mw.storage.get( 'cxTargetLanguage' );

		// If query.to and local storage have no target language code,
		// or language code is invalid, fall back to content language as target.
		if ( targetLanguages.indexOf( targetLanguage ) < 0 ) {
			targetLanguage = mw.config.get( 'wgContentLanguage' );
		}

		commonLanguages = mw.uls.getFrequentLanguageList().filter( function ( n ) {
			return sourceLanguages.indexOf( n ) !== -1;
		} );

		if ( sourceLanguages.indexOf( sourceLanguage ) < 0 || sourceLanguage === targetLanguage ) {
			for ( i = 0, length = commonLanguages.length; i < length; i++ ) {
				currentLang = commonLanguages[ i ];
				if ( currentLang !== targetLanguage && sourceLanguages.indexOf( currentLang ) !== -1 ) {
					sourceLanguage = currentLang;
					break;
				}
			}
		}

		// If wgContentLanguage has invalid language code for any reason, we try to find
		// some valid language from the list of common languages.
		if ( targetLanguages.indexOf( targetLanguage ) < 0 || sourceLanguage === targetLanguage ) {
			for ( i = 0, length = commonLanguages.length; i < length; i++ ) {
				currentLang = commonLanguages[ i ];
				if ( currentLang !== sourceLanguage && targetLanguages.indexOf( currentLang ) !== -1 ) {
					targetLanguage = currentLang;
					break;
				}
			}
		}

		// If the list of frequent languages does not have any valid language code different from
		// content language, we fall back to Spanish and English. Inability to find a suitable
		// language for source is most likely when target language is English, so we use most
		// common source language when translating to English. But, just in case list of frequent
		// languages only has code for content language, which is non-English, fall back to English
		// as source language.
		// Also, if local storage data is corrupted, either due to bug previously existing
		// in the code, or some manual change of local storage data, apply the same principle.
		// See T202286#4530740
		if ( sourceLanguages.indexOf( sourceLanguage ) < 0 || sourceLanguage === targetLanguage ) {
			if ( targetLanguage === 'en' ) {
				sourceLanguage = 'es';
			} else {
				sourceLanguage = 'en';
			}
		}

		return {
			sourceLanguage: sourceLanguage,
			targetLanguage: targetLanguage
		};
	};

	/**
	 * Initialize the components
	 */
	CXDashboard.prototype.initLists = function () {
		var storedSourceLanguage,
			query = new mw.Uri().query;

		this.renderTranslations();
		if ( mw.config.get( 'wgContentTranslationEnableSuggestions' ) ) {
			this.renderTranslationSuggestions();
		} else {
			this.setActiveList( 'draft' );
			return;
		}

		storedSourceLanguage = mw.storage.get( 'cxSourceLanguage' );

		// Show suggestions tab by default when user is coming from a campaign
		// entry point and does not have any previous cx source language.
		if ( ( query.campaign && !storedSourceLanguage ) ||
			// Show suggestions if URL has #suggestions
			location.hash === '#suggestions'
		) {
			this.setActiveList( 'suggestions' );
		} else {
			this.setActiveList( 'draft' );
		}
	};

	/**
	 * Populates various UI components with data in the given translation suggestions.
	 */
	CXDashboard.prototype.renderTranslationSuggestions = function () {
		this.lists.suggestions = new mw.cx.CXSuggestionList(
			this.$translationListContainer,
			this.siteMapper
		);
	};

	/**
	 * Initiate and render the translation list.
	 * TODO: Refactor this to move some logic to translationlist module
	 */
	CXDashboard.prototype.renderTranslations = function () {
		this.lists.draft = new mw.cx.CXTranslationList(
			this.$translationListContainer,
			this.siteMapper,
			'draft'
		);
		this.lists.published = new mw.cx.CXTranslationList(
			this.$translationListContainer,
			this.siteMapper,
			'published'
		);
	};

	CXDashboard.prototype.getSidebarItems = function () {
		return [
			{
				icon: 'info',
				classes: [ 'cx-dashboard-sidebar__link', 'cx-dashboard-sidebar__link--information' ],
				href: 'https://www.mediawiki.org/wiki/Special:MyLanguage/Content_translation',
				label: mw.msg( 'cx-dashboard-sidebar-information' )
			},
			{
				icon: 'chart',
				classes: [ 'cx-dashboard-sidebar__link', 'cx-dashboard-sidebar__link--stats' ],
				href: mw.util.getUrl( 'Special:ContentTranslationStats' ),
				label: mw.msg( 'cx-dashboard-sidebar-stats' )
			},
			{
				icon: 'speechBubbles',
				classes: [ 'cx-dashboard-sidebar__link', 'cx-dashboard-sidebar__link--feedback' ],
				href: 'https://www.mediawiki.org/wiki/Talk:Content_translation',
				label: mw.msg( 'cx-dashboard-sidebar-feedback' )
			}
		];
	};

	CXDashboard.prototype.buildSidebar = function () {
		var $help, i, item, items, $links = [];

		this.translator = new mw.cx.widgets.CXTranslator();
		this.$publishedTranslationsButton = this.translator.$lastMonthButton;

		$help = $( '<div>' )
			.addClass( 'cx-dashboard-sidebar__help' );

		items = this.getSidebarItems();
		$links = $( '<ul>' );
		for ( i = 0; i < items.length; i++ ) {
			item = items[ i ];
			$links.append(
				$( '<li>' ).append( new OO.ui.ButtonWidget( {
					icon: item.icon,
					framed: false,
					classes: item.classes,
					flags: [ 'primary', 'progressive' ],
					label: item.label,
					href: item.href,
					target: '_blank'
				} ).$element )
			);
		}
		$links.append( $( '<li>' ).cxVersionSwitcher() );
		$help.append(
			$( '<div>' )
				.addClass( 'cx-dashboard-sidebar__help-title' )
				.text( mw.msg( 'cx-dashboard-sidebar-title' ) ),
			$links
		);

		return [ this.translator.$widget, $help ];
	};

	CXDashboard.prototype.render = function () {
		this.infobar = new mw.cx.ui.Infobar( this.config );

		this.header = new mw.cx.ui.Header( {
			classes: [ 'cx-header--dashboard' ],
			siteMapper: this.siteMapper,
			titleText: mw.msg( 'cx-dashboard-header' )
		} );

		this.$translationListContainer = this.buildTranslationList();
		this.$sidebar = $( '<div>' )
			.addClass( 'cx-dashboard-sidebar' )
			.append( this.buildSidebar() );

		this.$dashboard = $( '<div>' )
			.addClass( 'cx-dashboard' )
			.append( this.$translationListContainer, this.$sidebar );

		this.$container.append(
			this.header.$element,
			this.infobar.$element,
			this.$dashboard
		);
	};

	CXDashboard.prototype.buildTranslationList = function () {
		var size, name, props, $translationList,
			filterButtons = [];

		// document.documentElement.clientWidth performs faster than $( window ).width()
		this.isNarrowScreenSize = document.documentElement.clientWidth < this.narrowLimit;

		size = this.isNarrowScreenSize ? 'narrow' : 'wide';

		for ( name in this.filterLabels ) {
			props = this.filterLabels[ name ];

			filterButtons.push( new OO.ui.ButtonOptionWidget( {
				data: name,
				label: props[ size ].label,
				icon: props[ size ].icon
			} ) );
		}

		this.filter = new OO.ui.ButtonSelectWidget( {
			items: filterButtons
		} );

		this.newTranslationButton = new OO.ui.ButtonWidget( {
			label: mw.msg( 'cx-create-new-translation' ),
			icon: 'add',
			flags: [
				'primary',
				'progressive'
			]
		} );

		this.$listHeader = $( '<div>' ).addClass( 'translation-filter' );
		this.$listHeader.append(
			this.newTranslationButton.$element,
			this.filter.$element
		);

		this.$sourcePageSelector = $( '<div>' )
			.addClass( 'cx-source-page-selector' );

		this.invitationWidget = new mw.cx.InvitationWidget( {
			icon: 'beaker',
			label: mw.message( 'cx-campaign-new-version-description' ).parseDom(),
			acceptLabel: mw.msg( 'cx-campaign-enable-new-version' ),
			dismissOptionName: 'cx-invite-chosen',
			acceptAction: this.acceptNewVersion.bind( this )
		} );

		$translationList = $( '<div>' )
			.addClass( 'cx-translationlist-container' )
			.append( this.$listHeader, this.$sourcePageSelector );

		if ( !mw.user.options.get( 'cx-new-version' ) ) {
			$translationList.append( this.invitationWidget.$element );
		}

		return $translationList;
	};

	CXDashboard.prototype.acceptNewVersion = function () {
		return this.persistUserPreference( 'globalpreferences' ).fail( function ( error ) {
			if ( error === 'unknown_action' ) {
				this.persistUserPreference( 'options' );
			}
		}.bind( this ) );
	};

	CXDashboard.prototype.persistUserPreference = function ( action ) {
		return new mw.Api().postWithToken( 'csrf', {
			assert: 'user',
			formatversion: 2,
			action: action,
			optionname: 'cx-new-version',
			optionvalue: 1
		} ).done( function () {
			mw.hook( 'mw.cx.accept.new.version' ).fire();
		} ).fail( function ( error ) {
			if ( error === 'assertuserfailed' ) {
				mw.cx.DashboardList.static.showLoginDialog();
			}
		} );
	};

	CXDashboard.prototype.setActiveList = function ( type ) {
		var listName, list;

		this.activeList = type;
		this.filter.selectItemByData( type );

		for ( listName in this.lists ) {
			list = this.lists[ listName ];

			if ( listName === type ) {
				list.show();
			} else {
				list.hide();
			}
		}
	};

	CXDashboard.prototype.listen = function () {
		var self = this;

		this.filter.connect( this, { select: function ( item ) {
			this.setActiveList( item.getData() );
		} } );

		this.$publishedTranslationsButton.on( 'click', function () {
			self.filter.selectItemByData( 'published' );
		} );

		this.initSourceSelector();
		this.newTranslationButton.connect( this, {
			click: this.onClickHandler
		} );
		// Resize handler
		$( window ).on( 'resize', OO.ui.throttle( this.resize.bind( this ), 250 ) );
	};

	CXDashboard.prototype.onClickHandler = function () {
		this.$listHeader.hide();
		window.scrollTo( window.pageXOffset, 0 ); // Equivalent to $( window ).scrollTop( 0 )
	};

	CXDashboard.prototype.initSourceSelector = function () {
		var query,
			sourcePageSelectorOptions = {};

		query = new mw.Uri().query;
		sourcePageSelectorOptions.sourceLanguage = query.from;
		sourcePageSelectorOptions.targetLanguage = query.to;
		sourcePageSelectorOptions.sourceTitle = query.page;
		sourcePageSelectorOptions.targetTitle = query.targettitle;
		sourcePageSelectorOptions.triggerButton = this.newTranslationButton;
		sourcePageSelectorOptions.$container = this.$sourcePageSelector;
		this.newTranslationButton.$element.cxSourcePageSelector( sourcePageSelectorOptions );
		// Check for conditions that pre-open source page selector
		if ( query.from && query.to && query.page ) {
			this.$listHeader.hide();
			window.scrollTo( window.pageXOffset, 0 ); // Equivalent to $( window ).scrollTop( 0 )
		}

		if ( query.campaign ) {
			mw.hook( 'mw.cx.cta.accept' ).fire( query.campaign, query.from, query.page, query.to );
		}
	};

	CXDashboard.prototype.resize = function () {
		var filterItems = this.filter.getItems(),
			narrowScreenSize = document.documentElement.clientWidth < this.narrowLimit,
			size = narrowScreenSize ? 'narrow' : 'wide',
			self = this;

		this.translator.resize();

		// Exit early if screen size stays above/under narrow screen size limit
		if ( this.isNarrowScreenSize === narrowScreenSize ) {
			return;
		}

		// Change filter labels to icons and vice-versa
		filterItems.forEach( function ( filter ) {
			var data = filter.getData(),
				label = self.filterLabels[ data ][ size ].label,
				icon = self.filterLabels[ data ][ size ].icon;

			filter.setIcon( icon );
			filter.setLabel( label );
		} );
		this.isNarrowScreenSize = narrowScreenSize;
	};

	$( function () {
		var dashboard;

		// Set the global siteMapper for code which we cannot inject it
		mw.cx.siteMapper = new mw.cx.SiteMapper( mw.config.get( 'wgContentTranslationSiteTemplates' ) );
		dashboard = new CXDashboard( document.body, mw.cx.siteMapper );
		dashboard.init();
	} );
}() );
