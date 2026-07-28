// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ["@pinia/nuxt", "nuxt-gtag", "@nuxt/eslint"],

  // The favicon set (issue #7's brand mark, generated from
  // public/favicon.svg by scripts/generate-favicons.mjs). Applies to both
  // the builder page and the overlay since app.head is global. Deliberately
  // no site.webmanifest: ChaosRat is an OBS browser source plus a one-shot
  // URL builder, not an installable PWA, so there is nothing for a manifest
  // to declare -- don't add one by reflex.
  app: {
    head: {
      link: [
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    },
  },

  imports: {
    dirs: ["composables/**"],
  },

  components: [
    {
      path: "~/components",
      pathPrefix: false,
    },
  ],

  css: ["~/assets/css/main.css"],

  runtimeConfig: {
    twitchClientId: "", // can be overridden by NUXT_TWITCH_CLIENT_ID environment variable
    twitchClientSecret: "", // can be overridden by NUXT_TWITCH_CLIENT_SECRET environment variable
    chzzkClientId: "", // can be overridden by NUXT_CHZZK_CLIENT_ID environment variable
    chzzkClientSecret: "", // can be overridden by NUXT_CHZZK_CLIENT_SECRET environment variable
    public: {
      baseURL: "", // can be overridden by NUXT_PUBLIC_BASE_URL environment variable
    },
  },

  vite: {
    server: {
      allowedHosts: ["localhost", ".update.sh"],
    },
    define: {
      global: "window", // Prevent `H3Error: global is not defined` error caused by old `socket.io-client`
    },
  },

  compatibilityDate: "2025-02-13",
});
