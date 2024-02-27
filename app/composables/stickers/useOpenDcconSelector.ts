import type { DcconError, DcconResponse } from "~/lib/interfaces";

export function useOpenDcconSelector(
  channelName: MaybeRefOrGetter<string | null>
) {
  const dcconUrl = ref<string | null>(null);
  const { stickerItems } = useDccon(dcconUrl);

  watch(
    () => ({
      channelName: toValue(channelName),
    }),
    async (val) => {
      if (!val.channelName) {
        return;
      }
      const dcconResult = await $fetch<DcconResponse | DcconError>(
        "https://open-dccon-selector.update.sh/api/dccon-url",
        {
          query: { channel_name: val.channelName },
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
