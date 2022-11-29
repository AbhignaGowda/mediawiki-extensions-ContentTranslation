import actions from "../../actions";
import PageSection from "@/wiki/cx/models/pageSection";
import SubSection from "@/wiki/cx/models/subSection";
import SectionSentence from "@/wiki/cx/models/sectionSentence";
import cxTranslatorApi from "@/wiki/cx/api/translator";
import Page from "@/wiki/mw/models/page";
import SectionSuggestion from "@/wiki/cx/models/sectionSuggestion";
import PublishFeedbackMessage from "@/wiki/cx/models/publishFeedbackMessage";

const mockErrorResult = {
  publishFeedbackMessage: new PublishFeedbackMessage({
    text: "Test publishing error",
    status: "publishing error",
  }),
  targetTitle: null,
};

const mockErrorPublishFeedbackMessageForSaving = new PublishFeedbackMessage({
  text: "Test saving error",
  status: "saving error",
});

jest.mock("@/wiki/cx/api/translator", () => ({
  publishTranslation: jest.fn(({ targetTitle }) => {
    // successful publishing
    if (targetTitle === "Test target article title 1") {
      return {
        publishFeedbackMessage: null,
        targetTitle: "successful result target title",
      };
    } else if (targetTitle === "Test target article title 2") {
      return mockErrorResult;
    }
  }),
}));

describe("vuex store publishTranslation action", () => {
  const subSectionNode = document.createElement("section");
  subSectionNode.setAttribute("id", "cxSourceSection1");
  const sectionSentenceNode = document.createElement("span");
  sectionSentenceNode.className = "cx-segment";
  sectionSentenceNode.innerHTML = "Target original sentence 1";
  subSectionNode.append(sectionSentenceNode);

  const sectionSentence = new SectionSentence({
    node: sectionSentenceNode,
    originalContent: "Target original sentence 1",
    translatedContent: "Target translated sentence 1",
  });
  sectionSentence.mtProviderUsed = "empty";

  const applicationState = {
    sourceLanguage: "en",
    targetLanguage: "es",
    currentSourceSection: new PageSection({
      id: 1,
      title: "Test section title 1",
      subSections: [
        new SubSection({ node: subSectionNode, sentences: [sectionSentence] }),
      ],
      isLeadSection: false,
    }),
    currentSectionSuggestion: new SectionSuggestion({
      sourceTitle: "Test source title 1",
      targetTitle: "Test target article title 1",
    }),
  };
  applicationState.currentSourceSection.translatedTitle =
    "Test target section title 1";

  const rootState = { application: applicationState };

  const rootGetters = {
    "application/getCurrentPage": new Page({ lastrevid: 11 }),
    "mediawiki/getSupportedMTProviders": () => ["Google", "Flores"],
    "application/isSandboxTarget": false,
  };
  const dispatch = jest.fn((action) => {
    if (action === "saveTranslation") {
      if (
        applicationState.currentSectionSuggestion?.targetTitle ===
        "Test target article title 3"
      ) {
        return mockErrorPublishFeedbackMessageForSaving;
      } else {
        return null;
      }
    }
  });

  it("should dispatch 'saveTranslation' action", async () => {
    await actions.publishTranslation({ rootState, rootGetters, dispatch });

    expect(dispatch).toHaveBeenCalledWith("saveTranslation");
  });

  it("should call api publishTranslation method with the proper payload", async () => {
    await actions.publishTranslation({ rootState, rootGetters, dispatch });

    expect(cxTranslatorApi.publishTranslation).toHaveBeenCalledWith({
      html: '<span class="cx-segment">Target translated sentence 1</span>',
      sourceTitle: "Test source title 1",
      targetTitle: "Test target article title 1",
      sourceSectionTitle: "Test section title 1",
      targetSectionTitle: "Test target section title 1",
      sourceLanguage: "en",
      targetLanguage: "es",
      revision: 11,
      isSandbox: false,
    });
  });

  it("should return an object with filled targetTitle and null publishFeedbackMessage on successful publishing", async () => {
    const feedbackMessage = await actions.publishTranslation({
      rootState,
      rootGetters,
      dispatch,
    });

    expect(feedbackMessage).toStrictEqual({
      publishFeedbackMessage: null,
      targetTitle: "successful result target title",
    });
  });

  it("should resolve to an object containing the publish feedback message that is returned by publishTranslation api method and an empty targetTitle, when publishing fails", async () => {
    applicationState.currentSectionSuggestion.targetTitle =
      "Test target article title 2";
    applicationState.currentSourceSection.subSections = [];
    const result = await actions.publishTranslation({
      rootState,
      rootGetters,
      dispatch,
    });
    expect(cxTranslatorApi.publishTranslation).toHaveReturnedWith(
      mockErrorResult
    );
    expect(result).toStrictEqual(mockErrorResult);
  });

  it("should resolve to an object containing the publish feedback message that is returned by saveTranslation api method and an empty targetTitle, when saving fails", async () => {
    applicationState.currentSectionSuggestion.targetTitle =
      "Test target article title 3";
    const result = await actions.publishTranslation({
      rootState,
      rootGetters,
      dispatch,
    });
    expect(dispatch).toHaveReturnedWith(
      mockErrorPublishFeedbackMessageForSaving
    );
    expect(result).toStrictEqual({
      publishFeedbackMessage: mockErrorPublishFeedbackMessageForSaving,
      targetTitle: null,
    });
  });

  it("should throw and error when no current section suggestion exists", async () => {
    applicationState.currentSectionSuggestion = null;

    try {
      await actions.publishTranslation({ rootState, rootGetters, dispatch });
    } catch (e) {
      expect(e.message).toBe(
        "Current source section cannot be empty during publishing"
      );
    }
  });
});
