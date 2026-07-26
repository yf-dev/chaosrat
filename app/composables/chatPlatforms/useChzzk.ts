import { useTimeoutPoll } from "@vueuse/core";
import io from "socket.io-client";
import type {
  ApiError,
  ChatItem,
  ChzzkSessionOpenResponse,
  ApiOk,
  ChatPlatformError,
  ChzzkMeResponse,
  ChzzkAuthLoginResponse,
} from "~/lib/interfaces";
import {
  createChzzkConnection,
  type ChzzkChatSessionMessage,
  type ChzzkSessionMessageData,
} from "~/lib/chzzkConnection";
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
  // once useSharedConnection has run.
  let sendData: (data: ChzzkSessionMessageData) => void;

  const connection = createChzzkConnection({
    fetchSessionUrl: async () => {
      if (!chatOptions.value.chzzkChannelId) {
        return { status: "ERROR" };
      }
      const data = await $fetch<ChzzkSessionOpenResponse | ApiError>(
        "/api/chzzk/session/open",
        {
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
      const result = await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh");
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
          await $fetch<ApiOk | ApiError>("/api/chzzk/auth/logout");
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

  async function checkAuth() {
    if (!chatOptions.value.chzzkChannelId) {
      hideLoginError();
      hideCcidMismatchError();
      return;
    }

    async function checkMe() {
      const response = await $fetch<ChzzkMeResponse | ApiError>(
        "/api/chzzk/me",
      );
      if (response.status === "OK") {
        if (response.channelId !== chatOptions.value.chzzkChannelId) {
          hideLoginError();
          showCcidMismatchError();
        } else {
          hideCcidMismatchError();
          hideLoginError();
        }
        return true;
      }
      return false;
    }

    try {
      if (await checkMe()) return;
    } catch {
      // First attempt failed, try refreshing token
    }

    try {
      await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh");
      if (await checkMe()) return;
    } catch {
      // Refresh failed
    }

    showLoginError();
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
