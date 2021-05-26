import ExistingArticleBanner from "./ExistingArticleBanner";
import { mount, createLocalVue } from "@vue/test-utils";
import SectionSuggestion from "../../wiki/cx/models/sectionSuggestion";
import VueBananaI18n from "vue-banana-i18n";
import Vuex from "vuex";

const localVue = createLocalVue();
localVue.use(VueBananaI18n);
localVue.use(Vuex);

describe("SXTranslationConfirmer Existing Translation Banner Navigation test", () => {
  const sectionSuggestion = new SectionSuggestion({
    targetLanguage: "en",
    targetTitle: "Test target title",
    missing: {}
  });

  const applicationModule = {
    namespaced: true,
    state: { currentSectionSuggestion: sectionSuggestion }
  };
  const store = new Vuex.Store({
    modules: {
      application: applicationModule
    }
  });
  const wrapper = mount(ExistingArticleBanner, {
    localVue,
    store
  });

  it("Component output matches snapshot", () => {
    expect(wrapper.element).toMatchSnapshot();
  });
});
