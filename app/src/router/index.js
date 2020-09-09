import Vue from "vue";
import VueRouter from "vue-router";
import {
  Dashboard,
  SXArticleSelector,
  SXSectionSelector,
  SXContentComparator,
  SXSentenceSelector,
  SXQuickTutorial
} from "@/views";

Vue.use(VueRouter);

const routes = [
  {
    path: "",
    name: "dashboard",
    component: Dashboard,
    params: true,
    meta: { workflowStep: 0 }
  },
  {
    path: "/sx",
    name: "sx-article-selector",
    component: SXArticleSelector,
    params: true,
    meta: { workflowStep: 1 }
  },
  {
    path: "/sx/section-selector",
    name: "sx-section-selector",
    component: SXSectionSelector,
    params: true,
    meta: { workflowStep: 2 }
  },
  {
    path: "/sx/content-comparator",
    name: "sx-content-comparator",
    component: SXContentComparator,
    params: true,
    meta: { workflowStep: 3 }
  },
  {
    path: "/sx/quick-tutorial",
    name: "sx-quick-tutorial",
    component: SXQuickTutorial,
    params: true,
    meta: { workflowStep: 3.5 }
  },
  {
    path: "/sx/sentence-selector",
    name: "sx-sentence-selector",
    component: SXSentenceSelector,
    params: true,
    meta: { workflowStep: 4 }
  },
  {
    path: "*",
    name: "404",
    component: Dashboard,
    params: true,
    meta: { workflowStep: 0 }
  }
];

const router = new VueRouter({
  mode: "hash",
  routes
});

/**
 * Checks before each redirect that redirect is coming
 * from last required step. When so previous step exists
 * it redirects user to the beginning of the workflow (dashboard)
 */
router.beforeEach((to, from, next) => {
  const fromStep = from.meta.workflowStep;
  const toStep = to.meta.workflowStep;
  if (isNaN(fromStep) && toStep > 0) {
    next({ name: "dashboard" });
    return;
  }

  /**
   * Optional intermediate steps (e.g. SXQuickTutorial) can have decimal values
   * to indicate that there are not required for workflow. This way we only need
   * to check if previous required step (which should have an integer value) has
   * already been visited
   */
  const stepsDifference = Math.ceil(toStep) - Math.floor(fromStep);
  if (stepsDifference > 1) {
    const previousRequiredStep = Math.ceil(toStep) - 1;
    const previousRequiredRoute = routes.find(
      route => route.meta.workflowStep === previousRequiredStep
    );
    next({ name: previousRequiredRoute.name });
    return;
  }
  next();
});

export default router;