import type { ChatItem } from "~/lib/interfaces";
import { LiveChat } from "youtube-chat";
import type { ChatItem as YoutubeChatItem } from "youtube-chat/dist/types/data";

interface YoutubeLiveMessage {
  chatItem: YoutubeChatItem;
  timestamp: number;
}

function handleYoutubeLiveEmojis(message: YoutubeLiveMessage) {
  const emojis: { [key: string]: string } = {};
  let text = "";
  for (const messageItem of message.chatItem.message) {
    if ("text" in messageItem) {
      text += messageItem.text;
    } else if ("emojiText" in messageItem) {
      text += `{${messageItem.emojiText}}`;
      emojis[`{${messageItem.emojiText}}`] = messageItem.url;
    }
  }
  return {
    emojis,
    text,
  };
}

export function useYoutubeLive(
  handle: MaybeRefOrGetter<string | null>,
  maxChatSize: MaybeRefOrGetter<number>
) {
  const messages = ref<YoutubeLiveMessage[]>([]);

  const chatItems = computed(() => {
    return messages.value.map((message) => {
      const { emojis, text } = handleYoutubeLiveEmojis(message);
      return {
        platform: "youtube-live",
        id: `youtube-live-${message.chatItem.id}`,
        nickname: message.chatItem.author.name,
        message: text,
        timestamp: message.timestamp,
        extra: {
          emojis: emojis,
        },
      } as ChatItem;
    });
  });

  const youtubeLiveChatClient = ref<LiveChat | null>(null);
  async function initChat() {
    // remove previous live video
    if (youtubeLiveChatClient.value) {
      youtubeLiveChatClient.value.stop();
      youtubeLiveChatClient.value = null;
    }

    const handleValue = toValue(handle);
    if (!handleValue) {
      return;
    }

    const liveChat = new LiveChat({ handle: handleValue });

    liveChat.on("start", (liveId) => {
      /* Your code here! */
      console.log(`Connected to Youtube Live ${handleValue}, ${liveId}`);
    });

    // Emit at end of observation chat.
    // reason: string?
    liveChat.on("end", (reason) => {
      console.log(`Disconnected from Youtube Live ${handleValue}`);
      new Promise((resolve) => setTimeout(resolve, 1000)).then(initChat);
    });

    // Emit at receive chat.
    // chat: ChatItem
    liveChat.on("chat", (chatItem) => {
      console.log("Youtube Live chat");
      console.log(chatItem);
      messages.value.push({
        chatItem: chatItem,
        timestamp: new Date().getTime(),
      });
      if (messages.value.length > toValue(maxChatSize)) {
        messages.value = messages.value.slice(
          messages.value.length - toValue(maxChatSize)
        );
      }
    });

    liveChat.on("error", (err) => {
      console.error("Youtube Live error");
      console.error(err);
    });

    const ok = await liveChat.start();
    if (!ok) {
      console.log("Failed to start Youtube Live");
      new Promise((resolve) => setTimeout(resolve, 1000)).then(initChat);
      return;
    }

    youtubeLiveChatClient.value = liveChat;
  }

  watch(
    () => ({
      handle: toValue(handle),
      maxChatSize: toValue(maxChatSize),
    }),
    async (val) => {
      await initChat();
    },
    { immediate: true }
  );

  onBeforeUnmount(async () => {
    if (youtubeLiveChatClient.value) {
      youtubeLiveChatClient.value.stop();
      youtubeLiveChatClient.value = null;
    }
  });

  return {
    chatItems,
  };
}

/*
Youtube is not allowing to access their chat API from other domains.
So we need to use a proxy to access the API.
This code replaces the XMLHttpRequest open method to use a proxy for Youtube Live chat.
It may not work in all cases, but it works for most cases.
*/

function updateUrl(url: string | URL): string | URL {
  if (typeof url === "string") {
    url = new URL(url);
  }
  if (url.origin === "https://www.youtube.com") {
    url = `/api/youtubeLive/proxy/${url.pathname}${url.search}`;
  }
  return url;
}

function replaceXhrOpen() {
  const original_function = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    user?: string | null,
    password?: string | null
  ) {
    return original_function.call(
      this,
      method,
      updateUrl(url),
      async,
      user,
      password
    );
  };
}
replaceXhrOpen();
