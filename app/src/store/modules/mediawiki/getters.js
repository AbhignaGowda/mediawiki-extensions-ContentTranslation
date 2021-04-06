import MTProviderGroup from "../../../wiki/mw/models/mtProviderGroup";

export default {
  getPage: state => (language, title) =>
    state.pages.find(
      page =>
        page.language === language &&
        (page.title === title || page.alias === title)
    ),

  getLanguageTitleGroup: state => (language, title) =>
    state.languageTitleGroups.find(group =>
      group.titles.find(
        groupTitle => groupTitle.lang === language && groupTitle.title === title
      )
    ),

  getLanguageTitleGroupByWikidataId: state => wikidataId =>
    state.languageTitleGroups.find(group => group.wikidataId === wikidataId),

  getTitleByLanguageForGroup: (state, getters) => (wikidataId, language) =>
    (getters.getLanguageTitleGroupByWikidataId(wikidataId)?.titles || []).find(
      title => title.lang === language
    )?.title,

  /**
   * Get the language object for the given language code
   * @param {String} languageCode
   * @returns {Language}
   */
  getLanguage: state => languageCode =>
    state.languages.find(language => language.code === languageCode),

  getPageSection: state => (page, sectionTitle) => {
    return (page?.sections || []).find(
      section => section.originalTitle === sectionTitle
    );
  },

  /**
   * Get MTProviderGroup for the given language pair
   * @param {String} sourceLanguage
   * @param {String} targetLanguage
   * @returns {String[]} - Array of supported providers
   */
  getSupportedMTProviders: state => (sourceLanguage, targetLanguage) =>
    state.supportedMTProviderGroups.find(
      mtProviderGroup =>
        mtProviderGroup.sourceLanguage === sourceLanguage &&
        mtProviderGroup.targetLanguage === targetLanguage
    )?.providers || [],

  isValidProviderForTranslation: (state, getters) => (
    sourceLanguage,
    targetLanguage,
    provider
  ) =>
    getters
      .getSupportedMTProviders(sourceLanguage, targetLanguage)
      .includes(provider) &&
    provider !== MTProviderGroup.EMPTY_TEXT_PROVIDER_KEY
};
