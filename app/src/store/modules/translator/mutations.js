export default {
  addTranslation(state, translation) {
    state.translations.push(translation);
  },
  removeTranslationBySectionTranslationId(state, idToBeRemoved) {
    state.translations = state.translations.filter(
      (translation) => translation.sectionTranslationId !== idToBeRemoved
    );
  },
  removeCXTranslation(state, idToBeRemoved) {
    state.translations = state.translations.filter(
      (translation) => translation.translationId !== idToBeRemoved
    );
  },
  setTranslationsLoaded: (state, value) => {
    state.translationsLoaded = value;
  },
  setTranslatorStats: (state, value) => {
    state.translatorStats = value;
  },
};
