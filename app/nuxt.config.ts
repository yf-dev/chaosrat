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
    public: {},
  },
});
