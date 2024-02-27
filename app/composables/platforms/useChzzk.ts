import { useTimeoutPoll } from "@vueuse/core";
import { ChzzkChat, type ChatEvent } from "chzzk";
import type {
  ChzzkChatChannelIdResponse,
  ChzzkChatChannelIdError,
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
        return {
          platform: "chzzk",
          id: `chzzk-${message.chatEvent.time}`,
          nickname: message.chatEvent.profile.nickname,
          message: message.chatEvent.message,
          timestamp: message.timestamp,
          extra: {
            emojis: emojis,
          },
        } as ChatItem;
      });
  });

  const chatChannelId = ref<string | null>(null);
  async function updateCcid() {
    if (!toValue(channelId)) {
      return;
    }
    const data = await $fetch<
      ChzzkChatChannelIdResponse | ChzzkChatChannelIdError
    >("/api/chzzk/chatChannelId", {
      query: { channelId: toValue(channelId) },
      timeout: 1000,
    });
    if (data.status === "ERROR") {
      console.log(`Chzzk getCcid Error: ${data.error}`);
      return;
    }
    if (data.status === "OK") {
      chatChannelId.value = data.chatChannelId;
    }
  }
  useTimeoutPoll(updateCcid, 15000, { immediate: true });

  const chzzkChatClient = ref<ChzzkChat | null>(null);
  async function initChat() {
    // remove previous chat client
    if (chzzkChatClient.value && chzzkChatClient.value.connected) {
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
      newClient.requestRecentChat(toValue(maxChatSize));
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
