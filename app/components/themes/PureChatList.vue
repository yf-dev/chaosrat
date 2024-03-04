<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div
          class="nickname-icon"
          :style="{
            backgroundColor: hashToColor(hashCode(chat.nickname), 100, 70),
          }"
        ></div>
        <TextWithShadow
          class="message"
          :shadowSize="0.1"
          v-html="messageHtml(chat)"
        ></TextWithShadow>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatItem } from "~/lib/interfaces";
import { hashCode, messageHtml, hashToColor } from "~/lib/utils";

defineProps<{
  chatItems: ChatItem[];
}>();

const chatOptionsStore = useChatOptionsStore();
const { chatOptions } = storeToRefs(chatOptionsStore);
</script>

<style scoped>
.chat-container {
  position: relative;
  height: 100vh;
  width: 100vw;
}

.list {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.item {
  position: relative;
  margin: 0.4rem 0.8rem;
  color: rgba(255, 255, 255, 1);
  line-height: 2.5rem;
}

.nickname-icon {
  display: inline-block;
  width: 1.2rem;
  height: 1.2rem;
  border: 0.2rem solid rgba(0, 0, 0, 0.1);
  border-radius: 0.9rem;
  /* vertical-align: middle; */
  margin-right: 0.8rem;
}

.message {
  display: inline;
}

.message :deep(.emoji) {
  height: 1.8rem;
  vertical-align: middle;
}

.message :deep(.sticker) {
  width: 10rem;
  height: 10rem;
  vertical-align: middle;
}
</style>
