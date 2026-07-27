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
    // Sort by length of id to match longer keyword first
    return items.sort((a, b) => b.id.length - a.id.length);
  });

  async function initSticker() {
    const url = toValue(dcconUrl);
    if (!url) {
      return;
    }
    try {
      const data = await $fetch<DcconData | DcconError>(url, {
        timeout: 10000,
      });
      if ("message" in data) {
        console.error(`Dccon Error: ${data.message}`);
        return;
      }
      if (!Array.isArray(data.dccons)) {
        console.error(`Dccon Error: malformed dccon data from ${url}`);
        return;
      }
      console.log(`Dccon: ${url} loaded`);
      dcconData.value = data;
    } catch (error) {
      console.error(`Dccon Error: failed to fetch ${url}: ${error}`);
    }
  }

  watch(
    () => ({
      dcconUrl: toValue(dcconUrl),
    }),
    async (_val) => {
      await initSticker();
    },
    { immediate: true },
  );

  return {
    stickerItems,
  };
}
