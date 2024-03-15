import { getUrl } from "@/utils/mediawikiHelper";
import { ref } from "vue";
import Translation from "@/wiki/cx/models/translation";

const sourceLanguageURLParameter = ref(null);
const targetLanguageURLParameter = ref(null);
const pageURLParameter = ref(null);
const sectionURLParameter = ref(null);
const draftURLParameter = ref(null);

/**
 * @param {SectionSuggestion|Translation|null} translationToBeStarted
 */
const setTranslationURLParams = (translationToBeStarted) => {
  const isDraftTranslation = translationToBeStarted instanceof Translation;
  const params = new URLSearchParams(location.search);
  // both SectionSuggestion and Translation models have the below properties
  params.set("page", translationToBeStarted?.sourceTitle);
  params.set("from", translationToBeStarted?.sourceLanguage);
  params.set("to", translationToBeStarted?.targetLanguage);

  pageURLParameter.value = translationToBeStarted?.sourceTitle;
  sourceLanguageURLParameter.value = translationToBeStarted?.sourceLanguage;
  targetLanguageURLParameter.value = translationToBeStarted?.targetLanguage;

  if (isDraftTranslation) {
    params.set("draft", true);
    draftURLParameter.value = true;
  }
  params.delete("title");
  replaceUrl(Object.fromEntries(params));
};

/**
 * @param {object} params A mapping of query parameter names to values,
 *  e.g. `{ action: 'edit' }`
 */
const replaceUrl = (params) => {
  history.replaceState(
    {},
    document.title,
    getUrl("Special:ContentTranslation", params)
  );
};

const initializeURLState = () => {
  const urlParams = new URLSearchParams(location.search);
  pageURLParameter.value = urlParams.get("page");
  sourceLanguageURLParameter.value = urlParams.get("from");
  targetLanguageURLParameter.value = urlParams.get("to");
  sectionURLParameter.value = urlParams.get("section");
};

const clearSectionURLParameter = () => {
  const urlParams = new URLSearchParams(location.search);

  sectionURLParameter.value = null;
  urlParams.delete("section");

  replaceUrl(Object.fromEntries(urlParams));
};

const setUrlParam = (param, value) => {
  const params = new URLSearchParams(location.search);
  params.set(param, value);
  replaceUrl(Object.fromEntries(params));
};

const getUrlParam = (param) => {
  const params = new URLSearchParams(location.search);

  return params.get(param);
};

const setLanguageURLParams = (sourceLanguage, targetLanguage) => {
  const params = new URLSearchParams(location.search);
  params.set("from", sourceLanguage);
  params.set("to", targetLanguage);

  sourceLanguageURLParameter.value = sourceLanguage;
  targetLanguageURLParameter.value = targetLanguage;
  params.delete("title");
  replaceUrl(Object.fromEntries(params));
};

const clearURLParameters = () => {
  sourceLanguageURLParameter.value = null;
  targetLanguageURLParameter.value = null;
  pageURLParameter.value = null;
  sectionURLParameter.value = null;

  replaceUrl(null);
};

const useURLHandler = () => {
  return {
    setLanguageURLParams,
    setTranslationURLParams,
    initializeURLState,
    clearURLParameters,
    clearSectionURLParameter,
    setUrlParam,
    getUrlParam,
    pageURLParameter,
    sourceLanguageURLParameter,
    targetLanguageURLParameter,
    sectionURLParameter,
    draftURLParameter,
  };
};

export default useURLHandler;
