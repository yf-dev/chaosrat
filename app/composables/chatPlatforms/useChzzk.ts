import { useTimeoutPoll } from "@vueuse/core";
import { ChzzkChat, type ChatEvent } from "chzzk";
import type {
  ChzzkChatChannelIdResponse,
  ApiError,
  ChatItem,
} from "~/lib/interfaces";

interface ChzzkMessage {
  chatEvent: ChatEvent;
  timestamp: number;
}

function handleChzzkEmojis(message: ChzzkMessage) {
  const emojis: { [key: string]: string } = {};
  const originalEmojis =
    (typeof message.chatEvent.extras?.emojis === "string"
      ? {}
      : message.chatEvent.extras?.emojis) ?? {};
  for (const [id, url] of Object.entries(originalEmojis)) {
    emojis[`{:${id}:}`] = url;
  }
  return emojis;
}

function handleChzzkBadges(message: ChzzkMessage) {
  const badges: { [key: string]: string } = {};
  if (message.chatEvent.profile.badge) {
    badges["chzzk/badge"] = message.chatEvent.profile.badge.imageUrl;
  }
  if (message.chatEvent.profile.activityBadges) {
    for (const badge of message.chatEvent.profile.activityBadges) {
      badges[`chzzk/${badge.badgeId}`] = badge.imageUrl;
    }
  }
  if (message.chatEvent.profile.streamingProperty.subscription) {
    const subscription =
      message.chatEvent.profile.streamingProperty.subscription;
    badges[`chzzk/subscription/${subscription.accumulativeMonth}`] =
      subscription.badge.imageUrl;
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
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);
  const messages = ref<ChzzkMessage[]>([]);

  const chatItems = computed(() => {
    return messages.value
      .filter((message) => !message.chatEvent.hidden)
      .map((message) => {
        const emojis = handleChzzkEmojis(message);
        const badges = handleChzzkBadges(message);
        return {
          platform: "chzzk",
          id: `chzzk-${message.chatEvent.time}`,
          nickname: message.chatEvent.profile.nickname,
          message: message.chatEvent.message,
          timestamp: message.timestamp,
          extra: {
            emojis: emojis,
            badges: badges,
          },
        } as ChatItem;
      });
  });

  const chatChannelId = ref<string | null>(null);
  async function updateCcid() {
    try {
      if (!chatOptions.value.chzzkChannelId) {
        return;
      }
      const data = await $fetch<ChzzkChatChannelIdResponse | ApiError>(
        "/api/chzzk/chatChannelId",
        {
          query: { channelId: chatOptions.value.chzzkChannelId },
          timeout: 1000,
        }
      );
      if (data.status === "ERROR") {
        console.log(`Chzzk getCcid Error: ${data.error}`);
        return;
      }
      if (data.status === "OK" && chatChannelId.value !== data.chatChannelId) {
        chatChannelId.value = data.chatChannelId;
      }
    } catch (e) {
      console.log("Chzzk updateCcid Error");
      console.error(e);
    }
  }
  useTimeoutPoll(updateCcid, 15000, { immediate: true });

  const chzzkChatClient = ref<ChzzkChat | null>(null);
  const isFirstConnect = ref<boolean>(true);
  async function initChat() {
    // remove previous chat client
    if (chzzkChatClient.value && chzzkChatClient.value.connected) {
      // @ts-ignore: Overwrite the handlers
      chzzkChatClient.value.handlers = [];
      chzzkChatClient.value.disconnect();
      chzzkChatClient.value = null;
    }

    const chzzkChannelId = chatOptions.value.chzzkChannelId;
    if (!chzzkChannelId) {
      return;
    }

    if (!chatChannelId.value) {
      return;
    }

    const newClient = new ChzzkChat({
      chatChannelId: chatChannelId.value,
      channelId: chzzkChannelId,
      accessToken: "anonymous",
    });

    newClient.on("connect", () => {
      console.log(
        `Connected to Chzzk ${chzzkChannelId}, ${chatChannelId.value}`
      );
      if (isFirstConnect.value) {
        newClient.requestRecentChat(chatOptions.value.maxChatSize);
        isFirstConnect.value = false;
      }
    });

    newClient.on("disconnect", () => {
      console.log(
        `Disconnected from Chzzk ${chzzkChannelId}, ${chatChannelId.value}`
      );
      new Promise((resolve) => setTimeout(resolve, 1000)).then(initChat);
    });

    newClient.on("chat", (chat) => {
      console.log("Chzzk chat");
      console.log(chat);
      if (options.onBroadcasterMessage) {
        if (chat.profile.userRoleCode === "streamer") {
          if (options.onBroadcasterMessage(chat.message)) {
            return;
          }
        }
      }
      messages.value.push({
        chatEvent: chat,
        timestamp: new Date().getTime(),
      });
      if (chatOptions.value.maxChatSize !== undefined) {
        if (messages.value.length > chatOptions.value.maxChatSize) {
          messages.value = messages.value.slice(
            messages.value.length - chatOptions.value.maxChatSize
          );
        }
      }
    });

    newClient.on("blind", (blind) => {
      console.log("Chzzk blind");
      console.log(blind);
      if (blind.blindType === "HIDDEN") {
        messages.value = messages.value.map((message) => {
          const newMessage = {
            chatEvent: { ...message.chatEvent },
            timestamp: message.timestamp,
          };
          if (
            blind.userId === newMessage.chatEvent.profile.userIdHash &&
            blind.messageTime === newMessage.chatEvent.time
          ) {
            newMessage.chatEvent.hidden = true;
          }
          return newMessage;
        });
      }
    });

    await newClient.connect();
    chzzkChatClient.value = newClient;
  }
  watch(
    () => ({
      chatOptions: chatOptions.value,
      chatChannelId: chatChannelId.value,
    }),
    async (val) => {
      await initChat();
    },
    { immediate: true }
  );

  onBeforeUnmount(async () => {
    if (chzzkChatClient.value && chzzkChatClient.value.connected) {
      await chzzkChatClient.value.disconnect();
      chzzkChatClient.value = null;
    }
  });

  function clearChat() {
    messages.value = [];
  }

  return {
    chatItems,
    clearChat,
  };
}
