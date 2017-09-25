/*!
 * ContentTranslation Stats
 *
 * @ingroup Extensions
 * @copyright See AUTHORS.txt
 * @license GPL-2.0+
 */
( function ( $, mw ) {
	'use strict';

	/* global Chart:false */

	function CXStats( $container, options ) {
		this.$container = $container;
		this.sitemapper = options.siteMapper;
		this.sourceTargetModel = {};
		this.targetSourceModel = {};
		this.totalTranslationTrend = null;
		this.languageTranslationTrend = null;
		this.$highlights = null;
		this.$graph = null;
	}

	CXStats.prototype.init = function () {
		var self = this,
			$spinner;

		$spinner = mw.cx.widgets.spinner();
		this.$highlights = $( '<div>' ).addClass( 'cx-stats-highlights' );
		this.$container.append( $spinner, this.$highlights );

		$.when(
			this.getCXTrends(),
			this.getCXTrends( mw.config.get( 'wgContentLanguage' ) ),
			this.getCXStats()
		).done( function ( totalTrend, languageTrend, stats ) {
			// Remove spinner
			$spinner.remove();

			self.totalTranslationTrend = totalTrend.translations;
			self.totalDraftTrend = totalTrend.drafts;
			self.languageTranslationTrend = languageTrend.translations;
			self.languageDraftTrend = languageTrend.drafts;
			self.languageDeletionTrend = languageTrend.deletions;
			self.transformJsonToModel( stats[ 0 ].query.contenttranslationstats );
			// Now render them all
			self.renderHighlights();
			self.render();
		} );
	};

	/**
	 * Render the boxes at the top with the most interesting recent data.
	 */
	CXStats.prototype.renderHighlights = function () {
		var getTrend, info, infoLanguage, localLanguage,
			$total, $weeklyStats,
			weekLangTrendText, weekTrendText, weekTrendClass,
			$parenthesizedTrend, $trendInLanguage,
			fmt = mw.language.convertNumber; // Shortcut

		getTrend = function ( data ) {
			var thisWeek, total, trend,
				oneWeekAgoDelta, twoWeeksAgoDelta;

			if ( data.length < 3 ) {
				return;
			}

			thisWeek = data.length - 1;

			total = data[ thisWeek ].count;

			oneWeekAgoDelta = data[ thisWeek - 1 ].delta;
			twoWeeksAgoDelta = data[ thisWeek - 2 ].delta;

			if ( twoWeeksAgoDelta ) {
				trend = ( oneWeekAgoDelta - twoWeeksAgoDelta ) / twoWeeksAgoDelta * 100;
				trend = parseInt( trend, 10 );
			} else {
				trend = oneWeekAgoDelta ? 100 : 0;
			}

			return {
				total: total,
				trend: trend,
				lastWeek: oneWeekAgoDelta
			};
		};

		localLanguage = $.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) );
		info = getTrend( this.totalTranslationTrend );
		infoLanguage = getTrend( this.languageTranslationTrend );

		if ( !info || !infoLanguage ) {
			return;
		}

		$total = $( '<div>' )
			.addClass( 'cx-stats-box' )
			.append(
				$( '<div>' )
					.addClass( 'cx-stats-box__title' )
					.text( mw.msg( 'cx-stats-total-published' ) ),
				$( '<div>' )
					.addClass( 'cx-stats-box__total' )
					.text( fmt( info.total ) ),
				$( '<div>' )
					.addClass( 'cx-stats-box__localtotal' )
					.text( mw.msg(
						'cx-stats-local-published-number',
						fmt( infoLanguage.total ),
						fmt( localLanguage )
					) )
			);

		weekLangTrendText = mw.msg( 'percent', fmt( infoLanguage.trend ) );
		if ( infoLanguage.trend >= 0 ) {
			// Add the plus sign to make clear that it's an increase
			weekLangTrendText = '+' + weekLangTrendText;
		}

		weekTrendText = mw.msg( 'percent', fmt( info.trend ) );
		if ( info.trend >= 0 ) {
			// Add the plus sign to make clear that it's an increase
			weekTrendText = '+' + weekTrendText;
			weekTrendClass = 'increase';
		} else {
			weekTrendClass = 'decrease';
		}

		$parenthesizedTrend = $( '<span>' )
			// This is needed to show the plus or minus sign on the correct side
			.prop( 'dir', 'ltr' )
			.text( weekLangTrendText );
		$trendInLanguage = $( '<div>' )
			.addClass( 'cx-stats-box__localtotal' )
			.text( mw.msg(
				'cx-stats-local-published',
				fmt( infoLanguage.lastWeek ),
				localLanguage,
				'$3'
			) );
		$trendInLanguage.html( $trendInLanguage.html().replace(
			'$3',
			$parenthesizedTrend.get( 0 ).outerHTML
		) );

		$weeklyStats = $( '<div>' )
			.addClass( 'cx-stats-box' )
			.append(
				$( '<div>' )
					.addClass( 'cx-stats-box__title' )
					.text( mw.msg( 'cx-stats-weekly-published' ) ),
				$( '<div>' ).append(
					$( '<span>' )
						.addClass( 'cx-stats-box__total' )
						.text( fmt( info.lastWeek ) ),
					// nbsp is needed for separation between the numbers.
					// Without it the numbers appear in the wrong order in RTL environments.
					$( '<span>' )
						.html( '&#160;' ),
					$( '<span>' )
						.prop( 'dir', 'ltr' )
						.addClass( 'cx-stats-box__trend ' + weekTrendClass )
						.text( weekTrendText )
				),
				$trendInLanguage
			);

		this.$highlights.append( $total, $weeklyStats );
	};

	CXStats.prototype.render = function () {
		var self = this;

		this.$cumulativeGraph = $( '<canvas>' ).attr( {
			id: 'cxcumulative',
			width: this.$container.width() - 200, // Leave a 200px margin buffer to avoid overflow
			height: 400
		} );

		this.$languageCumulativeGraph = $( '<canvas>' ).attr( {
			id: 'cxlangcumulative',
			width: this.$container.width() - 200, // Leave a 200px margin buffer to avoid overflow
			height: 400
		} );

		this.$translatonTrendBarChart = $( '<canvas>' ).attr( {
			id: 'cxtrendchart',
			width: this.$container.width() - 200, // Leave a 200px margin buffer to avoid overflow
			height: 400
		} );

		this.$langTranslatonTrendBarChart = $( '<canvas>' ).attr( {
			id: 'cxlangtrendchart',
			width: this.$container.width() - 200, // Leave a 200px margin buffer to avoid overflow
			height: 400
		} );

		this.$container.append( $( '<h2>' ).text( mw.msg( 'cx-stats-all-translations-title' ) ) );
		this.createTabs(
			'cx-graph-total', [
				{
					title: mw.msg( 'cx-stats-cumulative-tab-title' ),
					content: $( '<div>' )
						.addClass( 'cx-stats-graph cx-stats-cumulative-total' )
						.append( this.$cumulativeGraph ),
					onVisible: function () {
						self.drawCumulativeGraph( 'count' );
					}
				},
				{
					title: mw.msg( 'cx-stats-weekly-trend-tab-title' ),
					content: $( '<div>' )
						.addClass( 'cx-stats-graph cx-stats-trend-total' )
						.append( this.$translatonTrendBarChart ),
					onVisible: function () {
						self.drawTranslationTrend();
					}
				}
			]
		);

		this.$container.append( $( '<h2>' ).text( mw.message(
			'cx-trend-translations-to',
			$.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) )
		).escaped() ) );
		this.createTabs(
			'cx-graph-language', [
				{
					title: mw.msg( 'cx-stats-cumulative-tab-title' ),
					content: $( '<div>' )
						.addClass( 'cx-stats-graph cx-stats-cumulative-lang' )
						.append( this.$languageCumulativeGraph ),
					onVisible: function () {
						self.drawLanguageCumulativeGraph( 'count' );
					}
				},
				{
					title: mw.msg( 'cx-stats-weekly-trend-tab-title' ),
					content: $( '<div>' )
						.addClass( 'cx-stats-graph cx-stats-trend-lang' )
						.append( this.$langTranslatonTrendBarChart ),
					onVisible: function () {
						self.drawLangTranslationTrend();
					}
				}
			]
		);

		this.$container.append( $( '<h2>' ).text( mw.msg( 'cx-stats-published-translations-title' ) ) );
		this.createTabs(
			'cx-stats-published', [
				{
					title: mw.msg( 'cx-stats-published-target-source' ),
					content: this.drawTranslationsChart( 'to', 'published', 'count' )
				},
				{
					title: mw.msg( 'cx-stats-published-source-target' ),
					content: this.drawTranslationsChart( 'from', 'published', 'count' )
				}
			],
			true
		);

		this.$container.append( $( '<h2>' ).text( mw.msg( 'cx-stats-draft-translations-title' ) ) );
		this.createTabs(
			'cx-stats-draft', [
				{
					title: mw.msg( 'cx-stats-draft-target-source' ),
					content: this.drawTranslationsChart( 'to', 'draft', 'count' )
				},
				{
					title: mw.msg( 'cx-stats-draft-source-target' ),
					content: this.drawTranslationsChart( 'from', 'draft', 'count' )
				}
			],
			true
		);

		this.$container.append( $( '<h2>' ).text( mw.msg( 'cx-stats-published-translators-title' ) ) );
		this.createTabs(
			'cx-stats-translators', [
				{
					title: mw.msg( 'cx-stats-published-target-source' ),
					content: this.drawTranslationsChart( 'to', 'published', 'translators' )
				},
				{
					title: mw.msg( 'cx-stats-published-source-target' ),
					content: this.drawTranslationsChart( 'from', 'published', 'translators' )
				}
			],
			true
		);
	};

	/**
	 * Create a tabbed container for holding related stats.
	 *
	 * @param {string} tabGroupId Tab group id
	 * @param {Object[]} items
	 * @param {boolean} expandable
	 */
	CXStats.prototype.createTabs = function ( tabGroupId, items, expandable ) {
		var $tabContainer, $content, i, $tabs, $tab, $expand;

		$tabContainer = $( '<div>' ).addClass( 'cx-stats-tabs-container' );
		$tabs = $( '<ul>' ).addClass( 'cx-stats-tabs' );
		$tabContainer.append( $tabs );
		this.$container.append( $tabContainer );
		for ( i = 0; i < items.length; i++ ) {
			$tab = $( '<li>' )
				.addClass( 'cx-stats-tabs-tabtitle' )
				.attr( 'about', tabGroupId + 'tab-' + i )
				.attr( 'data-itemid', i )
				.text( items[ i ].title );
			$content = items[ i ].content
				.attr( 'id', tabGroupId + 'tab-' + i )
				.addClass( 'cx-stats-tabs-tab-content cx-stats-tabs-collapsed' );
			$tabs.append( $tab );
			$tabContainer.append( $content );
			if ( i === 0 ) {
				$tab.addClass( 'cx-stats-tabs-current' );
				$content.addClass( 'cx-stats-tabs-current' );
				if ( items[ i ].onVisible ) {
					items[ i ].onVisible.apply( this );
					items[ i ].onVisible = null;
				}
			}
		}

		// Click handler for tabs
		$tabs.find( 'li' ).click( function () {
			var onVisible,
				$this = $( this ),
				tabId = $( this ).attr( 'about' ),
				itemId = $this.data( 'itemid' );

			$tabs.find( 'li' ).removeClass( 'cx-stats-tabs-current' );
			$tabContainer.find( '.cx-stats-tabs-tab-content' )
				.removeClass( 'cx-stats-tabs-current' );
			$( this ).addClass( 'cx-stats-tabs-current' );
			$( '#' + tabId ).addClass( 'cx-stats-tabs-current' );

			onVisible = items[ itemId ].onVisible;
			if ( onVisible ) {
				onVisible.apply( this );
				items[ itemId ].onVisible = null;
			}
		} );
		if ( expandable ) {
			$expand = $( '<a>' )
				.addClass( 'cx-stats-tabs-toggle-all' )
				.text( mw.msg( 'cx-stats-tabs-expand' ) )
				.click( function () {
					$tabContainer
						.find( '.cx-stats-tabs-tab-content' )
						.removeClass( 'cx-stats-tabs-collapsed' );
					$( this ).remove();
				} );
			$tabContainer.append( $expand );
		}
	};

	/**
	 * Sorts in descending order
	 * @param {number} a
	 * @param {number} b
	 * @return {number}
	 */
	function sortByCount( a, b ) {
		if ( parseInt( a.count ) > parseInt( b.count ) ) {
			return -1;
		}
		if ( parseInt( a.count ) < parseInt( b.count ) ) {
			return 1;
		}
		// a must be equal to b
		return 0;
	}

	/**
	 * Sorts in descending order
	 * @param {number} a
	 * @param {number} b
	 * @return {number}
	 */
	function sortByTranslators( a, b ) {
		if ( parseInt( a.translators ) > parseInt( b.translators ) ) {
			return -1;
		}
		if ( parseInt( a.translators ) < parseInt( b.translators ) ) {
			return 1;
		}
		// a must be equal to b
		return 0;
	}

	CXStats.prototype.drawTranslationsChart = function ( direction, status, property ) {
		var $chart, $bar, translations, $translations, model, i, j, $rows = [],
			$callout,
			$row, width, max = 0,
			$tail, tailWidth = 0,
			tail, langCode,
			$langCode, $autonym, $total, $rowLabelContainer,
			fmt = mw.language.convertNumber;

		$chart = $( '<div>' ).addClass( 'cx-stats-chart' );

		model = direction === 'to' ?
			this.targetSourceModel[ status ].sort(
				property === 'count' ? sortByCount : sortByTranslators
			) :
			this.sourceTargetModel[ status ].sort(
				property === 'count' ? sortByCount : sortByTranslators
			);

		for ( i = 0; i < model.length; i++ ) {
			$row = $( '<div>' ).addClass( 'cx-stats-chart__row' );

			$translations = $( '<span>' ).addClass( 'cx-stats-chart__bars' );
			translations = model[ i ].translations.sort(
				property === 'count' ? sortByCount : sortByTranslators
			);

			tail = false;
			tailWidth = 0;
			max = max || model[ 0 ][ property ];

			if (
				max / ( Math.ceil( model[ i ][ property ] / 100 ) * 100 ) >= 10 &&
				max >= 1000
			) {
				max = Math.ceil( model[ i ][ property ] / 100 ) * 100;
				$rows.push( $( '<div>' )
					.addClass( 'cx-stats-chart__row separator' )
					.text( mw.msg( 'cx-stats-grouping-title', fmt( max ) ) ) );
			}

			$callout = $( '<table>' ).addClass( 'cx-stats-chart__callout' );
			for ( j = 0; j < translations.length; j++ ) {
				width = ( translations[ j ][ property ] / max ) * 100;
				langCode = translations[ j ][ ( direction === 'to' ? 'sourceLanguage' : 'targetLanguage' ) ];

				if ( width > 2 || j === 0 ) {
					// languages with more than 2% are represented in chart.
					$bar = $( '<span>' )
						.addClass( 'cx-stats-chart__bar' )
						.prop( {
							lang: 'en',
							dir: 'ltr'
						} )
						.css( 'width', parseInt( width ) + '%' )
						.text( langCode );

					$translations.append( $bar );
				} else {
					tail = true;
					tailWidth += width;
				}

				$callout.append( $( '<tr>' ).append(
					$( '<td>' )
						.addClass( 'cx-stats-chart__callout-count' )
						.text( fmt( translations[ j ][ property ] ) ),
					$( '<td>' )
						.addClass( 'cx-stats-chart__callout-lang' )
						.prop( {
							lang: langCode,
							dir: $.uls.data.getDir( langCode )
						} )
						.text( $.uls.data.getAutonym( langCode ) )
				) );
			}

			if ( tail ) {
				$tail = $( '<span>' )
					.addClass( 'cx-stats-chart__bar tail' )
					.text( '…' )
					.css( 'width', tailWidth + '%' );
				$translations.append( $tail );
			}

			$translations.find( '.cx-stats-chart__bar' ).last().callout( {
				trigger: 'hover',
				classes: 'cx-stats-chart__callout-container',
				direction: $.fn.callout.autoDirection( '0' ),
				content: $callout
			} );

			$langCode = $( '<span>' )
				.addClass( 'cx-stats-chart__langcode' )
				// Always Latin (like English).
				// Make sure it's aligned correctly on all screen sizes.
				.prop( {
					lang: 'en',
					dir: 'ltr'
				} )
				.text( model[ i ].language );

			$autonym = $( '<span>' )
				.addClass( 'cx-stats-chart__autonym' )
				.prop( {
					lang: model[ i ].language,
					dir: $.uls.data.getDir( model[ i ].language )
				} )
				.text( $.uls.data.getAutonym( model[ i ].language ) );

			$total = $( '<span>' )
				.addClass( 'cx-stats-chart__total' )
				.text( fmt( model[ i ][ property ] ) );

			if ( direction === 'to' ) {
				$total = $( '<a>' )
					.addClass( 'cx-stats-chart__total' )
					.prop( 'href', mw.cx.siteMapper.getPageUrl(
						model[ i ].language, 'Special:NewPages', {
							tagfilter: 'contenttranslation'
						}
					) )
					.text( fmt( model[ i ][ property ] ) );
			} else {
				$total = $( '<span>' )
					.addClass( 'cx-stats-chart__total' )
					.text( fmt( model[ i ][ property ] ) );
			}

			$rowLabelContainer = $( '<span>' )
				.addClass( 'cx-stats-chart__row-label-container' )
				.append( $langCode, $autonym, $total );

			$row.append( $rowLabelContainer, $translations );

			$rows.push( $row );
		}

		$chart.append( $rows );

		return $chart;
	};

	/**
	 * Get the Content Translation stats.
	 * @return {jQuery.Promise}
	 */
	CXStats.prototype.getCXStats = function () {
		var api = new mw.Api();

		return api.get( {
			action: 'query',
			list: 'contenttranslationstats'
		} );
	};

	/**
	 * Get the Content Translation trend for the given target language.
	 * Fetch the number of translations to the given language.
	 *
	 * @param {string} targetLanguage Target language code
	 * @return {jQuery.Promise}
	 */
	CXStats.prototype.getCXTrends = function ( targetLanguage ) {
		return ( new mw.Api() ).get( {
			action: 'query',
			list: 'contenttranslationlangtrend',
			target: targetLanguage
		} ).then( function ( response ) {
			return response.query.contenttranslationlangtrend;
		} );
	};

	CXStats.prototype.drawCumulativeGraph = function ( type ) {
		var data, ctx;

		ctx = this.$cumulativeGraph[ 0 ].getContext( '2d' );

		data = {
			labels: $.map( this.totalTranslationTrend, function ( data ) {
				return data.date;
			} ),
			datasets: [
				{
					label: mw.msg( 'cx-stats-published-translations-label' ),
					fill: false,
					borderColor: '#36c',
					pointBorderColor: '#36c',
					pointBackgroundColor: '#36c',
					pointHoverBackgroundColor: '#FFFFFF',
					pointHoverBorderColor: '#36c',
					data: $.map( this.totalTranslationTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-stats-draft-translations-label' ),
					fill: false,
					borderColor: '#72777d',
					pointBorderColor: '#72777d',
					pointBackgroundColor: '#72777d',
					pointHoverBackgroundColor: '#FFFFFF',
					pointHoverBorderColor: '#72777d',
					data: $.map( this.totalDraftTrend, function ( data ) {
						return data[ type ];
					} )
				}
			]
		};

		// eslint-disable-next-line no-new
		new Chart( ctx, {
			type: 'line',
			data: data,
			options: {}
		} );
	};

	CXStats.prototype.drawLanguageCumulativeGraph = function ( type ) {
		var data, ctx;

		ctx = this.$languageCumulativeGraph[ 0 ].getContext( '2d' );

		data = {
			labels: $.map( this.languageTranslationTrend, function ( data ) {
				return data.date;
			} ),
			datasets: [
				{
					label: mw.msg( 'cx-stats-published-translations-label' ),
					fill: false,
					borderColor: '#36c',
					pointBorderColor: '#36c',
					pointBackgroundColor: '#36c',
					pointHoverBackgroundColor: '#FFFFFF',
					pointHoverBorderColor: '#36c',
					data: $.map( this.languageTranslationTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-stats-draft-translations-label' ),
					fill: false,
					borderColor: '#72777d',
					pointBorderColor: '#72777d',
					pointBackgroundColor: '#72777d',
					pointHoverBackgroundColor: '#FFFFFF',
					pointHoverBorderColor: '#72777d',
					data: $.map( this.languageDraftTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-trend-deletions' ),
					fill: false,
					borderColor: '#FF0000',
					pointBorderColor: '#FF0000',
					pointBackgroundColor: '#FF0000',
					pointHoverBackgroundColor: '#FFFFFF',
					pointHoverBorderColor: '#FF0000',
					data: $.map( this.languageDeletionTrend, function ( data ) {
						return data[ type ];
					} )
				}
			]
		};

		// eslint-disable-next-line no-new
		new Chart( ctx, {
			type: 'line',
			data: data,
			options: {}
		} );
	};

	CXStats.prototype.drawTranslationTrend = function () {
		var data, ctx, type = 'delta';

		ctx = this.$translatonTrendBarChart[ 0 ].getContext( '2d' );
		data = {
			labels: $.map( this.totalTranslationTrend, function ( data ) {
				return data.date;
			} ),
			datasets: [
				{
					label: mw.msg( 'cx-stats-published-translations-label' ),
					borderColor: '#36c',
					backgroundColor: '#36c',
					borderWidth: 1,
					data: $.map( this.totalTranslationTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-stats-new-draft-translations-label' ),
					borderColor: '#72777d',
					backgroundColor: '#72777d',
					borderWidth: 1,
					data: $.map( this.totalDraftTrend, function ( data ) {
						return data[ type ];
					} )
				}
			]
		};

		// eslint-disable-next-line no-new
		new Chart( ctx, {
			type: 'bar',
			data: data,
			options: {}
		} );
	};

	CXStats.prototype.drawLangTranslationTrend = function () {
		var ctx, data,
			type = 'delta';

		ctx = this.$langTranslatonTrendBarChart[ 0 ].getContext( '2d' );
		data = {
			labels: $.map( this.languageTranslationTrend, function ( data ) {
				return data.date;
			} ),
			datasets: [
				{
					label: mw.msg( 'cx-stats-published-translations-label' ),
					borderColor: '#36c',
					backgroundColor: '#36c',
					borderWidth: 1,
					data: $.map( this.languageTranslationTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-stats-new-draft-translations-label' ),
					borderColor: '#72777d',
					backgroundColor: '#72777d',
					borderWidth: 1,
					data: $.map( this.languageDraftTrend, function ( data ) {
						return data[ type ];
					} )
				},
				{
					label: mw.msg( 'cx-trend-deletions' ),
					borderColor: '#FF0000',
					backgroundColor: '#FF0000',
					borderWidth: 1,
					data: $.map( this.languageDeletionTrend, function ( data ) {
						return data[ type ];
					} )
				}
			]
		};

		// eslint-disable-next-line no-new
		new Chart( ctx, {
			type: 'bar',
			data: data,
			options: {}
		} );
	};

	CXStats.prototype.transformJsonToModel = function ( records ) {
		var i, record, language, status, count, translators,
			sourceLanguage, targetLanguage,
			tempModel;

		this.sourceTargetModel.draft = {};
		this.targetSourceModel.draft = {};
		this.sourceTargetModel.published = {};
		this.targetSourceModel.published = {};

		for ( i = 0; i < records.pages.length; i++ ) {
			record = records.pages[ i ];
			status = record.status;
			sourceLanguage = record.sourceLanguage;
			targetLanguage = record.targetLanguage;
			this.sourceTargetModel[ status ][ sourceLanguage ] = this.sourceTargetModel[ status ][ sourceLanguage ] || [];
			this.targetSourceModel[ status ][ targetLanguage ] = this.targetSourceModel[ status ][ targetLanguage ] || [];
			this.sourceTargetModel[ status ][ sourceLanguage ].push( record );
			this.targetSourceModel[ status ][ targetLanguage ].push( record );
		}

		for ( status in this.sourceTargetModel ) {
			tempModel = this.sourceTargetModel[ status ];
			this.sourceTargetModel[ status ] = [];
			for ( language in tempModel ) {
				if ( tempModel.hasOwnProperty( language ) ) {
					for ( count = 0, translators = 0, i = 0; i < tempModel[ language ].length; i++ ) {
						count += parseInt( tempModel[ language ][ i ].count );
						translators += parseInt( tempModel[ language ][ i ].translators );
					}
					this.sourceTargetModel[ status ].push( {
						language: language,
						translations: tempModel[ language ],
						count: count,
						translators: translators
					} );
				}
			}

			tempModel = this.targetSourceModel[ status ];
			this.targetSourceModel[ status ] = [];
			for ( language in tempModel ) {
				if ( tempModel.hasOwnProperty( language ) ) {
					for ( count = 0, translators = 0, i = 0; i < tempModel[ language ].length; i++ ) {
						count += parseInt( tempModel[ language ][ i ].count );
						translators += parseInt( tempModel[ language ][ i ].translators );
					}
					this.targetSourceModel[ status ].push( {
						language: language,
						translations: tempModel[ language ],
						count: count,
						translators: translators
					} );
				}
			}
		}
	};

	$( function () {
		var cxLink, cxstats, header, $header, $container;

		$header = $( '<div>' ).addClass( 'cx-widget__header' );
		$container = $( '<div>' ).addClass( 'cx-stats-container' );

		// Set the global siteMapper for code which we cannot inject it
		mw.cx.siteMapper = new mw.cx.SiteMapper( mw.config.get( 'wgContentTranslationSiteTemplates' ) );
		$( 'body' ).append(
			$( '<div>' ).addClass( 'cx-widget' ).append(
				$header, $container
			)
		);
		header = new mw.cx.ui.Header( {
			siteMapper: this.siteMapper,
			titleText: mw.msg( 'cx-stats-title' )
		} );
		$header.append( header.$element );
		cxstats = new CXStats( $container, {
			siteMapper: new mw.cx.SiteMapper( mw.config.get( 'wgContentTranslationSiteTemplates' ) )
		} );
		cxstats.init();

		if ( mw.user.isAnon() ) {
			$( '.cx-header__bar' ).hide();
		}

		if ( !mw.user.isAnon() &&
			mw.config.get( 'wgContentTranslationCampaigns' ).cxstats &&
			mw.user.options.get( 'cx' ) !== '1'
		) {
			cxLink = mw.util.getUrl( 'Special:ContentTranslation', {
				campaign: 'cxstats',
				to: mw.config.get( 'wgContentLanguage' )
			} );

			$( '.cx-header__bar' ).hide();
			mw.hook( 'mw.cx.error' ).fire( mw.message( 'cx-stats-try-contenttranslation', cxLink ) );
		} else {
			$header.find( '.cx-header__translation-center a' ).text( mw.msg( 'cx-header-new-translation' ) );
		}
	} );
}( jQuery, mediaWiki ) );
