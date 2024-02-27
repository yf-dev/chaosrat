<template>
  <ClientOnly fallback-tag="div" fallback="Loading chats...">
    <ChatOverlay
      :chzzkChannelId="chzzkChannelId"
      :twitchChannel="twitchChannel"
      :youtubeHandle="youtubeHandle"
      :theme="theme"
      :maxChatSize="maxChatSize"
      :isUseOpenDcconSelector="isUseOpenDcconSelector"
    ></ChatOverlay>
  </ClientOnly>
</template>

<script setup lang="ts">
useHead({
  title: "ChaosRat - 채팅 오버레이",
  bodyAttrs: {
    class: "chat",
  },
});
const route = useRoute();

const chzzkChannelId = computed(() => {
  if (Array.isArray(route.query.chzzkChannelId)) {
    return route.query.chzzkChannelId[0];
  }
  return route.query.chzzkChannelId;
});

const twitchChannel = computed(() => {
  if (Array.isArray(route.query.twitchChannel)) {
    return route.query.twitchChannel[0];
  }
  return route.query.twitchChannel;
});

const youtubeHandle = computed(() => {
  if (Array.isArray(route.query.youtubeHandle)) {
    return route.query.youtubeHandle[0];
  }
  return route.query.youtubeHandle;
});

const theme = computed(() => {
  if (Array.isArray(route.query.theme)) {
    return route.query.theme[0];
  }
  return route.query.theme;
});

const maxChatSize = computed(() => {
  if (Array.isArray(route.query.maxChatSize)) {
    if (route.query.maxChatSize[0] === null) {
      return null;
    }
    return Number.parseInt(route.query.maxChatSize[0], 10);
  }
  if (route.query.maxChatSize === null) {
    return null;
  }
  return Number.parseInt(route.query.maxChatSize, 10);
});

const isUseOpenDcconSelector = computed(() => {
  if (Array.isArray(route.query.isUseOpenDcconSelector)) {
    return !!route.query.isUseOpenDcconSelector[0];
  }
  return !!route.query.isUseOpenDcconSelector;
});
</script>

<style>
body.chat {
  --bg-color: transparent;
  --bg-secondary-color: #f3f3f6;
  --color-primary: #14854f;
  --color-lightGrey: #d2d6dd;
  --color-grey: #747681;
  --color-darkGrey: #3f4144;
  --color-error: #d43939;
  --color-success: #28bd14;
  --grid-maxWidth: 120rem;
  --grid-gutter: 2rem;
  --font-size: 1.8rem;
  --font-color: #333333;
  --font-family-sans: "Pretendard Variable", Pretendard, -apple-system,
    BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI",
    "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
  --font-family-mono: monaco, "Consolas", "Lucida Console", monospace;
}

body.chat {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
