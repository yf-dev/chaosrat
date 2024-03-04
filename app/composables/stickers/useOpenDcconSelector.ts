import type { DcconError, DcconResponse } from "~/lib/interfaces";

export function useOpenDcconSelector() {
  const chatOptionsStore = useChatOptionsStore();
  const { chatOptions } = storeToRefs(chatOptionsStore);

  const dcconUrl = ref<string | null>(null);
  const { stickerItems } = useDccon(dcconUrl);

  watch(
    () => ({
      chatOptions: chatOptions.value,
    }),
    async (val) => {
      if (
        !chatOptions.value.isUseOpenDcconSelector ||
        !chatOptions.value.twitchChannel
      ) {
        return;
      }
      const dcconResult = await $fetch<DcconResponse | DcconError>(
        "https://open-dccon-selector.update.sh/api/dccon-url",
        {
          query: { channel_name: chatOptions.value.twitchChannel },
        }
      );
      if ("dccon_url" in dcconResult) {
        console.log(`open dccon selector: dccon_url: ${dcconResult.dccon_url}`);
        dcconUrl.value = dcconResult.dccon_url;
      }
    },
    { immediate: true }
  );

  return {
    stickerItems,
  };
}
