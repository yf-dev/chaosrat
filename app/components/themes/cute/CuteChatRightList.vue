<template>
  <CuteChatBaseList :chat-items="chatItems" align="right" />
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
defineProps<{
  chatItems: ChatItem[];
}>();
</script>
