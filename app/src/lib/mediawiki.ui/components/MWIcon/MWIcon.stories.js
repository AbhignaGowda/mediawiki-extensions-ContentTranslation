import { color, number, select, withKnobs } from "@storybook/addon-knobs";
import * as icons from "../icons";
import MwIcon from "./MWIcon.vue";

export default {
  title: "Components",
  component: MwIcon,
  parameters: { layout: "centered" }
};

export const Icons = () => ({
  components: { MwIcon },
  data: () => ({
    mwIconAdd: icons.mwIconAdd,
    icons,
    iconKeys: Object.keys(icons)
  }),
  props: {
    size: {
      default: number("Icon size", 24)
    },
    iconColor: {
      default: color("Icon color", "#000")
    },
    scriptDirection: {
      default: select(
        "Script direction",
        {
          "Left To Right": "ltr",
          "Right To Left": "rtl"
        },
        "ltr"
      )
    }
  },
  template: `<main :dir="scriptDirection">
    <div v-for="icon in iconKeys" v-key="icon">
      <mw-icon :title="icon" :icon="icons[icon]" :iconColor="iconColor" :size="size"/>
        {{icon}}
    </div>
    <p>Icons are by default flipped horizontally in RTL context. To prevent flipping, pass <code>flip:false</code> property.</p>
  </main>`
});