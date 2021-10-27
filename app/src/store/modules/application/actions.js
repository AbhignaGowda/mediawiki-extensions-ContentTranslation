import Vue from "vue";
import SectionSuggestion from "../../../wiki/cx/models/sectionSuggestion";
import siteApi from "../../../wiki/mw/api/site";
import MTProviderGroup from "../../../wiki/mw/models/mtProviderGroup";
import { siteMapper } from "../../../utils/mediawikiHelper";

/**
 * This asynchronous action returns the current cxserver jwt token as string.
 * If no such token or current token is expired an api request to
 * fetch new token is being sent. If the api request fails, then
 * an empty string is returned.
 *
 * @param {object} context
 * @param {function} context.dispatch
 * @param {object} context.state
 * @param {function} context.commit
 * @return {Promise<string>}
 */
const getCXServerToken = async ({ dispatch, state, commit }) => {
  if (!state.cxServerToken) {
    await siteApi.fetchCXServerToken().then(
      token => {
        // Make sure token.age is configured to a valid value.
        if (token.age <= 30) {
          // Set the default token age
          token.age = 3600;
        }
        const now = Math.floor(Date.now() / 1000);
        // We use `age` instead of `exp` because it is more reliable, as user's
        // clocks might be set to wrong time.
        token.refreshAt = now + token.age - 30;
        commit("setCXServerToken", token);
      },
      errorCode => {
        if (errorCode === "token-impossible") {
          // Likely CX extension has not been configured properly.
          // To make development and testing easier, assume that
          // no token is needed.
          const now = Math.floor(Date.now() / 1000);
          // Set a dummy token with higher `refreshAt` time
          commit("setCXServerToken", { jwt: "", refreshAt: now + 3600 * 10 });
        }
      }
    );
  }
  const now = Math.floor(Date.now() / 1000);

  if (state.cxServerToken?.refreshAt <= now) {
    commit("setCXServerToken", null);

    return dispatch("getCXServerToken");
  }

  return state.cxServerToken?.jwt;
};

/**
 * @param {object} context
 * @param {function} context.dispatch
 * @param {FavoriteSuggestion} favorite
 * @return {Promise<void>}
 */
async function startFavoriteSectionTranslation({ dispatch }, favorite) {
  const suggestion = await dispatch(
    "suggestions/loadSectionSuggestion",
    {
      sourceLanguage: favorite.sourceLanguage,
      targetLanguage: favorite.targetLanguage,
      sourceTitle: favorite.title
    },
    { root: true }
  );
  dispatch("initializeSectionTranslation", suggestion);
}

/**
 * @param {object} context
 * @param {function} context.commit
 * @param {function} context.dispatch
 * @param {SectionSuggestion|ArticleSuggestion} suggestion
 */
function initializeSectionTranslation({ commit, dispatch }, suggestion) {
  dispatch("getCXServerToken");
  commit("setCurrentSectionSuggestion", suggestion);
}

/**
 * @param {object} context
 * @param {function} context.commit
 * @param {object} context.state
 * @param {object} context.getters
 * @param {function} context.dispatch
 * @param {string} newSourceLanguage
 * @return {Promise<void>}
 */
async function updateSourceLanguage(
  { commit, state, getters, dispatch },
  newSourceLanguage
) {
  // If newly selected source language is same as target language, swap languages
  if (newSourceLanguage === state.targetLanguage) {
    window.location.href = siteMapper.getCXUrl(
      null,
      null,
      newSourceLanguage,
      state.sourceLanguage,
      {}
    );

    return;
  }
  commit("setSourceLanguage", newSourceLanguage);

  // If translation has not started yet, re-fetch suggestions
  if (!state.currentSectionSuggestion) {
    dispatch("suggestions/initializeSuggestions", {}, { root: true });

    return;
  }

  const sourceTitle = getters.getCurrentLanguageTitleGroup.getTitleForLanguage(
    state.sourceLanguage
  );
  let suggestion = new SectionSuggestion({
    sourceLanguage: state.sourceLanguage,
    targetLanguage: state.targetLanguage,
    sourceTitle,
    missing: {}
  });

  if (getters.getCurrentLanguageTitleGroup.hasLanguage(state.targetLanguage)) {
    suggestion = await dispatch(
      "suggestions/loadSectionSuggestion",
      suggestion,
      { root: true }
    );
  }

  dispatch("initializeSectionTranslation", suggestion);
}

/**
 * @param {object} context
 * @param {function} context.commit
 * @param {object} context.state
 * @param {function} context.dispatch
 * @param {string} newTargetLanguage
 * @return {Promise<void>}
 */
async function updateTargetLanguage(
  { state, dispatch, commit },
  newTargetLanguage
) {
  // If newly selected target language is same as source language, swap languages
  const sourceLanguage =
    newTargetLanguage === state.sourceLanguage
      ? state.targetLanguage
      : state.sourceLanguage;

  window.location.href = siteMapper.getCXUrl(
    state.currentSectionSuggestion?.sourceTitle,
    null,
    sourceLanguage,
    newTargetLanguage,
    { sx: true }
  );
}

async function fetchCurrentSectionSuggestionLanguageTitles({
  dispatch,
  state
}) {
  const { sourceLanguage, sourceTitle } = state.currentSectionSuggestion;
  const payload = { language: sourceLanguage, title: sourceTitle };
  await dispatch("mediawiki/fetchLanguageTitles", payload, { root: true });
}

/**
 * Given a section title this action, sets the page section
 * with the matching title as current page section, if exists.
 * If not, the action fetches page sections from the API, then
 * sets the corresponding page section as current. In case when
 * no page section with the given title exists, null is set as
 * currentPageSection
 *
 * @param {object} context
 * @param {object} context.state
 * @param {function} context.commit
 * @param {function} context.dispatch
 * @param {object} context.getters
 * @param {string} sectionTitle
 * @return {Promise<void>}
 */
async function selectPageSectionByTitle(
  { state, commit, dispatch, getters },
  sectionTitle
) {
  const suggestion = state.currentSectionSuggestion;
  const page = getters.getCurrentPage;

  const setCurrentSectionByTitle = () => {
    const section = page.getSectionByTitle(sectionTitle);
    commit("setCurrentSourceSection", section);
  };

  if (!page.getSectionByTitle(sectionTitle)) {
    await dispatch("mediawiki/fetchPageContent", suggestion, { root: true });

    // Asynchronously resolve references and update page sections to
    // include this resolved references
    dispatch("mediawiki/resolvePageContentReferences", suggestion, {
      root: true
    }).then(() => setCurrentSectionByTitle());
  }

  setCurrentSectionByTitle();
}

/**
 * Given the index of a page section inside the current page's sections array,
 * this action sets the corresponding page section as current page section,
 * if exists. If not, the action fetches page sections from the API, then
 * sets the corresponding page section as current. In case when no page section
 * with the given index, null is set as currentPageSection
 *
 * @param {object} context
 * @param {object} context.state
 * @param {function} context.commit
 * @param {function} context.dispatch
 * @param {object} context.getters
 * @param {number} index
 * @return {Promise<void>}
 */
async function selectPageSectionByIndex(
  { state, commit, dispatch, getters },
  index
) {
  const suggestion = state.currentSectionSuggestion;
  const page = getters.getCurrentPage;

  const setCurrentSectionByIndex = () => {
    const section = page.sections?.[index];

    // If lead section set source page title as proposed page title
    if (index === 0) {
      Vue.set(
        section.proposedTitleTranslations,
        MTProviderGroup.ORIGINAL_TEXT_PROVIDER_KEY,
        page.title
      );
    }
    commit("setCurrentSourceSection", section);
  };

  if (!page.sections?.[index]) {
    await dispatch("mediawiki/fetchPageContent", suggestion, { root: true });

    // Asynchronously resolve references and update page sections to
    // include this resolved references
    dispatch("mediawiki/resolvePageContentReferences", suggestion, {
      root: true
    }).then(() => setCurrentSectionByIndex());
  }

  setCurrentSectionByIndex();
}

/**
 * @param commit
 * @param dispatch
 * @param state
 * @param id
 */
function selectSentenceForCurrentSection({ commit, dispatch, state }, { id }) {
  commit("clearSentenceSelection");
  commit("setIsSectionTitleSelectedForTranslation", false);

  if (id) {
    commit("selectSentence", id);
    dispatch("translateSelectedSegment", state.currentMTProvider);
  }
}

function applyTranslationToSelectedSegment(
  { state, commit, dispatch },
  { translation }
) {
  commit("setTranslationInProgress", true);
  const mutation = state.isSectionTitleSelectedForTranslation
    ? "setCurrentSourceSectionTitleTranslation"
    : "setSelectedSentenceTranslation";
  commit(mutation, translation);
  dispatch("selectNextSentence");
}

function applyProposedTranslationToSelectedSegment({ dispatch, getters }) {
  const translation = getters.getCurrentProposedTranslation;
  dispatch("applyTranslationToSelectedSegment", { translation });
}

function applyEditedTranslationToSelectedSegment(
  { state, dispatch },
  { translation }
) {
  const div = document.createElement("div");
  div.innerHTML = translation;
  // Remove dummy span node if exists. This node was only added so that VE doesn't add a new paragraph (which is done
  // by default when VE initial content is empty).
  div.querySelectorAll(".sx-edit-dummy-node").forEach(el => el.remove());
  translation = div.innerHTML;

  dispatch("applyTranslationToSelectedSegment", { translation });
}

/**
 * If no sentence is selected, findIndex will return -1
 * and first sentence in array will be selected
 * @param getters
 * @param dispatch
 * @param commit
 */
function selectNextSentence({ getters, dispatch, commit }) {
  commit("setIsSectionTitleSelectedForTranslation", false);
  const sentences = getters.getCurrentSourceSectionSentences;
  const nextIndex = getters.getCurrentSelectedSentenceIndex + 1;

  if (nextIndex >= sentences.length) {
    return;
  }
  dispatch("selectSentenceForCurrentSection", sentences[nextIndex]);
}

function selectPreviousSegment({ getters, dispatch }) {
  if (getters.isCurrentSentenceFirst) {
    dispatch("selectSectionTitleForTranslation");

    return;
  }
  const sentences = getters.getCurrentSourceSectionSentences;
  let selectedIndex = getters.getCurrentSelectedSentenceIndex;
  selectedIndex = (selectedIndex + sentences.length - 1) % sentences.length;
  dispatch("selectSentenceForCurrentSection", sentences[selectedIndex]);
}

/**
 * Checks if current MT provider exists and is valid for the
 * given language pair. If not, selects the first provider
 * among the supported ones and sets it as the current MT
 * provider.
 * @return {Promise<void>}
 */
async function initializeMTProviders({ state, dispatch, rootGetters, commit }) {
  const { sourceLanguage, targetLanguage } = state.currentSectionSuggestion;
  await dispatch(
    "mediawiki/fetchMTProviders",
    { sourceLanguage, targetLanguage },
    { root: true }
  );
  const supportedProviders = rootGetters["mediawiki/getSupportedMTProviders"](
    sourceLanguage,
    targetLanguage
  );

  const currentProvider = state.currentMTProvider;

  if (currentProvider && supportedProviders.includes(currentProvider)) {
    return;
  }

  commit("setCurrentMTProvider", supportedProviders[0]);
}

/**
 * @param commit
 * @param dispatch
 * @param provider
 */
function updateMTProvider({ commit, dispatch }, { provider }) {
  commit("setCurrentMTProvider", provider);
  dispatch("translateSelectedSegment", provider);
}

/**
 * Dispatched when sentence selector screen is loaded for first time or
 * when section title is being clicked inside "Pick a sentence" step
 *
 * @param {object} context
 * @param {function} context.commit
 * @param {function} context.dispatch
 * @param {object} context.state
 */
function selectSectionTitleForTranslation({ commit, dispatch, state }) {
  commit("clearSentenceSelection");
  commit("setIsSectionTitleSelectedForTranslation", true);

  // Dispatch translateSelectedSegment instead of translateSectionTitle,
  // so that following sentence is translated too
  dispatch("translateSelectedSegment", state.currentMTProvider);
}

/**
 * @param {object} context
 * @param {object} context.getters
 * @param {object} context.state
 * @param {function} context.dispatch
 * @param {string} provider
 */
function translateSelectedSegment({ getters, state, dispatch }, provider) {
  dispatch("translateFollowingSentence", provider);

  if (state.isSectionTitleSelectedForTranslation) {
    dispatch("translateSectionTitle", provider);

    return;
  }

  dispatch("translateSelectedSentence", provider);
}

/**
 * @param {object} context
 * @param {object} context.state
 * @param {object} context.getters
 * @param {function} context.dispatch
 * @param {string} provider
 * @return {Promise<void>}
 */
async function translateSectionTitle({ state, getters, dispatch }, provider) {
  if (state.currentSourceSection.translatedTitle) {
    return;
  }
  const {
    sourceLanguage,
    targetLanguage,
    translationExists
  } = state.currentSectionSuggestion;

  const page = getters.getCurrentPage;

  const originalContent = translationExists
    ? state.currentSourceSection.originalTitle
    : page.title;

  const translation = await dispatch(
    "mediawiki/translateSegment",
    { sourceLanguage, targetLanguage, provider, originalContent },
    { root: true }
  );

  Vue.set(
    state.currentSourceSection.proposedTitleTranslations,
    provider,
    translation
  );
}

/**
 * @param {object} context
 * @param {object} context.getters
 * @param {function} context.dispatch
 * @param {object} context.state
 * @param {string} provider
 * @return {Promise<void>}
 */
async function translateSelectedSentence(
  { getters, dispatch, state },
  provider
) {
  const selectedSentence = getters.getCurrentSelectedSentence;

  if (!selectedSentence || selectedSentence.proposedTranslations[provider]) {
    return;
  }

  const { sourceLanguage, targetLanguage } = state.currentSectionSuggestion;
  const { originalContent } = selectedSentence;

  const translation = await dispatch(
    "mediawiki/translateSegment",
    { sourceLanguage, targetLanguage, provider, originalContent },
    { root: true }
  );

  Vue.set(selectedSentence.proposedTranslations, provider, translation);
}

/**
 * @param {object} context
 * @param {object} context.getters
 * @param {function} context.dispatch
 * @param {object} context.state
 * @param {string} provider
 * @return {Promise<void>}
 */
async function translateFollowingSentence(
  { getters, dispatch, state },
  provider
) {
  const nextIndex = getters.getCurrentSelectedSentenceIndex + 1;
  const sentences = getters.getCurrentSourceSectionSentences;

  if (nextIndex >= sentences.length) {
    return;
  }

  const nextSentence = sentences[nextIndex];
  const { sourceLanguage, targetLanguage } = state.currentSectionSuggestion;
  const { originalContent } = nextSentence;

  const translation = await dispatch(
    "mediawiki/translateSegment",
    { sourceLanguage, targetLanguage, provider, originalContent },
    { root: true }
  );
  Vue.set(nextSentence.proposedTranslations, provider, translation);
}

/**
 * Dispatched when translation for all available MT providers
 * is needed (i.e. when user wants to select among available
 * MT translations), this action translates currently selected
 * segment (title or sentence) for all supported MT providers,
 * by dispatching "translateSelectedSegment" action .
 *
 * @param {object} context
 * @param {object} rootGetters
 * @param {function} dispatch
 * @param {object} state
 */
function translateSegmentForAllProviders({ rootGetters, dispatch, state }) {
  const { sourceLanguage, targetLanguage } = state.currentSectionSuggestion;
  const mtProviders = rootGetters["mediawiki/getSupportedMTProviders"](
    sourceLanguage,
    targetLanguage
  );
  mtProviders.forEach(provider =>
    dispatch("translateSelectedSegment", provider)
  );
}

function clearCurrentSectionSuggestion({ commit }) {
  commit("setCurrentSectionSuggestion", null);
}

export default {
  applyEditedTranslationToSelectedSegment,
  applyProposedTranslationToSelectedSegment,
  applyTranslationToSelectedSegment,
  clearCurrentSectionSuggestion,
  fetchCurrentSectionSuggestionLanguageTitles,
  getCXServerToken,
  initializeMTProviders,
  initializeSectionTranslation,
  selectNextSentence,
  selectPageSectionByTitle,
  selectPageSectionByIndex,
  selectPreviousSegment,
  selectSectionTitleForTranslation,
  selectSentenceForCurrentSection,
  startFavoriteSectionTranslation,
  translateFollowingSentence,
  translateSectionTitle,
  translateSegmentForAllProviders,
  translateSelectedSegment,
  translateSelectedSentence,
  updateMTProvider,
  updateSourceLanguage,
  updateTargetLanguage
};
