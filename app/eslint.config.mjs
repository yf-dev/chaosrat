// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // Custom configs here.
  // Note: `.nuxt`, `.output`, `dist`, `node_modules`, and `public` are already
  // ignored by @nuxt/eslint-config's default `ignores()` config, so no
  // additional ignores entry is needed here.

  // `v-html` is this app's core, deliberate rendering mechanism: every chat
  // theme component renders `messageHtml(chat)`, whose only job (in
  // lib/utils.ts) is to run the raw message through `sanitize-html` before
  // emoji/sticker tags are spliced in. The XSS risk the rule warns about is
  // already mitigated at the source, so the warning is pure noise here.
  //
  // `vue/html-self-closing` is part of eslint-plugin-vue's
  // "strongly-recommended" preset and, unlike most of its stylistic rules,
  // @nuxt/eslint does NOT gate it behind `features.stylistic` (off by
  // default here, see the module's vue.mjs chunk). Left on, it fights
  // Prettier: Prettier always self-closes void elements (`<img />`), this
  // rule demands the opposite for void elements, and every `lint --fix` /
  // `format` pair would flip-flop the same tags forever. Prettier owns
  // formatting in this project, so this rule is turned off rather than
  // fought.
  {
    rules: {
      "vue/no-v-html": "off",
      "vue/html-self-closing": "off",
    },
  },

  // These 3 theme components intentionally pass `v-html` through to
  // <TextWithShadow>, relying on Vue's attribute-fallthrough to set
  // `innerHTML` on its single root element (see components/TextWithShadow.vue)
  // so the sanitized message picks up the shadow styling. Satisfying this
  // rule "properly" would mean giving TextWithShadow an `html` prop and
  // moving `v-html` inside its own template — a real component-API change,
  // out of scope for this lint/format setup task. Flagged for follow-up.
  {
    files: [
      "components/themes/DefaultChatList.vue",
      "components/themes/PureChatList.vue",
      "components/themes/SimpleChatList.vue",
    ],
    rules: {
      "vue/no-v-text-v-html-on-component": "off",
    },
  },

  // `sendData` is declared with `let` (no initializer) and assigned exactly
  // once later via destructuring, purely to break a circular dependency
  // between `connection` and `useSharedConnection` (see the comment above
  // its declaration). `const` isn't syntactically possible here since there's
  // no value at the declaration site, so `prefer-const` doesn't apply.
  {
    files: ["composables/chatPlatforms/useChzzk.ts"],
    rules: {
      "prefer-const": "off",
    },
  },

  // This handler `return`s a redirect via h3's `sendRedirect()` (typed
  // `Promise<void>`) alongside `ApiError` objects on other paths. h3 itself
  // uses this exact idiom (e.g. `serveStatic`'s `Promise<void | false>`) to
  // mean "the response was already sent, there's nothing more to return" —
  // it's a legitimate Nitro/h3 pattern, not a mistake.
  {
    files: ["server/api/chzzk/auth/callback.ts"],
    rules: {
      "@typescript-eslint/no-invalid-void-type": "off",
    },
  },
);
