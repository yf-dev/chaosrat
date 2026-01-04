import { useTimeoutPoll } from "@vueuse/core";
import type {
  ApiError,
  ChatItem,
  ChzzkSessionOpenResponse,
  ApiOk,
  ChatPlatformError,
  ChzzkMeResponse,
  ChzzkAuthLoginResponse,
} from "~/lib/interfaces";
import { useSocketIo } from "../useSocketIo";
import { useSharedConnection } from "../useSharedConnection";

interface ChzzkMessage {
  chatItem: ChzzkChatSessionMessage;
  timestamp: number;
}

interface ChzzkSystemConnectedSessionMessage {
  type: "connected";
  data: {
    sessionKey: string;
  };
}

interface ChzzkSystemSubscribedSessionMessage {
  type: "subscribed";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

interface ChzzkSystemUnsubscribedSessionMessage {
  type: "unsubscribed";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

interface ChzzkSystemRevokedSessionMessage {
  type: "revoked";
  data: {
    eventType: "CHAT" | "DONATION";
    channelId: string;
  };
}

type ChzzkSystemSessionMessage =
  | ChzzkSystemConnectedSessionMessage
  | ChzzkSystemSubscribedSessionMessage
  | ChzzkSystemUnsubscribedSessionMessage
  | ChzzkSystemRevokedSessionMessage;

interface ChzzkChatSessionMessage {
  channelId: string;
  senderChannelId: string;
  profile: {
    nickname: string;
    badges: {
      imageUrl: string;
      [key: string]: string;
    }[];
    verifiedMark: boolean;
  };
  content: string;
  emojis: {
    [key: string]: string;
  };
  messageTime: number;
}

interface ChzzkDonationSessionMessage {
  donationType: "CHAT" | "VIDEO";
  channelId: string;
  donatorChannelId: string;
  donatorNickname: string;
  payAmount: number;
  donationText: string;
  emojis: {
    [key: string]: string;
  };
}

type ChzzkSessionMessageData =
  | {
      type: "SYSTEM";
      message: ChzzkSystemSessionMessage;
    }
  | {
      type: "CHAT";
      message: ChzzkChatSessionMessage;
    }
  | {
      type: "DONATION";
      message: ChzzkDonationSessionMessage;
    };

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
  const sessionKey = ref<string | null>(null);
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

  const { isLeader, sendData } = useSharedConnection<ChzzkSessionMessageData>(
    sharedChannelName,
    {
      onBecomeLeader: () => {
        initChat();
      },
      onLoseLeader: () => {
        socketClose();
      },
      onData: (data) => {
        if (data.type === "SYSTEM") {
          if (data.message.type === "connected") {
            console.log("Chzzk Connected", data.message);
            sessionKey.value = data.message.data.sessionKey;
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
                messages.value.length - chatOptions.value.maxChatSize
              );
            }
          }
        } else if (data.type === "DONATION") {
          console.log("Chzzk DONATION", data.message);
        }
      },
    }
  );

  const socketUrl = ref<string | undefined>(undefined);
  async function updateSocketUrl() {
    try {
      if (!chatOptions.value.chzzkChannelId) {
        return;
      }

      const data = await $fetch<ChzzkSessionOpenResponse | ApiError>(
        "/api/chzzk/session/open",
        {
          timeout: 5000,
        }
      );
      if (data.status === "ERROR") {
        console.log(`Chzzk openSession Error: ${data.error}`);
        return;
      }
      socketUrl.value = data.url;
    } catch (e) {
      console.log("Chzzk updateSocketUrl Error");
      console.error(e);
    }
  }
  useTimeoutPoll(updateSocketUrl, 1000 * 60 * 60 * 12, { immediate: true }); // 12 hours interval

  async function refreshToken() {
    const result = await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh");
    if (result.status === "OK") {
      await updateSocketUrl();
    }
  }
  useTimeoutPoll(refreshToken, 1000 * 60 * 60 * 24 * 3, { immediate: false }); // 3 days interval

  const {
    status: socketStatus,
    open: socketOpen,
    close: socketClose,
  } = useSocketIo(socketUrl, {
    socketOptions: {
      reconnection: true,
      forceNew: true,
      timeout: 3000,
      transports: ["websocket"],
    },
    immediate: false,
    onConnected: () => {
      console.log("Connected to Chzzk");
    },
    onDisconnected: () => {
      console.log("Disconnected from Chzzk");
      if (isLeader.value) {
        new Promise((resolve) => setTimeout(resolve, 500)).then(
          updateSocketUrl
        );
      }
    },
    events: {
      SYSTEM: (messageString: string) => {
        const message = JSON.parse(messageString) as ChzzkSystemSessionMessage;
        if (isLeader.value) {
          sendData({
            type: "SYSTEM",
            message,
          });
        }
      },
      CHAT: (messageString: string) => {
        const message = JSON.parse(messageString) as ChzzkChatSessionMessage;
        if (isLeader.value) {
          sendData({
            type: "CHAT",
            message,
          });
        }
      },
      DONATION: (messageString: string) => {
        const message = JSON.parse(
          messageString
        ) as ChzzkDonationSessionMessage;
        if (isLeader.value) {
          sendData({
            type: "DONATION",
            message,
          });
        }
      },
    },
  });

  function initChat() {
    if (!chatOptions.value.chzzkChannelId) {
      return;
    }
    // remove previous chat client
    if (socketStatus.value !== "CLOSED") {
      socketClose();
    }
    socketOpen();
  }

  async function subscribeChat(sessionKey: string) {
    try {
      const data = await $fetch<ApiOk | ApiError>(
        "/api/chzzk/session/subscribeChat",
        {
          method: "POST",
          body: { sessionKey },
          timeout: 5000,
        }
      );
      if (data.status === "ERROR") {
        console.log(`Chzzk subscribeChat Error: ${data.error}`);
        return;
      }
      console.log("Chat subscribed successfully");
    } catch (error) {
      console.log("Chzzk subscribeChat Error");
      console.error(error);
    }
  }

  async function unsubscribeChat(sessionKey: string) {
    try {
      const data = await $fetch<ApiOk | ApiError>(
        "/api/chzzk/session/unsubscribeChat",
        {
          method: "POST",
          body: { sessionKey },
          timeout: 5000,
        }
      );
      if (data.status === "ERROR") {
        console.log(`Chzzk unsubscribeChat Error: ${data.error}`);
        return;
      }
      console.log("Chat unsubscribed successfully");
    } catch (error) {
      console.log("Chzzk unsubscribeChat Error");
      console.error(error);
    }
  }

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
            }
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
      (error) => error.id !== "chzzk-ccid-mismatch"
    );
  }

  watch(
    () => ({
      socketUrl: socketUrl.value,
      isLeader: isLeader.value,
    }),
    (val, oldVal) => {
      if (
        val.socketUrl &&
        val.socketUrl !== oldVal?.socketUrl &&
        val.isLeader
      ) {
        initChat();
      }
    },
    { immediate: true }
  );

  watch(
    () => ({
      sessionKey: sessionKey.value,
      isLeader: isLeader.value,
    }),
    async (val, oldVal) => {
      if (!val.isLeader) return;
      if (oldVal?.sessionKey && oldVal.sessionKey !== val.sessionKey) {
        await unsubscribeChat(oldVal.sessionKey);
      }
      if (val.sessionKey) {
        await subscribeChat(val.sessionKey);
      }
    },
    { immediate: true }
  );

  watch(
    () => ({
      chzzkChannelId: chatOptions.value.chzzkChannelId,
    }),
    async (val) => {
      if (!val.chzzkChannelId) {
        hideLoginError();
        hideCcidMismatchError();
        return;
      }

      async function checkMe() {
        const response = await $fetch<ChzzkMeResponse | ApiError>(
          "/api/chzzk/me"
        );
        if (response.status === "OK") {
          if (response.channelId !== val.chzzkChannelId) {
            showCcidMismatchError();
            return true;
          } else {
            hideCcidMismatchError();
          }
          hideLoginError();
          return true;
        }
        return false;
      }

      try {
        if (await checkMe()) return;
      } catch (e) {
        // First attempt failed, try refreshing token
      }

      try {
        await refreshToken();
        if (await checkMe()) return;
      } catch (e) {
        // Refresh failed
      }

      showLoginError();
    },
    { immediate: true }
  );

  onBeforeUnmount(async () => {
    if (isLeader.value && sessionKey.value) {
      await unsubscribeChat(sessionKey.value);
    }
    socketClose();
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
