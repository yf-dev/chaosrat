import { useTimeoutPoll } from "@vueuse/core";
import { BroadcastChannel } from "broadcast-channel";
import io from "socket.io-client";
import type {
  ApiError,
  ChatItem,
  ChzzkSessionOpenResponse,
  ApiOk,
  ChatPlatformError,
  ChzzkMeResponse,
  ChzzkAuthLoginResponse,
  ChzzkChatChannelIdResponse,
  ChzzkSessionListResponse,
} from "~/lib/interfaces";
import {
  createChzzkConnection,
  type ChzzkChatSessionMessage,
  type ChzzkSessionMessageData,
} from "~/lib/chzzkConnection";
import {
  createChzzkAuthBroadcast,
  type ChzzkAuthState,
} from "~/lib/chzzkAuthBroadcast";
import { toLiveSignal, toSubscriptionHealth } from "~/lib/chzzkSignals";
import { useSharedConnection } from "../useSharedConnection";

interface ChzzkMessage {
  chatItem: ChzzkChatSessionMessage;
  timestamp: number;
}

function handleChzzkEmojis(message: ChzzkChatSessionMessage) {
  const emojis: { [key: string]: string } = {};
  const originalEmojis =
    (typeof message.emojis === "string" ? {} : message.emojis) ?? {};
  for (const [id, url] of Object.entries(originalEmojis)) {
    emojis[`{:${id}:}`] = url;
  }
  return emojis;
}

function handleChzzkBadges(message: ChzzkChatSessionMessage) {
  const badges: { [key: string]: string } = {};
  for (let i = 0; i < message.profile.badges.length; i++) {
    const badge = message.profile.badges[i];
    badges[`chzzk/${i}`] = badge.imageUrl;
  }
  if (message.profile.verifiedMark) {
    badges["chzzk/verified"] =
      "https://ssl.pstatic.net/static/nng/glive/icon/verified.png";
  }
  return badges;
}

export function useChzzk(options: {
  /**
   * Callback when a broadcaster message is received
   * @param message The message received
   * @returns true if the message is handled, false otherwise
   */
  onBroadcasterMessage?: (message: string) => boolean;
}) {
  const requestUrl = useRequestURL();
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);
  const messages = ref<ChzzkMessage[]>([]);
  const errors = ref<ChatPlatformError[]>([]);

  const chatItems = computed(() => {
    return messages.value.map((message) => {
      const emojis = handleChzzkEmojis(message.chatItem);
      const badges = handleChzzkBadges(message.chatItem);
      return {
        platform: "chzzk",
        id: `chzzk-${message.chatItem.messageTime}`,
        nickname: message.chatItem.profile.nickname,
        message: message.chatItem.content,
        timestamp: message.timestamp,
        extra: {
          emojis: emojis,
          badges: badges,
        },
      } as ChatItem;
    });
  });

  const sharedChannelName = computed(() => {
    if (!chatOptions.value.chzzkChannelId) return undefined;
    return `chaosrat-chzzk-${chatOptions.value.chzzkChannelId}`;
  });

  // `sendData` (from useSharedConnection) and `connection` (from
  // createChzzkConnection) each need to reference the other: the connection's
  // `onEvent` dep forwards to `sendData`, and useSharedConnection's
  // onBecomeLeader/onLoseLeader callbacks need to call `connection.start()` /
  // `connection.stop()`. Declare `connection` first and have its `onEvent`
  // call `sendData` through a closure over the `let` below, which is assigned
  // once useSharedConnection has run. No initializer is possible at the
  // declaration site, so `const` can't apply here.
  // eslint-disable-next-line prefer-const -- no initializer available at the declaration site; assigned exactly once via destructuring below
  let sendData: (data: ChzzkSessionMessageData) => void;

  const connection = createChzzkConnection({
    fetchSessionUrl: async () => {
      if (!chatOptions.value.chzzkChannelId) {
        return { status: "ERROR" };
      }
      const data = await $fetch<ChzzkSessionOpenResponse | ApiError>(
        "/api/chzzk/session/open",
        {
          method: "POST",
          timeout: 5000,
        },
      );
      if (data.status === "OK") {
        return { status: "OK", url: data.url };
      }
      if (data.code === "not_logged_in" || data.code === "unauthorized") {
        return { status: "UNAUTHORIZED" };
      }
      return { status: "ERROR", code: data.code };
    },
    refreshToken: async () => {
      const result = await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh", {
        method: "POST",
        timeout: 5000,
      });
      return result.status === "OK";
    },
    createSocket: (url, handlers) => {
      const socket = io.connect(url, {
        reconnection: false,
        forceNew: true,
        timeout: 3000,
        transports: ["websocket"],
      });
      socket.on("connect", () => handlers.onConnect());
      socket.on("disconnect", () => handlers.onDisconnect());
      socket.on("connect_error", (err: unknown) => handlers.onError(err));
      socket.on("connect_timeout", (err: unknown) => handlers.onError(err));
      socket.on("error", (err: unknown) => handlers.onError(err));
      socket.on("SYSTEM", (raw: string) => handlers.onMessage("SYSTEM", raw));
      socket.on("CHAT", (raw: string) => handlers.onMessage("CHAT", raw));
      socket.on("DONATION", (raw: string) =>
        handlers.onMessage("DONATION", raw),
      );
      return {
        close: () => socket.close(),
      };
    },
    subscribeChat: async (sessionKey) => {
      try {
        const data = await $fetch<ApiOk | ApiError>(
          "/api/chzzk/session/subscribeChat",
          {
            method: "POST",
            body: { sessionKey },
            timeout: 5000,
          },
        );
        if (data.status === "ERROR") {
          console.log(`Chzzk subscribeChat Error: ${data.error}`);
          return false;
        }
        console.log("Chat subscribed successfully");
        return true;
      } catch (error) {
        console.log("Chzzk subscribeChat Error");
        console.error(error);
        return false;
      }
    },
    unsubscribeChat: async (sessionKey) => {
      try {
        const data = await $fetch<ApiOk | ApiError>(
          "/api/chzzk/session/unsubscribeChat",
          {
            method: "POST",
            body: { sessionKey },
            timeout: 5000,
          },
        );
        if (data.status === "ERROR") {
          console.log(`Chzzk unsubscribeChat Error: ${data.error}`);
          return false;
        }
        console.log("Chat unsubscribed successfully");
        return true;
      } catch (error) {
        console.log("Chzzk unsubscribeChat Error");
        console.error(error);
        return false;
      }
    },
    onEvent: (data) => {
      sendData(data);
    },
    onAuthRequired: (required) => {
      if (required) {
        showLoginError();
      } else {
        hideLoginError();
      }
    },
    // Watchdog probes for the "new broadcast started under a still-healthy
    // socket" bug: CHZZK can drop the CHAT subscription server-side on a
    // stream transition while the socket itself stays connected, so nothing
    // in the socket lifecycle ever notices. Both deps are best-effort
    // diagnostics layered on top of the unofficial/scope-uncertain HTTP
    // endpoints below; see lib/chzzkConnection.ts for how the watchdog
    // treats their results (never reconnects on UNKNOWN, only on a
    // confirmed OPEN-with-new-id or a confirmed LOST).
    fetchLiveSignal: async () => {
      if (!chatOptions.value.chzzkChannelId) {
        return { status: "UNKNOWN" };
      }
      try {
        const data = await $fetch<ChzzkChatChannelIdResponse | ApiError>(
          "/api/chzzk/chatChannelId",
          {
            query: { channelId: chatOptions.value.chzzkChannelId },
            timeout: 5000,
          },
        );
        const signal = toLiveSignal(data);
        if (signal.status === "OPEN" && signal.chatChannelId) {
          // This is the line that shows a new broadcast being detected.
          console.log("Chzzk live signal: chatChannelId", signal.chatChannelId);
        }
        return signal;
      } catch (error) {
        console.log("Chzzk fetchLiveSignal Error");
        console.error(error);
        return { status: "UNKNOWN" };
      }
    },
    fetchSubscriptionHealth: async (sessionKey) => {
      // The approved Chzzk Open API scopes do permit GET /open/v1/sessions --
      // verified against a live login (see server/api/chzzk/session/list.ts).
      // Any failure that does happen resolves to "UNKNOWN" below (via the
      // ERROR envelope branch) and the watchdog degrades to the live-signal
      // trigger alone -- by design, not a bug to work around.
      try {
        const data = await $fetch<ChzzkSessionListResponse | ApiError>(
          "/api/chzzk/session/list",
          { timeout: 5000 },
        );
        if (data.status === "ERROR") {
          console.log(
            `Chzzk fetchSubscriptionHealth Error (UNKNOWN): ${data.error}`,
          );
          return "UNKNOWN";
        }
        const health = toSubscriptionHealth(
          data.sessions,
          sessionKey,
          chatOptions.value.chzzkChannelId,
        );
        if (health === "LOST") {
          const session = data.sessions.find(
            (s) => s.sessionKey === sessionKey,
          );
          console.log("Chzzk subscription health: LOST", session);
        } else if (health === "UNKNOWN") {
          console.log(
            `Chzzk subscription health: UNKNOWN (session ${sessionKey} absent from list -- list is paginated, this is not proof of loss)`,
          );
        }
        return health;
      } catch (error) {
        console.log("Chzzk fetchSubscriptionHealth Error (UNKNOWN)");
        console.error(error);
        return "UNKNOWN";
      }
    },
  });

  ({ sendData } = useSharedConnection<ChzzkSessionMessageData>(
    sharedChannelName,
    {
      onBecomeLeader: () => {
        connection.start();
      },
      onLoseLeader: () => {
        void connection.stop();
      },
      onData: (data) => {
        if (data.type === "SYSTEM") {
          if (data.message.type === "connected") {
            console.log("Chzzk Connected", data.message);
          } else if (data.message.type === "subscribed") {
            console.log("Chzzk Subscribed", data.message);
          } else if (data.message.type === "unsubscribed") {
            console.log("Chzzk Unsubscribed", data.message);
          } else if (data.message.type === "revoked") {
            console.log("Chzzk Revoked", data.message);
          } else {
            console.log("Chzzk Unknown System Message", data.message);
          }
        } else if (data.type === "CHAT") {
          console.log("Chzzk CHAT", data.message);
          if (options.onBroadcasterMessage) {
            if (data.message.senderChannelId === data.message.channelId) {
              if (options.onBroadcasterMessage(data.message.content)) {
                return;
              }
            }
          }
          messages.value.push({
            chatItem: data.message,
            timestamp: new Date().getTime(),
          });
          if (chatOptions.value.maxChatSize !== undefined) {
            if (messages.value.length > chatOptions.value.maxChatSize) {
              messages.value = messages.value.slice(
                messages.value.length - chatOptions.value.maxChatSize,
              );
            }
          }
        } else if (data.type === "DONATION") {
          console.log("Chzzk DONATION", data.message);
        }
      },
    },
  ));

  // Cross-tab push for CHZZK auth state (see lib/chzzkAuthBroadcast.ts) --
  // lets a tab that just noticed a login/logout push it to every other tab
  // immediately, instead of every tab waiting up to 60s for its own poll.
  const authBroadcast = createChzzkAuthBroadcast({
    createChannel: (name) => new BroadcastChannel(name),
    onRemoteState: (state) => void handleRemoteAuthState(state),
  });

  function showLoginError() {
    if (errors.value.find((error) => error.id === "chzzk-login")) {
      return;
    }
    errors.value.push({
      id: "chzzk-login",
      platform: "chzzk",
      message: "치지직 로그인이 필요합니다. 이 메시지를 클릭해 로그인하세요.",
      onClick: async () => {
        try {
          const response = await $fetch<ChzzkAuthLoginResponse | ApiError>(
            "/api/chzzk/auth/login",
            {
              query: {
                redirectTo: `${requestUrl.pathname}${requestUrl.search}`,
              },
            },
          );
          if (response.status === "OK") {
            window.location.href = response.authUrl;
          } else {
            console.error("Failed to get Chzzk auth URL:", response);
          }
        } catch (e) {
          console.error("Failed to get Chzzk auth URL:", e);
        }
      },
    });
  }

  function hideLoginError() {
    errors.value = errors.value.filter((error) => error.id !== "chzzk-login");
  }

  function showCcidMismatchError() {
    if (errors.value.find((error) => error.id === "chzzk-ccid-mismatch")) {
      return;
    }
    errors.value.push({
      id: "chzzk-ccid-mismatch",
      platform: "chzzk",
      message:
        "로그인한 치지직 계정과 채널 ID가 일치하지 않습니다. 채널 ID를 변경하거나 이 메시지를 클릭해 로그아웃하세요.",
      onClick: async () => {
        try {
          await $fetch<ApiOk | ApiError>("/api/chzzk/auth/logout", {
            method: "POST",
          });
          // Best-effort: tell other tabs the login is gone before reloading,
          // so they don't sit on a stale logged-in state for up to a minute.
          // The reload immediately below may cut the postMessage short --
          // that's fine, each tab's own poll or onAuthRequired self-corrects.
          authBroadcast.publish({ status: "LOGIN_REQUIRED" });
          window.location.reload();
        } catch (e) {
          console.error("Failed to logout from Chzzk:", e);
        }
      },
    });
  }

  function hideCcidMismatchError() {
    errors.value = errors.value.filter(
      (error) => error.id !== "chzzk-ccid-mismatch",
    );
  }

  // Resolves the current auth state via the network, without touching any
  // UI state -- applyAuthState() below is what maps a state onto this tab's
  // errors. Keeps the original retry sequence verbatim: try /api/chzzk/me;
  // on failure refresh once; retry /api/chzzk/me; only then conclude
  // LOGIN_REQUIRED.
  async function resolveAuthState(): Promise<ChzzkAuthState> {
    async function checkMe(): Promise<ChzzkAuthState | undefined> {
      const response = await $fetch<ChzzkMeResponse | ApiError>(
        "/api/chzzk/me",
        { timeout: 5000 },
      );
      if (response.status === "OK") {
        return {
          status: "AUTHENTICATED",
          channelId: response.channelId,
          channelName: response.channelName,
        };
      }
      return undefined;
    }

    try {
      const state = await checkMe();
      if (state) return state;
    } catch {
      // First attempt failed, try refreshing token
    }

    try {
      await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh", {
        method: "POST",
        timeout: 5000,
      });
      const state = await checkMe();
      if (state) return state;
    } catch {
      // Refresh failed
    }

    return { status: "LOGIN_REQUIRED" };
  }

  // Maps an auth state (resolved locally or pushed in from another tab via
  // authBroadcast) onto this tab's error UI. Applied identically regardless
  // of source: each tab compares against its own chzzkChannelId, since two
  // tabs can be configured for different channels while sharing one login.
  function applyAuthState(state: ChzzkAuthState) {
    if (!chatOptions.value.chzzkChannelId) {
      hideLoginError();
      hideCcidMismatchError();
      return;
    }

    if (state.status === "AUTHENTICATED") {
      // No-op unless this tab's connection is a leader currently parked on
      // the slow 30s auth-recheck cadence -- see notifyAuthChanged() in
      // lib/chzzkConnection.ts.
      connection.notifyAuthChanged();
      if (state.channelId !== chatOptions.value.chzzkChannelId) {
        hideLoginError();
        showCcidMismatchError();
      } else {
        hideCcidMismatchError();
        hideLoginError();
      }
    } else {
      hideCcidMismatchError();
      showLoginError();
    }
  }

  // A state pushed in from another tab via authBroadcast is trusted
  // asymmetrically, unlike a locally resolved state: AUTHENTICATED is good
  // news that costs nothing to apply and self-corrects on the next poll (or
  // via onAuthRequired) if it was ever wrong, so it's applied immediately.
  // LOGIN_REQUIRED is bad news -- showing it wrongly flashes a login error
  // onto every tab sharing this browser, including OBS Browser Sources on a
  // live overlay -- so it is verified locally first, via the same
  // me -> refresh -> me sequence checkAuth uses, before being applied.
  // Deliberately does NOT go through authBroadcast.publish(): a genuine
  // logout would otherwise make every tab publish its own verified state,
  // which would make every other tab verify again in turn -- O(N^2)
  // verifications and refresh attempts against a single-use refresh token.
  // Only checkAuth (the 60s poll and the channel-id watcher) publishes.
  async function handleRemoteAuthState(state: ChzzkAuthState) {
    if (state.status === "AUTHENTICATED") {
      applyAuthState(state);
      return;
    }
    // A tab with no chzzkChannelId configured (e.g. Twitch-only) still
    // constructs this broadcast and still receives every message on it --
    // CHZZK auth is channel-id-independent, see createChzzkAuthBroadcast's
    // comment above -- but has nothing to verify. Without this guard,
    // resolveAuthState() would run its full me -> refresh -> me sequence
    // (spending a single-use refresh-token rotation) only to have
    // applyAuthState discard the result via its own early exit. Mirror
    // checkAuth's guard here instead, before touching the network at all.
    if (!chatOptions.value.chzzkChannelId) {
      applyAuthState(state);
      return;
    }
    applyAuthState(await resolveAuthState());
  }

  async function checkAuth() {
    if (!chatOptions.value.chzzkChannelId) {
      hideLoginError();
      hideCcidMismatchError();
      return;
    }

    const state = await resolveAuthState();
    applyAuthState(state);
    authBroadcast.publish(state);
  }

  useTimeoutPoll(checkAuth, 60_000, { immediate: true });

  watch(
    () => chatOptions.value.chzzkChannelId,
    () => {
      void checkAuth();
    },
  );

  onScopeDispose(() => {
    void connection.stop();
    void authBroadcast.close();
  });

  function clearChat() {
    messages.value = [];
  }

  return {
    chatItems,
    clearChat,
    errors,
  };
}
