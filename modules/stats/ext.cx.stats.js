/**
 * ContentTranslation Stats
 *
 * @file
 * @ingroup Extensions
 * @copyright See AUTHORS.txt
 * @license GPL-2.0+
 */
( function ( $, mw ) {
	'use strict';

	function CXStats( $container, options ) {
		this.$container = $container;
		this.sitemapper = options.siteMapper;
		this.sourceTargetModel = {};
		this.targetSourceModel = {};
		this.totalTranslationTrend = null;
		this.languageTranslatonTrend = null;
		this.$highlights = null;
		this.$graph = null;
	}

	CXStats.prototype.init = function () {
		var self = this,
			$spinner;

		$spinner = $( '<div>' )
			.addClass( 'cx-spinner cx-spinner--tools' )
			.append(
				$( '<div>' ).addClass( 'bounce1' ),
				$( '<div>' ).addClass( 'bounce2' ),
				$( '<div>' ).addClass( 'bounce3' )
			);
		this.$highlights = $( '<div>' ).addClass( 'cx-stats-highlights' );
		this.$graph = $( '<canvas>' ).attr( {
			id: 'cxtrend',
			width: this.$container.width() - 100, // Leave a 100px margin at right
			height: 400
		} );

		this.$container.append(
			$spinner,
			this.$highlights,
			$( '<h2>' ).text( mw.msg( 'cx-stats-published-translations-title' ) ),
			$( '<div>' ).addClass( 'cx-stats-trend' ).append( this.$graph )
		);

		$.when(
			this.getCXTrends(),
			this.getCXTrends( mw.config.get( 'wgContentLanguage' ) )
		).done( function ( totalTrend, languageTrend ) {
			self.totalTranslationTrend = totalTrend;
			self.languageTranslatonTrend = languageTrend;
			self.languageTranslatonTrend = mergeAndFill( totalTrend, languageTrend );
			self.renderHighlights();
			self.drawGraph();
		} );
		this.getCXStats().then( function ( data ) {
			if ( !data || !data.query ) {
				return;
			}
			$spinner.remove();
			self.drawCharts( data.query.contenttranslationstats );
		} );
	};

	CXStats.prototype.renderHighlights = function () {
		var total, langTotal, $total, $weeklyStats, localLanguage, langTrendLength, totalTrendLength,
			lastWeekTotal, lastWeekLangTotal, weekTrend = 0,
			weekLangTrend = 0,
			lastWeekLangTranslations, prevWeekLangTotal, lastWeekTranslations,
			prevWeekTotal, prevWeekTranslations, prevWeekLangTranslations;

		if ( this.totalTranslationTrend.length < 3 ) {
			// Trend calculation works if we have enough data
			return;
		}

		totalTrendLength = this.totalTranslationTrend.length;
		langTrendLength = this.languageTranslatonTrend.length;
		localLanguage = $.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) );
		total = this.totalTranslationTrend[ totalTrendLength - 1 ].count;

		lastWeekTotal = this.totalTranslationTrend[ totalTrendLength - 2 ].count;
		prevWeekTotal = this.totalTranslationTrend[ totalTrendLength - 3 ].count;
		lastWeekTranslations = lastWeekTotal - prevWeekTotal;
		prevWeekTranslations = prevWeekTotal -
			this.totalTranslationTrend[ totalTrendLength - 4 ].count;
		if ( prevWeekTranslations ) {
			weekTrend = ( ( lastWeekTranslations - prevWeekTranslations ) / prevWeekTranslations ) * 100;
		}
		weekTrend = parseInt( weekTrend );

		langTotal = this.languageTranslatonTrend[ langTrendLength - 1 ].count;
		lastWeekLangTotal = this.languageTranslatonTrend[ langTrendLength - 2 ].count;
		prevWeekLangTotal = this.languageTranslatonTrend[ langTrendLength - 3 ].count;
		lastWeekLangTranslations = lastWeekLangTotal - prevWeekLangTotal;
		prevWeekLangTranslations = prevWeekLangTotal - this.languageTranslatonTrend[ langTrendLength - 4 ].count;
		if ( prevWeekLangTranslations ) {
			weekLangTrend = ( lastWeekLangTranslations - prevWeekLangTranslations ) / prevWeekLangTranslations * 100;
		}
		weekLangTrend = parseInt( weekLangTrend );

		$total = $( '<div>' )
			.addClass( 'cx-stats-box' )
			.append(
				$( '<div>' ).addClass( 'cx-stats-box__title' ).text( mw.msg( 'cx-stats-total-published' ) ),
				$( '<div>' ).addClass( 'cx-stats-box__total' ).text( total ),
				$( '<div>' ).addClass( 'cx-stats-box__localtotal' )
				.text( mw.msg( 'cx-stats-local-published', langTotal, localLanguage ) )
			);

		$weeklyStats = $( '<div>' )
			.addClass( 'cx-stats-box' )
			.append(
				$( '<div>' ).addClass( 'cx-stats-box__title' ).text( mw.msg( 'cx-stats-weekly-published' ) ),
				$( '<div>' ).append(
					$( '<span>' ).addClass( 'cx-stats-box__total' ).text( lastWeekTranslations ),
					$( '<span>' )
					.addClass( 'cx-stats-box__trend ' + ( weekTrend >= 0 ? 'increase' : 'decrease' ) )
					.text( mw.msg( 'percent', weekTrend ) )
				),
				$( '<div>' ).addClass( 'cx-stats-box__localtotal' )
				.text( mw.msg( 'cx-stats-local-published',
					lastWeekLangTranslations + '(' + mw.msg( 'percent', weekLangTrend ) + ')', localLanguage ) )
			);
		this.$highlights.append( $total, $weeklyStats );
	};

	CXStats.prototype.drawCharts = function ( stats ) {
		this.transformJsonToModel( stats );
		this.$container.append(
			$( '<h2>' ).text( mw.msg( 'cx-stats-published-translations-title' ) ),
			createTabs( 'cx-stats-published', [
				{
					title: mw.msg( 'cx-stats-published-target-source' ),
					content: this.drawTranslationsChart( 'to', 'published', 'count' )
				},
				{
					title: mw.msg( 'cx-stats-published-source-target' ),
					content: this.drawTranslationsChart( 'from', 'published', 'count' )
				}
			] ),
			$( '<h2>' ).text( mw.msg( 'cx-stats-draft-translations-title' ) ),
			createTabs( 'cx-stats-draft', [
				{
					title: mw.msg( 'cx-stats-draft-target-source' ),
					content: this.drawTranslationsChart( 'to', 'draft', 'count' )
							},
				{
					title: mw.msg( 'cx-stats-draft-source-target' ),
					content: this.drawTranslationsChart( 'from', 'draft', 'count' )
				}
			] ),
			$( '<h2>' ).text( mw.msg( 'cx-stats-published-translators-title' ) ),
			createTabs( 'cx-stats-translators', [
				{
					title: mw.msg( 'cx-stats-published-target-source' ),
					content: this.drawTranslationsChart( 'to', 'published', 'translators' )
				},
				{
					title: mw.msg( 'cx-stats-published-source-target' ),
					content: this.drawTranslationsChart( 'from', 'published', 'translators' )
				}
			] )
		);
	};

	function createTabs( id, items ) {
		var $container, $content, i, $tabs, $tab, $expand;

		$container = $( '<div>' ).addClass( 'cx-stats-tabs-container' );
		$tabs = $( '<ul>' ).addClass( 'cx-stats-tabs' );
		$container.append( $tabs );
		for ( i = 0; i < items.length; i++ ) {
			$tab = $( '<li>' )
				.addClass( 'cx-stats-tabs-tabtitle' )
				.data( 'tab', id + 'tab-' + i )
				.text( items[ i ].title );
			$content = items[ i ].content
				.attr( 'id', id + 'tab-' + i )
				.addClass( 'cx-stats-tabs-tab-content cx-stats-tabs-collapsed' );

			if ( i === 0 ) {
				$tab.addClass( 'cx-stats-tabs-current' );
				$content.addClass( 'cx-stats-tabs-current' );
			}

			$tabs.append( $tab );
			$container.append( $content );
		}

		// Click handler for tabs
		$tabs.find( 'li' ).click( function () {
			var tabId = $( this ).data( 'tab' );

			$tabs.find( 'li' ).removeClass( 'cx-stats-tabs-current' );
			$container.find( '.cx-stats-tabs-tab-content' )
				.removeClass( 'cx-stats-tabs-current' );
			$( this ).addClass( 'cx-stats-tabs-current' );
			$( '#' + tabId ).addClass( 'cx-stats-tabs-current' );
		} );

		$expand = $( '<a>' )
			.addClass( 'cx-stats-tabs-toggle-all' )
			.text( mw.msg( 'cx-stats-tabs-expand' ) )
			.click( function () {
				$container.find( '.cx-stats-tabs-tab-content' )
					.removeClass( 'cx-stats-tabs-collapsed' );
				$( this ).remove();
			} );
		$container.append( $expand );

		return $container;
	}

	CXStats.prototype.drawTranslationsChart = function ( direction, status, property ) {
		var $chart, $bar, translations, $translations, model, i, j, $rows = [],
			$callout,
			$row, width, max = 0,
			$tail, tailWidth = 0,
			tail;

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
					.addClass( 'cx-stats-chart__row seperator' )
					.text( mw.msg( 'cx-stats-grouping-title', mw.language.convertNumber( max ) ) ) );
			}

			$callout = $( '<table>' ).addClass( 'cx-stats-chart__callout' );
			for ( j = 0; j < translations.length; j++ ) {
				width = ( translations[ j ][ property ] / max ) * 100;

				if ( width > 2 || j === 0 ) {
					// languages with more than 2% are represented in chart.
					$bar = $( '<span>' )
						.addClass( 'cx-stats-chart__bar' )
						.css( 'width', parseInt( width ) + '%' )
						.text( translations[ j ][ (
								direction === 'to' ? 'sourceLanguage' : 'targetLanguage' )
							] );

					$translations.append( $bar );
				} else {
					tail = true;
					tailWidth += width;
				}

				$callout.append( $( '<tr>' ).append(
					$( '<td>' ).addClass( 'cx-stats-chart__callout-count' ).text( translations[ j ][ property ] ),
					$( '<td>' ).addClass( 'cx-stats-chart__callout-lang' ).text( $.uls.data.getAutonym( translations[ j ][
							direction === 'to' ? 'sourceLanguage' : 'targetLanguage' ] ) )
				) );
			}

			if ( tail ) {
				$tail = $( '<span>' )
					.addClass( 'cx-stats-chart__bar tail' )
					.text( '…' )
					.css( 'width', tailWidth + '%' );
				$translations.append( $tail );
				/*jslint loopfunc: true */
				$tail.callout( {
						trigger: 'manual',
						direction: $.fn.callout.autoDirection( '0' ),
						content: $callout
					} ).on( 'mouseenter', function () {
						$( this ).callout( 'show' );
					} )
					.on( 'mouseleave', function () {
						$( this ).callout( 'hide' );
					} );
			}

			$row.append(
				$( '<span>' ).addClass( 'cx-stats-chart__langcode' ).text( model[ i ].language ),
				$( '<span>' ).addClass( 'cx-stats-chart__autonym' ).text( $.uls.data.getAutonym( model[ i ].language ) ),
				$( '<span>' ).addClass( 'cx-stats-chart__total' ).text( model[ i ][ property ] ),
				$translations
			);

			$rows.push( $row );
		}
		$chart.append( $rows );

		return $chart;
	};

	/**
	 * Get the Content Translation stats.
	 */
	CXStats.prototype.getCXStats = function () {
		return ( new mw.Api() ).get( {
			action: 'query',
			list: 'contenttranslationstats'
		} );
	};

	/**
	 * Get the Content Translation trend for the given target language.
	 * Fetch the number of translations to the given language.
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

	CXStats.prototype.drawGraph = function () {
		var data, cxTrendGraph, ctx;

		ctx = this.$graph[ 0 ].getContext( '2d' );

		data = {
			labels: $.map( this.totalTranslationTrend, function ( data ) {
				return data.date;
			} ),
			datasets: [
				{
					label: mw.message( 'cx-trend-all-translations' ).escaped(),
					strokeColor: '#FD6E8A',
					pointColor: '#FD6E8A',
					data: $.map( this.totalTranslationTrend, function ( data ) {
						return data.count;
					} )
					},
				{
					label: mw.message(
						'cx-trend-translations-to',
						$.uls.data.getAutonym( mw.config.get( 'wgContentLanguage' ) )
					).escaped(),
					strokeColor: '#80B3FF',
					pointColor: '#80B3FF',
					data: $.map( this.languageTranslatonTrend, function ( data ) {
						return data.count;
					} )
					}
				]
		};

		/*global Chart:false */
		cxTrendGraph = new Chart( ctx ).Line( data, {
			datasetFill: false,
			legendTemplate: '<ul><% for (var i=0; i<datasets.length; i++){%><li style=\"color:<%=datasets[i].strokeColor%>\"><%if(datasets[i].label){%><%=datasets[i].label%><%}%></li><%}%></ul>'
		} );

		this.$container.find( '.cx-stats-trend' ).append( cxTrendGraph.generateLegend() );
	};

	CXStats.prototype.transformJsonToModel = function ( records ) {
		var i, record, language, status, count, translators,
			sourceLanguage, targetLanguage,
			tempModel;

		this.sourceTargetModel.draft = {};
		this.targetSourceModel.draft = {};
		this.sourceTargetModel.published = {};
		this.targetSourceModel.published = {};
		// sourceModel['count']={};
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

	/**
	 * Sorts in descending order
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

	/**
	 * Sorts in descending order
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
	 * Fill the data in languageData to match with totalData length.
	 * @param {[Object]} totalData Array of total translation trend data
	 * @param {[Object]} totalData Array of translations to a particular language
	 * @return {[Object]} Array of translations to a particular language, after padding
	 */
	function mergeAndFill( totalData, languageData ) {
		var i,
			padding = [];

		if ( totalData.length === languageData.length ) {
			return languageData;
		}

		// Fill at the beginning if languageData is not starting
		// when totalData starts
		for ( i = 0; i < totalData.length; i++ ) {
			if ( !languageData || languageData.length === 0 ) {
				break;
			}

			if ( totalData[ i ].date === languageData[ 0 ].date ) {
				languageData = padding.concat( languageData );
			} else {
				padding.push( {
					date: totalData[ i ].date,
					count: 0
				} );
			}
		}

		// Fill at the end if languageData is shorter than totalData
		for ( i = languageData.length; i < totalData.length; i++ ) {
			languageData.push( {
				date: totalData[ i ].date,
				count: languageData.length ? languageData[ i - 1 ].count : 0
			} );
		}

		return languageData;
	}

	$( function () {
		var cxLink, cxstats,
			$header = $( '<div>' ).addClass( 'cx-widget__header' ),
			$container = $( '<div>' ).addClass( 'cx-stats-container' );

		// Set the global siteMapper for code which we cannot inject it
		mw.cx.siteMapper = new mw.cx.SiteMapper( mw.config.get( 'wgContentTranslationSiteTemplates' ) );
		$( 'body' ).append(
			$( '<div>' ).addClass( 'cx-widget' )
			.append( $header, $container )
		);
		$header.cxHeader( mw.cx.siteMapper );
		cxstats = new CXStats( $container, {
			siteMapper: new mw.cx.SiteMapper( mw.config.get( 'wgContentTranslationSiteTemplates' ) )
		} );
		cxstats.init();

		if ( mw.user.isAnon() ) {
			$( '.cx-header__bar' ).hide();
		}

		if ( !mw.user.isAnon() && mw.user.options.get( 'cx' ) !== '1' ) {
			cxLink = mw.util.getUrl( 'Special:ContentTranslation', {
				campaign: 'cxstats',
				targettitle: mw.config.get( 'wgPageName' ),
				to: mw.config.get( 'wgContentLanguage' )
			} );

			$( '.cx-header__bar' ).hide();
			mw.hook( 'mw.cx.error' ).fire( mw.message( 'cx-stats-try-contenttranslation', cxLink ) );
		} else {
			$header.find( '.cx-header__translation-center a' ).text( mw.msg( 'cx-header-new-translation' ) );
		}
	} );
}( jQuery, mediaWiki ) );
