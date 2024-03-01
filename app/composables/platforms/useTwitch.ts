import { parseEmotesInMessage, getEmoteAsUrl } from "tmi-utils";
import { Client, type ChatUserstate } from "tmi.js";
import type {
  ChatItem,
  TwitchBadge,
  TwitchBadgesResponse,
  ApiError,
} from "~/lib/interfaces";

interface TwitchMessage {
  channel: string;
  tags: ChatUserstate;
  message: string;
  timestamp: number;
}

function handleTwitchEmojis(message: TwitchMessage, text: string) {
  const parsedMessage = parseEmotesInMessage(message.tags.emotes ?? {}, text);
  const emojis: { [key: string]: string } = {};
  parsedMessage.forEach((part) => {
    if (part.type === "emote" && part.raw) {
      emojis[part.raw] = getEmoteAsUrl(part.value);
    }
  });
  return emojis;
}

function handleTwitchBadges(message: TwitchMessage, badgeData: TwitchBadge) {
  const badges: { [key: string]: string } = {};
  if (message.tags.badges) {
    for (const [badge, version] of Object.entries(message.tags.badges)) {
      badges[`twitch/${badge}/${version}`] =
        badgeData[`${badge}/${version}`] ?? "";
    }
  }
  return badges;
}

export function useTwitch(
  channel: MaybeRefOrGetter<string | null>,
  maxChatSize: MaybeRefOrGetter<number>
) {
  const messages = ref<TwitchMessage[]>([]);

  const badgeData = ref<TwitchBadge>({});
  const chatItems = computed(() => {
    return messages.value.map((message) => {
      const emojis = handleTwitchEmojis(message, message.message);
      const badges = handleTwitchBadges(message, badgeData.value);
      return {
        platform: "twitch",
        id: `twitch-${message.tags.id}`,
        nickname: message.tags["display-name"],
        message: message.message,
        timestamp: message.timestamp,
        extra: {
          emojis: emojis,
          badges: badges,
        },
      } as ChatItem;
    });
  });

  const twitchChatClient = ref<Client | null>(null);

  async function initChat() {
    // remove previous chat client
    if (
      twitchChatClient.value &&
      twitchChatClient.value.readyState() === "OPEN"
    ) {
      await twitchChatClient.value.disconnect();
      twitchChatClient.value = null;
    }

    const twitchChannel = toValue(channel);

    if (!twitchChannel) {
      return;
    }

    const newClient = new Client({
      channels: [twitchChannel],
    });
    newClient.on("connected", (address, port) => {
      console.log(`Connected to Twitch ${twitchChannel}`);
    });

    newClient.on("disconnected", (reason) => {
      console.log(`Disconnected from Twitch ${twitchChannel}`);
      new Promise((resolve) => setTimeout(resolve, 1000)).then(initChat);
    });

    newClient.on("message", (channel, tags, message, self) => {
      console.log("Twitch message");
      console.log({
        channel,
        tags,
        message,
        self,
      });
      messages.value.push({
        channel,
        tags,
        message,
        timestamp: new Date().getTime(),
      });
      if (messages.value.length > toValue(maxChatSize)) {
        messages.value = messages.value.slice(
          messages.value.length - toValue(maxChatSize)
        );
      }
    });
    newClient.on("clearchat", (channel) => {
      console.log("Twitch clearchat");
      messages.value = [];
    });
    newClient.on(
      "messagedeleted",
      (channel, username, deletedMessage, userstate) => {
        console.log("Twitch messagedeleted");
        console.log({
          channel,
          username,
          deletedMessage,
          userstate,
        });
        messages.value = messages.value.filter(
          (message) => message.tags.id !== userstate["target-msg-id"]
        );
      }
    );
    newClient.on("ban", (channel, username, reason, userstate) => {
      console.log("Twitch ban");
      console.log({
        channel,
        username,
        reason,
        userstate,
      });
      messages.value = messages.value.filter(
        (message) => message.tags["user-id"] !== userstate["target-user-id"]
      );
    });
    await newClient.connect();
    twitchChatClient.value = newClient;

    const badgeResponse = await $fetch<TwitchBadgesResponse | ApiError>(
      `/api/twitch/badges?twitchChannelId=${twitchChannel}`
    );
    if (badgeResponse.status === "OK") {
      badgeData.value = badgeResponse.badge;
      console.log("Fetched Twitch badges", badgeData.value);
    } else {
      console.error("Failed to fetch Twitch badges", badgeResponse.error);
    }
  }

  watch(
    () => ({
      channel: toValue(channel),
      maxChatSize: toValue(maxChatSize),
    }),
    async (val) => {
      await initChat();
    },
    { immediate: true }
  );

  onBeforeUnmount(async () => {
    if (
      twitchChatClient.value &&
      twitchChatClient.value.readyState() === "OPEN"
    ) {
      await twitchChatClient.value.disconnect();
      twitchChatClient.value = null;
    }
  });

  return {
    chatItems,
  };
}
