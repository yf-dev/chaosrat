import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { defineVitestProject } from "@nuxt/test-utils/config";

// Nuxt app root (this file lives at the app root already, but resolve
// explicitly so aliases behave the same regardless of cwd).
const appRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  test: {
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
          include: ["test/unit/*.test.ts"],
        },
      },
      await defineVitestProject({
        test: {
          name: "nuxt",
          globals: true,
          environment: "nuxt",
          include: ["test/nuxt/*.test.ts"],
        },
      }),
    ],
  },
});
