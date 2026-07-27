// Ambient type augmentation for the `useRuntimeConfig` stub that
// `installH3Globals()` (see `h3TestHelpers.ts`) and the individual
// `chzzkAuth{Login,Logout,Refresh}.test.ts` files assign directly onto
// `globalThis`, to simulate Nitro's build-time auto-import inside plain
// vitest (which never runs Nitro's unimport step). Nitro's real
// `useRuntimeConfig` only exists as a virtual-module auto-import, so
// `typeof globalThis` has no such property as far as TypeScript is
// concerned; without this declaration, any `globalThis.useRuntimeConfig`
// read or write is a TS2339 error.
//
// This file lives next to `h3TestHelpers.ts` because it exists purely to
// support that helper's stubbing pattern, and applies to every test file
// under this directory (a `declare global` in any included file augments
// the same global scope for the whole program) rather than needing to be
// repeated per file.
declare global {
  // `var` (not `let`/`const`) is required here: only a top-level `var`
  // inside `declare global` attaches to `globalThis`.
  var useRuntimeConfig: typeof import("nitropack/runtime/internal/config").useRuntimeConfig;
}

export {};
