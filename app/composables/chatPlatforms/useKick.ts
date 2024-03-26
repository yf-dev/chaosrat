import { useTimeoutPoll, useWebSocket } from "@vueuse/core";
import type { ChatItem } from "~/lib/interfaces";
import { parseIntOrDefault } from "~/lib/utils";

interface KickGetChannelApiResponse {
  chatroom: {
    id: number;
  };
  subscriber_badges: KickSubscriberBadge[];
}

interface KickSubscriberBadge {
  id: number;
  channel_id: number;
  months: number;
  badge_image: {
    srcset: string;
    src: string;
  };
}

interface KickWebsocketMessage {
  event: string;
  data: any;
  channel?: string;
}

interface KickWebsocketChatMessageEventData {
  id: string;
  chatroom_id: number;
  content: string;
  type: "message" | "reply";
  created_at: string;
  sender: {
    id: number;
    username: string;
    slug: string;
    identity: {
      color: string;
      badges: KickWebsocketChatMessageEventDataBadge[];
    };
  };
}

interface KickWebsocketChatMessageEventDataBadge {
  type:
    | "staff"
    | "broadcaster"
    | "moderator"
    | "verified"
    | "subscriber"
    | "founder"
    | "sub_gifter"
    | "og"
    | "vip";
  text: string;
  count?: number;
}

interface KickMessage {
  chatMessageEventData: KickWebsocketChatMessageEventData;
  timestamp: number;
}

const emoteRegex = /\[emote:(\d+):([a-zA-Z0-9_]+)\]/g;
function handleKickEmojis(message: KickMessage) {
  const emojis: { [key: string]: string } = {};
  const text = message.chatMessageEventData.content;

  const emotes = Array.from(text.matchAll(emoteRegex)).map((match) => {
    return {
      id: parseIntOrDefault(match[1], 10, 0),
      name: match[2],
    };
  });

  for (const emote of emotes) {
    const emote_key = `[emote:${emote.id}:${emote.name}]`;
    const emote_url = `https://files.kick.com/emotes/${emote.id}/fullsize`;
    emojis[emote_key] = emote_url;
  }
  return emojis;
}

function handleKickBadges(
  message: KickMessage,
  subscriberBadges: KickSubscriberBadge[]
) {
  const filteredBadges: { [key: string]: string } = {};
  if (message.chatMessageEventData.sender.identity.badges) {
    for (const badge of message.chatMessageEventData.sender.identity.badges) {
      if (badge.type === "staff") {
        // NOT IMPLEMENTED YET
        // filteredBadges["kick/staff"] = "/badges/kick/staff.svg";
      } else if (badge.type === "broadcaster") {
        filteredBadges["kick/broadcaster"] = "/badges/kick/broadcaster.svg";
      } else if (badge.type === "moderator") {
        filteredBadges["kick/moderator"] = "/badges/kick/moderator.svg";
      } else if (badge.type === "verified") {
        filteredBadges["kick/verified"] = "/badges/kick/verified.svg";
      } else if (badge.type === "subscriber") {
        let key = null;
        let url = null;
        for (const subscriberBadge of subscriberBadges) {
          if ((badge.count ?? 0) >= subscriberBadge.months) {
            key = `kick/subscriber/${subscriberBadge.months}`;
            url = subscriberBadge.badge_image.src;
          }
        }
        if (key && url) {
          filteredBadges[key] = url;
        }
      } else if (badge.type === "founder") {
        filteredBadges["kick/founder"] = "/badges/kick/founder.svg";
      } else if (badge.type === "sub_gifter") {
        // NOT IMPLEMENTED YET
      } else if (badge.type === "og") {
        filteredBadges["kick/og"] = "/badges/kick/og.svg";
      } else if (badge.type === "vip") {
        filteredBadges["kick/vip"] = "/badges/kick/vip.svg";
      }
    }
  }
  return filteredBadges;
}

export function useKick(options: {
  /**
   * Callback when a broadcaster message is received
   * @param message The message received
   * @returns true if the message is handled, false otherwise
   */
  onBroadcasterMessage?: (message: string) => boolean;
}) {
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);
  const messages = ref<KickMessage[]>([]);

  const chatItems = computed(() => {
    return messages.value.map((message) => {
      const emojis = handleKickEmojis(message);
      const badges = handleKickBadges(message, subscriberBadges.value);
      return {
        platform: "kick",
        id: `kick-${message.chatMessageEventData.id}`,
        nickname: message.chatMessageEventData.sender.username,
        message: message.chatMessageEventData.content,
        timestamp: message.timestamp,
        extra: {
          emojis: emojis,
          badges: badges,
        },
      } as ChatItem;
    });
  });

  const kickChatroomId = ref<number | null>(null);
  const subscriberBadges = ref<KickSubscriberBadge[]>([]);
  async function updateKickChatroomId() {
    try {
      if (!chatOptions.value.kickChannel) {
        return;
      }
      const data = await $fetch<KickGetChannelApiResponse>(
        `https://kick.com/api/v1/channels/${chatOptions.value.kickChannel}`,
        {
          timeout: 1000,
          parseResponse: JSON.parse,
        }
      );
      kickChatroomId.value = data.chatroom.id;
      subscriberBadges.value = data.subscriber_badges.sort(
        (a, b) => a.months - b.months
      );
    } catch (e) {
      console.log("Kick updateKickChatroomId Error");
      console.error(e);
    }
  }
  // do NOT call too often, or you will be blocked by cloudflare
  useTimeoutPoll(updateKickChatroomId, 1000 * 60 * 5, { immediate: true });

  const {
    status: webSocketStatus,
    data: webSocketData,
    send: webSocketSend,
    open: webSocketOpen,
    close: webSocketClose,
  } = useWebSocket(
    "wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false",
    {
      autoReconnect: true,
      heartbeat: {
        message: '{"event":"pusher:ping","data":{}}',
        interval: 120000,
        pongTimeout: 1000,
      },
      immediate: false,
      onConnected: (ws: WebSocket) => {
        console.log(`Connected to Kick ${chatOptions.value.kickChannel}`);
      },
      onDisconnected: (ws: WebSocket, event: CloseEvent) => {
        console.log(`Disconnected from Kick ${chatOptions.value.kickChannel}`);
      },
      onError: (ws: WebSocket, event: Event) => {
        console.log(`Error from Kick ${chatOptions.value.kickChannel}`);
      },
    }
  );

  function initChat() {
    // remove previous chat client
    if (webSocketStatus.value !== "CLOSED") {
      webSocketClose();
    }

    if (!kickChatroomId.value) {
      return;
    }

    webSocketOpen();
  }

  function onMessage() {
    if (webSocketData.value === null) {
      return;
    }
    const message: KickWebsocketMessage = JSON.parse(webSocketData.value);
    if (message.event === "pusher:connection_established") {
      console.log("Kick connection established");
      webSocketSend(
        `{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.${kickChatroomId.value}.v2"}}`
      );
    }
    if (message.event === "App\\Events\\ChatMessageEvent") {
      console.log("Kick chat");
      const data: KickWebsocketChatMessageEventData = JSON.parse(message.data);
      console.log(data);
      if (options.onBroadcasterMessage) {
        if (
          data.sender.identity.badges.some(
            (badge) => badge.type === "broadcaster"
          )
        ) {
          if (options.onBroadcasterMessage(data.content)) {
            return;
          }
        }
      }
      messages.value.push({
        chatMessageEventData: data,
        timestamp: new Date().getTime(),
      });
      if (chatOptions.value.maxChatSize !== undefined) {
        if (messages.value.length > chatOptions.value.maxChatSize) {
          messages.value = messages.value.slice(
            messages.value.length - chatOptions.value.maxChatSize
          );
        }
      }
    }
  }

  watch(
    () => ({
      chatOptions: chatOptions.value,
      kickChatroomId: kickChatroomId.value,
    }),
    (val) => {
      initChat();
    },
    { immediate: true }
  );

  watch(
    () => webSocketData.value,
    (val) => {
      onMessage();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    webSocketClose();
  });

  function clearChat() {
    messages.value = [];
  }

  return {
    chatItems,
    clearChat,
  };
}
