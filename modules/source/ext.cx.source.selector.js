/**
 * ContentTranslation Tools
 * A tool that allows editors to translate pages from one language
 * to another with the help of machine translation and other translation tools
 *
 * @file
 * @ingroup Extensions
 * @copyright See AUTHORS.txt
 * @license GPL-2.0+
 */
( function ( $, mw ) {
	'use strict';

	/**
	 * Do the content translation by goint to Special:CX
	 * with the given source-target title and target language
	 * @param {string} sourceTitle
	 * @param {string} targetTitle
	 * @param {string} sourceLanguage
	 * @param {string} targetLanguage
	 */
	function doCX( sourceTitle, targetTitle, sourceLanguage, targetLanguage ) {
		window.location.href = mw.util.getUrl(
			'Special:ContentTranslation', {
				page: sourceTitle,
				from: sourceLanguage,
				to: targetLanguage,
				targettitle: targetTitle
			}
		);
	}

	/**
	 * CXSourceSelector
	 * @class
	 */
	function CXSourceSelector( $trigger, options ) {
		this.$trigger = $( $trigger );
		this.options = options;
		this.$dialog = null;

		this.init();
	}

	/**
	 * Initialize the plugin.
	 */
	CXSourceSelector.prototype.init = function () {
		this.render();
		this.listen();
	};

	/**
	 * Listen for events.
	 */
	CXSourceSelector.prototype.listen = function () {
		var selector = this;

		// Open or close the dialog when clicking the link.
		// The dialog will be unitialized until the first click.
		this.$trigger.click( function () {
			selector.show();
		} );

		this.$sourceTitleInput.on( 'input', $.debounce( 100, false, function () {
			searchTitles( selector.$sourceLanguage.val(), $( this ).val() ).done( function ( response ) {
				var i, len, suggestions = response[ 1 ];
				selector.$titleList.empty();
				if ( suggestions.length ) {
					for ( i = 0, len = suggestions.length; i < len; i++ ) {
						selector.$titleList.append( $( '<option>' ).attr( 'value', suggestions[ i ] ) );
					}
				}
			} );
		} ) );
	};

	/**
	 * Show the CXSourceSelector dialog
	 */
	CXSourceSelector.prototype.show = function () {
		this.$dialog.removeClass( 'hidden' );
		this.position();
	};

	/**
	 * Position the CXSourceSelector dialog.
	 */
	CXSourceSelector.prototype.position = function () {
		var dialogTop, dialogLeft,
			dir = $( 'html' ).prop( 'dir' );

		// The default is to place the dialog near the element that triggers it
		dialogTop = this.options.top || this.$trigger.offset().top;
		dialogLeft = this.options.left || this.$trigger.offset().left;

		if ( dir === 'rtl' ) {
			dialogLeft = dialogLeft - this.$dialog.width();
		}

		this.$dialog.css( {
			top: dialogTop,
			left: dialogLeft
		} );
	};

	function searchTitles( language, input ) {
		var api = new mw.Api();

		return api.get( {
			action: 'opensearch',
			search: input,
			namespace: 0,
			suggest: true,
			format: 'json'
		}, {
			url: '//' + language + '.wikipedia.org/w/api.php',
			dataType: 'jsonp',
			// This prevents warnings about the unrecognized parameter "_"
			cache: true
		} );
	}
	/**
	 * Hide the entry point dialog.
	 */
	CXSourceSelector.prototype.hide = function () {
		this.$dialog.addClass( 'hidden' );
	};

	/**
	 * Start a new page translation in Special:CX
	 */
	CXSourceSelector.prototype.startPageInCX = function () {
		doCX( this.$sourceTitleInput.val(),
			this.$targetTitleInput.val(),
			this.$sourceLanguage.val(),
			this.$targetLanguage.val()
		);
	};

	/**
	 * Render the CXSourceSelector dialog.
	 */
	CXSourceSelector.prototype.render = function () {
		var $actions,
			$sourceLanguageLabel,
			$closeIcon, $heading, $targetLanguageLabel,
			index;

		this.$dialog = $( '<div>' )
			.addClass( 'cx-sourceselector-dialog hidden' );

		$closeIcon = $( '<span>' )
			.addClass( 'icon-close' )
			.click( $.proxy( this.hide, this ) );

		$heading = $( '<div>' ).addClass( 'cx-sourceselector-dialog__heading' )
			.text( mw.msg( 'cx-sourceselector-dialog-new-translation' ) )
			.prepend( $closeIcon );

		$sourceLanguageLabel = $( '<label>' ).addClass( 'cx-sourceselector-dialog__language-label' )
			.text( mw.msg( 'cx-sourceselector-dialog-source-language-label' ) );
		this.$sourceLanguage = $( '<select>' ).addClass( 'cx-sourceselector-dialog__language' )
			.text( $.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) ) );
		for ( index in this.options.sourceLanguages ) {
			this.$sourceLanguage.append( $( '<option>' )
				.attr( 'value', this.options.sourceLanguages[ index ] )
				.text( $.uls.data.getAutonym( this.options.sourceLanguages[ index ] ) ) );
		}
		$targetLanguageLabel = $( '<label>' ).addClass( 'cx-sourceselector-dialog__language-label' )
			.text( mw.msg( 'cx-sourceselector-dialog-target-language-label' ) );
		this.$targetLanguage = $( '<select>' ).addClass( 'cx-sourceselector-dialog__language' )
			.text( $.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) ) );
		for ( index in this.options.targetLanguages ) {
			this.$targetLanguage.append( $( '<option>' )
				.attr( {
					value: this.options.targetLanguages[ index ],
					selected: ( index === '1' )
				} )
				.text( $.uls.data.getAutonym( this.options.targetLanguages[ index ] ) ) );
		}
		this.$sourceTitleInput = $( '<input>' )
			.addClass( 'cx-sourceselector-dialog__title' )
			.attr( {
				name: 'sourceTitle',
				type: 'search',
				list: 'searchresults'
			} );
		this.$targetTitleInput = $( '<input>' )
			.addClass( 'cx-sourceselector-dialog__title' )
			.attr( {
				name: 'targetTitle'
			} );

		this.$translateFromButton = $( '<button>' )
			.addClass( 'mw-ui-button mw-ui-constructive cx-sourceselector-dialog__button-translate' )
			.text( mw.msg( 'cx-sourceselector-dialog-button-create-translation' ) )
			.click( $.proxy( this.startPageInCX, this ) );

		$actions = $( '<div>' ).addClass( 'cx-sourceselector-dialog__actions' )
			.append( this.$translateFromButton );

		this.$titleList = $( '<datalist>' ).prop( 'id', 'searchresults' );
		this.$dialog.append( $heading,
			$sourceLanguageLabel,
			this.$sourceLanguage,
			this.$sourceTitleInput,
			$('<br />'),
			$targetLanguageLabel,
			this.$targetLanguage,
			this.$targetTitleInput,
			$actions, this.$titleList
		);

		$( 'body' ).append( this.$dialog );
	};

	/**
	 * CXEntryPoint Plugin
	 */
	$.fn.cxSourceSelector = function ( options ) {
		return this.each( function () {
			var $this = $( this ),
				data = $this.data( 'cxsourceselector' );

			if ( !data ) {
				$this.data( 'cxsourceselector', ( data = new CXSourceSelector( this, options ) ) );
			}
		} );
	};

	$( function () {
		mw.hook( 'mw.cx.source.select' ).add( function () {
			var $container;
			$container = $( '.cx-widget__columns' );
			$container.empty().cxSourceSelector( {
				top: '150px',
				left: '33%',
				sourceLanguages: [ 'es', 'ca' ],
				targetLanguages: [ 'es', 'ca' ]
			} ).click();
		} );
	} );

}( jQuery, mediaWiki ) );
