'use strict';

/**
 * Section translation unit
 *
 * @class
 * @param {mw.cx.dm.TranslationUnit} model
 * @param {mw.cx.tools.TranslationToolFactory} toolFactory
 * @param {Object} config
 */
mw.cx.ui.SectionTranslationUnit = function MwCxUiSectionTranslationUnit( model, toolFactory, config ) {
	mw.cx.ui.SectionTranslationUnit.super.call( this, model, toolFactory, config );
	mw.cx.ui.mixin.AlignableTranslationUnit.call( this );
	// Click handler to translate need to execute only once.
	this.once( 'click', this.translate.bind( this ) );
};

/* Setup */
OO.inheritClass( mw.cx.ui.SectionTranslationUnit, mw.cx.ui.TranslationUnit );
OO.mixinClass( mw.cx.ui.SectionTranslationUnit, mw.cx.ui.mixin.AlignableTranslationUnit );

mw.cx.ui.SectionTranslationUnit.static.name = 'section';

mw.cx.ui.SectionTranslationUnit.static.matchTagNames = [ 'section' ];
mw.cx.ui.SectionTranslationUnit.static.highlightClass = 'cx-highlight';
mw.cx.ui.SectionTranslationUnit.static.tools = {
	search: [ 'click' ],
	formatter: [ 'select', 'click', 'focus' ],
	machinetranslation: [ 'click' ],
	dictionary: [ 'select' ],
	targetlink: {
		triggers: [ 'select' ],
		events: {
			addlink: 'addLink'
		}
	},
	newlink: {
		triggers: [ 'select' ],
		events: {
			addlink: 'addLink'
		}
	}
};

/**
 *  @inheritDoc
 */
mw.cx.ui.SectionTranslationUnit.prototype.init = function () {
	this.$sourceSection = this.createSourceSection( this.model );
	this.$translationSection = this.createTranslationSection( this.model );

	this.listen();
};

/**
 * @private
 * @param {mw.cx.dm.TranslationUnit} model
 * @return {jQuery}
 */
mw.cx.ui.SectionTranslationUnit.prototype.createSourceSection = function ( model ) {
	if ( model.sourceDocument.tagName === 'SECTION' || model.getParentTranslationUnit() !== null ) {
		// If the sourceDocument is <section> or a sub translation unit, dont wrap it with <section> tag.
		return $( model.sourceDocument );
	} else {
		// Wrap with <section> tag
		return $( '<section>' ).html( model.sourceDocument );
	}
};

/**
 * @private
 * @param {mw.cx.dm.TranslationUnit} model
 * @return {jQuery}
 */
mw.cx.ui.SectionTranslationUnit.prototype.createTranslationSection = function ( model ) {
	if ( model.targetDocument ) {
		return $( '<section>' ).html( model.targetDocument );
	} else {
		return this.getPlaceholderSection();
	}
};

mw.cx.ui.SectionTranslationUnit.prototype.getSourceSection = function () {
	return this.$sourceSection;
};

mw.cx.ui.SectionTranslationUnit.prototype.getTranslationSection = function () {
	return this.$translationSection;
};

/**
 * Get the placeholder
 * @return {jQuery} Placeholder section
 */
mw.cx.ui.SectionTranslationUnit.prototype.getPlaceholderSection = function () {
	return $( '<section>' )
		.addClass( 'cx-placeholder' )
		.text( mw.msg( 'cx-translation-add-translation' ) );
};

/**
 * Translate the section.
 * Either copy the source or use an MT tool to apply the initial translation
 */
mw.cx.ui.SectionTranslationUnit.prototype.translate = function () {
	this.removeHighlight();

	if ( !this.isTranslated() ) {
		mw.log( '[CX] Translating section: ' + this );
		// Adapt in general will be asynchronous operation
		this.model.adapt();
		this.setContent( this.model.targetDocument );
		this.buildSubTranslationUnits( this.model );
		this.emit( 'change' );
	} else {
		this.buildSubTranslationUnits( this.model );
	}

	if ( this.isEditable() ) {
		this.makeEditable( true );
	}
};

mw.cx.ui.SectionTranslationUnit.prototype.setContent = function ( content ) {
	if ( !content ) {
		return;
	}
	this.removePlaceholder();
	this.$translationSection.html( content );
};

mw.cx.ui.SectionTranslationUnit.prototype.removePlaceholder = function () {
	this.$translationSection.removeClass( 'cx-placeholder' );
};

mw.cx.ui.SectionTranslationUnit.prototype.isTranslated = function () {
	return !!this.model.targetDocument;
};

/**
 * @inheritDoc
 */
mw.cx.ui.SectionTranslationUnit.prototype.onMouseOver = function () {
	if ( !this.isTranslated() ) {
		this.highlight();
	}
};

/**
 * @inheritDoc
 */
mw.cx.ui.SectionTranslationUnit.prototype.onMouseLeave = function () {
	if ( !this.isTranslated() ) {
		this.removeHighlight();
	}
};

mw.cx.ui.SectionTranslationUnit.prototype.addLink = function () {
};

/* Register */
mw.cx.ui.translationUnitFactory.register( mw.cx.ui.SectionTranslationUnit );
