<template>
  <div class="chat-container">
    <div class="list">
      <div v-for="chat in chatItems" :key="chat.id" class="item">
        <div class="nickname-box">
          <img
            v-if="!chatOptions.isHidePlatformIcon"
            class="icon"
            :src="iconUrl(chat.platform)"
          />
          <div
            v-if="Object.keys(chat.extra.badges ?? {}).length > 0"
            class="badge-box"
          >
            <img
              v-for="(url, badgeId) in chat.extra.badges ?? {}"
              :key="badgeId"
              class="badge"
              :src="url"
            />
          </div>
          <div class="nickname">
            <TextWithShadow
              :shadowSize="0.1"
              :style="{
                display: 'inline',
              }"
            >
              {{ chat.nickname }}
            </TextWithShadow>
          </div>
        </div>
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
import { messageHtml, iconUrl } from "~/lib/utils";

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
  background-color: rgba(0, 0, 0, 0.3);
  margin: 0.8rem;
  color: rgba(255, 255, 255, 1);
}

.nickname-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem;
  background-color: rgba(0, 0, 0, 0.3);
}

.icon {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.badge-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.badge {
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
}

.nickname {
  font-weight: bold;
}

.message {
  padding: 0.8rem;
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
