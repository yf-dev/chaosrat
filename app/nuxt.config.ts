// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ["@pinia/nuxt", "nuxt-gtag"],

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
      allowedHosts: ["localhost ", ".update.sh"],
    },
    define: {
      global: "window", // Prevent `H3Error: global is not defined` error caused by old `socket.io-client`
    },
  },

  compatibilityDate: "2025-02-13",
});