/**
 * CX Message widget (dismissible banners)
 *
 * @class
 * @extends OO.ui.Widget
 * @mixins OO.ui.mixin.ItemWidget
 * @mixins OO.ui.mixin.LabelElement
 * @mixins OO.ui.mixin.FlaggedElement
 * @mixins OO.ui.mixin.TabIndexedElement
 *
 * @constructor
 * @param {Object} [config] Configuration options
 * @cfg {string} [type] Message type. One of 'success', 'error' or 'warning'.
 * @cfg {mediawiki.Message|string} [message] Main message.
 * @cfg {mediawiki.Message|string} [details] Additional details.
 * @cfg {OO.ui.ButtonWidget[]} [buttons] Array of additional buttons.
 */
mw.cx.ui.MessageWidget = function CXMessageWidget( config ) {
	var iconMap;
	// Configuration initialization
	config = config || {};

	// Parent constructor
	mw.cx.ui.MessageWidget.super.call( this, config );

	// Mixin constructors
	OO.ui.mixin.ItemWidget.call( this );
	OO.ui.mixin.LabelElement.call( this, {
		label: this.composeMessage( config.message, config.details )
	} );
	OO.ui.mixin.FlaggedElement.call( this, config );
	iconMap = {
		success: 'check',
		error: 'alert',
		warning: 'notice'
	};
	OO.ui.mixin.IconElement.call( this, {
		icon: iconMap[ config.type ] || config.type
	} );
	// Events
	this.closeButton = new OO.ui.ButtonWidget( {
		framed: false,
		icon: 'close',
		classes: [ 'cx-message-widget-close' ],
		tabIndex: -1
	} ).connect( this, { click: 'onCloseClick' } );

	// Initialization
	this.$element
		.addClass( 'cx-message-widget cx-message-' + config.type )
		.append( this.$icon, this.$label, this.closeButton.$element );
	this.addButtons( config.buttons );
};

/* Setup */

OO.inheritClass( mw.cx.ui.MessageWidget, OO.ui.Widget );
OO.mixinClass( mw.cx.ui.MessageWidget, OO.ui.mixin.ItemWidget );
OO.mixinClass( mw.cx.ui.MessageWidget, OO.ui.mixin.LabelElement );
OO.mixinClass( mw.cx.ui.MessageWidget, OO.ui.mixin.IconElement );
OO.mixinClass( mw.cx.ui.MessageWidget, OO.ui.mixin.FlaggedElement );

/* Methods */

/**
 * Handle close icon clicks
 */
mw.cx.ui.MessageWidget.prototype.onCloseClick = function () {
	this.$element.remove();
};

mw.cx.ui.MessageWidget.prototype.composeMessage = function ( message, details ) {
	var $message, $details;
	$message = $( '<span>' ).addClass( 'cx-message-widget-message' );
	$details = $( '<span>' ).addClass( 'cx-message-widget-details' );
	if ( message instanceof mw.Message ) {
		$message.html( message.parse() );
	} else {
		$message.text( message );
	}
	if ( details ) {
		if ( details instanceof mw.Message ) {
			$details.html( details.parse() );
		} else {
			$details.text( details );
		}
	}

	return $message.add( $details );
};

/**
 * @param {OO.ui.ButtonWidget[]} buttons Array of additional buttons.
 */
mw.cx.ui.MessageWidget.prototype.addButtons = function ( buttons ) {
	var $buttons = $( '<div>' ).addClass( 'cx-message-widget-buttons' );

	if ( !buttons ) {
		return;
	}

	buttons.forEach( function ( button ) {
		$buttons.append( button.$element );
	} );

	this.$element.append( $buttons );
};
