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
  --font-size: 1.8rem;
  --font-color: #333333;
  --font-family-sans: var(--chat-font-sans);
}

body.chat {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
