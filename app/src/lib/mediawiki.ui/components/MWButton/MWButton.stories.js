import { action } from "@storybook/addon-actions";
import { boolean, select, text } from "@storybook/addon-knobs";
import * as icons from "../icons";
import MwButton from "./MWButton.vue";

export default {
  title: "Components/Button",
  component: MwButton,
  parameters: { layout: "centered" }
};

export const Progressive = () => ({
  components: { MwButton },
  template: `<mw-button progressive label="Click me"/>`
});

export const Destructive = () => ({
  components: { MwButton },
  template: `<mw-button destructive label="Click me"/>`
});

export const TextButton = () => ({
  components: { MwButton },
  template: `<mw-button type="text" label="Click me"/>`
});

export const IconButton = () => ({
  components: { MwButton },
  data: () => ({
    icons
  }),
  template: `
    <section>
      <mw-button type="icon" :icon="icons.mwIconAdd"/>
      <mw-button type="icon" progressive :icon="icons.mwIconAdd"/>
      <mw-button type="icon" destructive :icon="icons.mwIconAdd"/>
    </section>
  `
});

export const LargeButton = () => ({
  components: { MwButton },
  data: () => ({
    icons
  }),
  template: `
  <section>
    <mw-button large label="Click me"/>
    <mw-button large progressive label="Click me"/>
    <mw-button large destructive :icon="icons.mwIconTrash" label="Click me"/>
  </section>
  `
});

export const Link = () => ({
  components: { MwButton },
  data: () => ({
    icons
  }),
  template: `
      <mw-button
        type="text"
        href="http://wikipedia.org"
        :icon="icons.mwIconWikipedia"
        label="Wikipedia"
      />
  `
});

export const ButtonWithIcons = () => ({
  components: { MwButton },
  data: () => ({
    icons
  }),
  template: `
    <section>
      <mw-button
        type="button"
        :icon="icons.mwIconAdd"
        :indicator="icons.mwIconExpand"
        label="Click me"/>
      <mw-button
        progressive
        type="button"
        :icon="icons.mwIconAdd"
        :indicator="icons.mwIconExpand"
        label="Click me"/>
      <mw-button
        destructive
        type="button"
        :icon="icons.mwIconAdd"
        :indicator="icons.mwIconExpand"
        label="Click me"/>
      <mw-button
        type="button"
        :icon="icons.mwIconAdd"
        />
      <mw-button
        progressive
        type="button"
        :icon="icons.mwIconAdd"
        />
      <mw-button
        destructive
        type="button"
        :icon="icons.mwIconAdd"
        />
    </section>
  `
});

export const DifferentButtons = () => ({
  components: { MwButton },
  data: () => ({
    icons
  }),
  props: {
    large: {
      default: boolean("Large button", false)
    },
    label: {
      default: text("Button label", "Button label")
    },
    href: {
      default: text("Button click target(href)", "")
    },
    outlined: {
      default: boolean("Outlined", false)
    },
    icon: {
      default: select("Icon", Object.keys(icons), "")
    },
    indicator: {
      default: select("Indicator", Object.keys(icons), "")
    },
    progressive: {
      default: boolean("Progressive", true)
    },
    destructive: {
      default: boolean("Destructive", false)
    },
    type: {
      default: select(
        "Button type",
        ["button", "toggle", "icon", "text"],
        "button"
      )
    },
    hasIndicatorClickListener: {
      default: boolean("Indicator click event listener", true)
    }
  },
  methods: {
    onIndicatorClick() {
      action("indicator-click")(`Clicked`);
    }
  },
  template: `
    <section>
    <p>Play with different properties using <strong>Knobs</strong></p>
    <mw-button
      :large="large"
      :progressive="progressive"
      :destructive="destructive"
      :outlined="outlined"
      :type="type"
      :icon="icons[icon]"
      :indicator="icons[indicator]"
      :href="href"
      :label="label"
      v-on="hasIndicatorClickListener ? { 'indicator-icon-clicked': onIndicatorClick } : {}"
    ></mw-button>
    </section>
  `
});
