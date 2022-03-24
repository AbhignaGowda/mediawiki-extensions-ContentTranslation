import MTProviderGroup from "../models/mtProviderGroup";
import { siteMapper } from "../../../utils/mediawikiHelper";

async function fetchSupportedLanguageCodes() {
  return await siteMapper
    .getLanguagePairs()
    .then((response) => response.sourceLanguages);
}

/**
 * Fetches supported MT providers for a given language pair
 * and returns a Promise that resolves to a read-only MTProviderGroup object
 * @param sourceLanguage
 * @param targetLanguage
 * @return {Promise<Readonly<MTProviderGroup>>}
 */
async function fetchSupportedMTProviders(sourceLanguage, targetLanguage) {
  const cxserverAPI = siteMapper.getCXServerUrl(
    `/list/pair/${sourceLanguage}/${targetLanguage}`
  );

  return fetch(cxserverAPI)
    .then((response) => response.json())
    .then((data) =>
      Object.freeze(
        new MTProviderGroup(sourceLanguage, targetLanguage, data.mt)
      )
    );
}

function fetchCXServerToken() {
  return new mw.Api().postWithToken("csrf", {
    action: "cxtoken",
    assert: "user",
  });
}

/**
 * Link the source and target articles in the Wikibase repo
 *
 * @param {string} sourceLanguage
 * @param {string} targetLanguage
 * @param {string} sourceTitle
 * @param {string} targetTitle
 * @returns {Promise}
 */
function addWikibaseLink(
  sourceLanguage,
  targetLanguage,
  sourceTitle,
  targetTitle
) {
  // If publishing doesn't happen at target wiki, return
  if (!mw.config.get("wgContentTranslationTranslateInTarget")) {
    return Promise.resolve();
  }

  // Current wiki is target wiki since publishing happens at target wiki
  const targetWikiId = mw.config.get("wgWikiID");
  const params = {
    action: "wblinktitles",
    fromsite: targetWikiId.replace(targetLanguage, sourceLanguage),
    fromtitle: sourceTitle,
    tosite: targetWikiId,
    totitle: targetTitle,
  };

  const api = new mw.ForeignApi("https://www.wikidata.org/w/api.php");

  return Promise.resolve(api.postWithToken("csrf", params));
}

export default {
  fetchSupportedLanguageCodes,
  fetchSupportedMTProviders,
  fetchCXServerToken,
  addWikibaseLink,
};
