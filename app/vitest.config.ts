import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Nuxt app root (this file lives at the app root already, but resolve
// explicitly so aliases behave the same regardless of cwd).
const appRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": appRoot,
      "@": appRoot,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
