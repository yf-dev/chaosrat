import type { DcconData, DcconError, StickerItem } from "~/lib/interfaces";

export function useDccon(dcconUrl: MaybeRefOrGetter<string | null>) {
  const dcconData = ref<DcconData | null>(null);

  const stickerItems = computed(() => {
    if (!dcconData.value) {
      return [];
    }
    const items: StickerItem[] = [];
    dcconData.value.dccons.forEach((dccon) => {
      dccon.keywords.forEach((keyword) => {
        items.push({
          id: keyword,
          url: dccon.path,
        });
      });
    });
    return items;
  });

  async function initSticker() {
    const url = toValue(dcconUrl);
    if (!url) {
      return;
    }
    const data = await $fetch<DcconData | DcconError>(url, {
      timeout: 1000,
    });
    if ("message" in data) {
      console.error(`Dccon Error: ${data.message}`);
      return;
    }
    console.log(`Dccon: ${url} loaded`);
    dcconData.value = data;
  }

  watch(
    () => ({
      dcconUrl: toValue(dcconUrl),
    }),
    async (val) => {
      await initSticker();
    },
    { immediate: true }
  );

  return {
    stickerItems,
  };
}
