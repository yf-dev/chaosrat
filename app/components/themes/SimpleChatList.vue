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
          <img
            v-for="(url, badgeId) in chat.extra.badges ?? {}"
            :key="badgeId"
            class="badge"
            :src="url"
          />
          <div class="nickname">
            <TextWithShadow
              :shadowSize="0.1"
              :style="{
                display: 'inline',
                color: hashToColor(hashCode(chat.nickname), 100, 70),
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
import { hashCode, messageHtml, hashToColor, iconUrl } from "~/lib/utils";

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

.nickname-box {
  display: inline;
}

.icon {
  display: inline-block;
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
  margin-right: 0.4rem;
  margin-bottom: 0.2rem;
}

.badge {
  display: inline-block;
  width: 1.8rem;
  height: 1.8rem;
  vertical-align: middle;
  margin-right: 0.4rem;
  margin-bottom: 0.2rem;
}

.nickname {
  display: inline-block;
  font-weight: bold;
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
