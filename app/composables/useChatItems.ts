import type { ChatItem } from "~/lib/interfaces";

export interface ChatItemsOptions {
  /**
   * Filter function to filter chat items
   * @param chatItem The chat item to be filtered
   * @returns true if the chat item should be included, false otherwise
   */
  filter?: (chatItem: ChatItem) => boolean;

  /**
   * Callback when a new chat item is added
   *
   * Be careful with this callback, chatItem is the latest chat item,
   * so it could be missed if the chatItems are updated too fast.
   * @param chatItem The latest chat item
   */
  onNewChatItem?: (chatItem: ChatItem) => void;
}

export function useChatItems(options: ChatItemsOptions) {
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);

  const { onBroadcasterMessage } = useCommand({
    onClear: () => {
      chzzkClearChat();
      twitchClearChat();
      youtubeLiveClearChat();
      kickClearChat();
    },
  });

  const { chatItems: chzzkChatItems, clearChat: chzzkClearChat } = useChzzk({
    onBroadcasterMessage: onBroadcasterMessage,
  });
  const { chatItems: twitchChatItems, clearChat: twitchClearChat } = useTwitch({
    onBroadcasterMessage: onBroadcasterMessage,
  });
  const { chatItems: youtubeLiveChatItems, clearChat: youtubeLiveClearChat } =
    useYoutubeLive({
      onBroadcasterMessage: onBroadcasterMessage,
    });
  const { chatItems: kickChatItems, clearChat: kickClearChat } = useKick({
    onBroadcasterMessage: onBroadcasterMessage,
  });

  const chatItems = computed(() => {
    return [
      ...chzzkChatItems.value,
      ...twitchChatItems.value,
      ...youtubeLiveChatItems.value,
      ...kickChatItems.value,
    ]
      .filter(options.filter ?? (() => true))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-(chatOptions.value.maxChatSize ?? 100));
  });

  const latestChatTimestamp = ref<number>(0);
  watch(
    () => chatItems.value,
    (items) => {
      if (items.length === 0) {
        return;
      }
      const lastItem = items[items.length - 1];
      if (lastItem.timestamp > latestChatTimestamp.value) {
        latestChatTimestamp.value = lastItem.timestamp;
        options.onNewChatItem?.(lastItem);
      }
    },
    { immediate: true }
  );
  return { chatItems };
}
