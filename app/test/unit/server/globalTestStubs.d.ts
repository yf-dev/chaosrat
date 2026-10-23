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
// This script-style declaration applies to all included unit tests.
// `var` is required to expose this name on `globalThis` in a declaration file.
// eslint-disable-next-line no-var
declare var useRuntimeConfig: typeof import("nitropack/runtime/config").useRuntimeConfig;
