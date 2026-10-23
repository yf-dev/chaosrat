import type { ChatItem } from "~/lib/interfaces";
import { createChatFilterCoordinator } from "~/lib/chatFilterCoordinator";

export function useChatFilter(
  patterns: () => {
    hiddenUsernameRegex?: string;
    hiddenMessageRegex?: string;
  },
) {
  const revision = ref(0);
  const coordinator = createChatFilterCoordinator({
    createWorker: () =>
      new Worker(new URL("../lib/chatFilterWorker.ts", import.meta.url), {
        type: "module",
      }),
    onChange: () => revision.value++,
  });

  onScopeDispose(() => coordinator.dispose());

  return (items: ChatItem[]): ChatItem[] => {
    // The synchronous useChatItems computed subscribes to async worker results.
    void revision.value;
    const { hiddenUsernameRegex, hiddenMessageRegex } = patterns();
    coordinator.setPatterns(
      hiddenUsernameRegex ?? "",
      hiddenMessageRegex ?? "",
    );
    if (!hiddenUsernameRegex && !hiddenMessageRegex) return items;
    coordinator.setActiveItems(items);
    return items.filter((chat) =>
      coordinator.includes(chat.nickname, chat.message),
    );
  };
}
