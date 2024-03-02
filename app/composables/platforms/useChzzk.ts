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
  if ("subscription" in message.chatEvent.profile.streamingProperty) {
    // subscription badge is not supported in chzzk library yet
    const subscription: {
      accumulativeMonth: number;
      badge: {
        imageUrl: string;
      };
      tier: number;
    } = message.chatEvent.profile.streamingProperty.subscription as any;
    badges[`chzzk/subscription/${subscription.accumulativeMonth}`] =
      subscription.badge.imageUrl;
  }
  return badges;
}

export function useChzzk(
  channelId: MaybeRefOrGetter<string | null>,
  maxChatSize: MaybeRefOrGetter<number>
) {
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
      if (!toValue(channelId)) {
        return;
      }
      const data = await $fetch<ChzzkChatChannelIdResponse | ApiError>(
        "/api/chzzk/chatChannelId",
        {
          query: { channelId: toValue(channelId) },
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
      console.log("Chzzk getCcid Error");
      console.error(e);
    }
  }
  useTimeoutPoll(updateCcid, 5000, { immediate: true });

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

    const chzzkChannelId = toValue(channelId);
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

    newClient.on("connect", (innerChatChannelId) => {
      console.log(
        `Connected to Chzzk ${chzzkChannelId}, ${chatChannelId.value}`
      );
      if (isFirstConnect.value) {
        newClient.requestRecentChat(toValue(maxChatSize));
        isFirstConnect.value = false;
      }
    });

    newClient.on("disconnect", (innerChatChannelId) => {
      console.log(
        `Disconnected from Chzzk ${chzzkChannelId}, ${chatChannelId.value}`
      );
      new Promise((resolve) => setTimeout(resolve, 1000)).then(initChat);
    });

    newClient.on("chat", (chat) => {
      console.log("Chzzk chat");
      console.log(chat);
      messages.value.push({
        chatEvent: chat,
        timestamp: new Date().getTime(),
      });
      if (messages.value.length > toValue(maxChatSize)) {
        messages.value = messages.value.slice(
          messages.value.length - toValue(maxChatSize)
        );
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
      channelId: toValue(channelId),
      maxChatSize: toValue(maxChatSize),
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

  return {
    chatItems,
  };
}
