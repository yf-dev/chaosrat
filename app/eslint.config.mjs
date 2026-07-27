// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // Custom configs here.
  // Note: `.nuxt`, `.output`, `dist`, `node_modules`, and `public` are already
  // ignored by @nuxt/eslint-config's default `ignores()` config, so no
  // additional ignores entry is needed here.

  // `vue/html-self-closing` is part of eslint-plugin-vue's
  // "strongly-recommended" preset and, unlike most of its stylistic rules,
  // @nuxt/eslint does NOT gate it behind `features.stylistic` (off by
  // default here, see the module's vue.mjs chunk). Configured here (instead
  // of using the rule's own defaults, which fight Prettier) to match what
  // Prettier already produces throughout this repo: self-closed void
  // elements (`<img />`, `<br />`, `<input ... />`), self-closed empty
  // normal elements (`<div ... />`, `<slot />`), and self-closed empty
  // components (`<IconChevronUp ... />`, `<CuteChatBaseList ... />`). With
  // this config, `lint --fix` and `format` agree and no longer flip-flop the
  // same tags.
  {
    rules: {
      "vue/html-self-closing": [
        "error",
        {
          html: { void: "always", normal: "always", component: "always" },
          svg: "always",
          math: "always",
        },
      ],
    },
  },
);
