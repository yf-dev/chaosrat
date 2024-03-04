<template>
  <ClientOnly fallback-tag="div" fallback="Loading chats...">
    <ChatOverlay />
  </ClientOnly>
</template>

<script setup lang="ts">
useHead({
  title: "ChaosRat - 채팅 오버레이",
  bodyAttrs: {
    class: "chat",
  },
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
