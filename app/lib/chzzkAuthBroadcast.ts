// Framework-free cross-tab push for CHZZK auth state.
//
// CHZZK login lives in httpOnly cookies (see `chzzkConnection.ts`'s session
// lifecycle), so no tab can observe a login/logout directly -- each tab only
// ever learns about it by polling `/api/chzzk/me` on its own 60-second timer.
// That means a tab can keep showing "로그인이 필요합니다" for up to a minute
// after the user has already logged in in a different tab. This module lets
// whichever tab notices a change push it to every other tab immediately,
// instead of waiting for their own poll to catch up.
//
// Deliberately scoped independently of `useSharedConnection`'s chat channel
// (`chaosrat-chzzk-<channelId>`): that channel is per-configured-channel-id,
// but CHZZK auth is a single browser-wide login (one cookie jar, one
// account), so two tabs pointed at *different* channel ids must still share
// auth state. Hence the fixed, channel-id-independent `CHZZK_AUTH_CHANNEL_NAME`.
//
// Dependency-injected like `chzzkConnection.ts`: no direct `broadcast-channel`
// import here, so this is unit-testable in the `node` vitest project against
// a fake channel, without opening a real BroadcastChannel.

export type ChzzkAuthState =
  | { status: "AUTHENTICATED"; channelId: string; channelName: string }
  | { status: "LOGIN_REQUIRED" };

export const CHZZK_AUTH_CHANNEL_NAME = "chaosrat-chzzk-auth";

export interface AuthBroadcastChannel {
  postMessage(message: ChzzkAuthState): void;
  close(): void | Promise<void>;
  onmessage: ((message: ChzzkAuthState) => void) | null;
}

export interface ChzzkAuthBroadcastDeps {
  createChannel(name: string): AuthBroadcastChannel;
  onRemoteState(state: ChzzkAuthState): void;
}

function statesEqual(a: ChzzkAuthState, b: ChzzkAuthState): boolean {
  if (a.status !== b.status) return false;
  if (a.status === "AUTHENTICATED" && b.status === "AUTHENTICATED") {
    return a.channelId === b.channelId && a.channelName === b.channelName;
  }
  return true;
}

export function createChzzkAuthBroadcast(deps: ChzzkAuthBroadcastDeps) {
  const channel = deps.createChannel(CHZZK_AUTH_CHANNEL_NAME);
  let lastPublished: ChzzkAuthState | undefined;
  let closed = false;

  // `broadcast-channel` never delivers a message back to the tab that sent
  // it, so there is no self-echo case to filter out here -- every message
  // this handler sees genuinely came from another tab.
  channel.onmessage = (message) => {
    deps.onRemoteState(message);
  };

  function publish(state: ChzzkAuthState) {
    if (closed) return;
    if (lastPublished && statesEqual(lastPublished, state)) return;
    lastPublished = state;
    try {
      channel.postMessage(state);
    } catch {
      // The channel can be closed out from under us by the browser; the
      // caller is an auth-check path that must never break because
      // broadcasting failed.
    }
  }

  async function close() {
    if (closed) return;
    closed = true;
    await channel.close();
  }

  return { publish, close };
}

// Server-safe channel selection. `broadcast-channel` is a browser-only
// primitive: on the server it has no native BroadcastChannel and silently
// falls back to a filesystem transport (`/tmp/pubkey.bc/...`) that opens files
// and a polling loop per instance, leaking file descriptors on every SSR
// render until the process hits EMFILE. `createChzzkAuthBroadcast` opens its
// channel eagerly, so its call sites must never hand it a real channel factory
// on the server. Keeping that decision here -- rather than inline in a Vue SFC,
// where the compile-time `import.meta.client` flag can't be flipped by a test
// -- lets both branches be unit-tested.
export function createNoopAuthChannel(): AuthBroadcastChannel {
  return {
    postMessage() {},
    close() {},
    onmessage: null,
  };
}

export function selectAuthChannelFactory(
  // `import.meta.client` types as `boolean | undefined` in this Nuxt setup
  // (falsy during SSR), so this accepts the wider type rather than forcing
  // every call site to coerce it.
  isClient: boolean | undefined,
  openRealChannel: (name: string) => AuthBroadcastChannel,
): (name: string) => AuthBroadcastChannel {
  return (name) => (isClient ? openRealChannel(name) : createNoopAuthChannel());
}
