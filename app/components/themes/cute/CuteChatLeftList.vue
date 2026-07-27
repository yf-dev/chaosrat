<template>
  <CuteChatBaseList :chat-items="chatItems" align="left" />
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
defineProps<{
  chatItems: ChatItem[];
}>();
</script>
