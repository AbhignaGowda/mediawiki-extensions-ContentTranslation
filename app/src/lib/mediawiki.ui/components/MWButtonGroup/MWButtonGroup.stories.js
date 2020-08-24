import { MwButtonGroup } from "../..";
import * as icons from "../icons";

export default {
  title: "Components/ButtonGroup",
  component: MwButtonGroup,
  parameters: { layout: "centered" }
};

export const ExampleButtonGroup = () => ({
  components: { MwButtonGroup },
  data: () => ({
    icons,
    active: "add",
    items: [
      {
        value: "add",
        props: {
          label: "Add",
          icon: icons.mwIconAdd
        }
      },
      {
        value: "remove",
        props: {
          label: "Remove",
          icon: icons.mwIconTrash
        }
      },
      {
        value: "edit",
        props: {
          label: "Edit",
          icon: icons.mwIconEdit
        }
      },
      {
        value: "verify",
        props: {
          label: "Verify",
          icon: icons.mwIconArticleCheck
        }
      }
    ]
  }),
  template: `<mw-button-group :items="items" :active="active" v-on:select="active = $event"></mw-button-group>`
});
