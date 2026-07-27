import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { defineVitestProject } from "@nuxt/test-utils/config";

// Nuxt app root (this file lives at the app root already, but resolve
// explicitly so aliases behave the same regardless of cwd).
const appRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "lib/**",
        "composables/**",
        "stores/**",
        "server/**",
        "components/**",
        "pages/**",
      ],
      // v8's coverage.include is matched with picomatch's `contains: true`
      // (vitest resolves paths this way, not anchored globbing), so a
      // pattern like "server/**" matches *any* path with a "server/"
      // segment anywhere in it -- including test/unit/server/h3TestHelpers.ts
      // (a test helper, not app code) and, if ever executed, files under
      // the generated .nuxt/.output trees (e.g. ".nuxt/dist/server/...").
      // Exclude those explicitly rather than narrowing `include`.
      exclude: ["test/**", ".nuxt/**", ".output/**"],
    },
    projects: [
      {
        resolve: {
          alias: {
            "~": appRoot,
            "@": appRoot,
          },
        },
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      await defineVitestProject({
        test: {
          name: "nuxt",
          globals: true,
          environment: "nuxt",
          include: ["test/nuxt/**/*.test.ts"],
        },
      }),
    ],
  },
});
