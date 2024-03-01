<template>
  <div class="container">
    <div class="row">
      <div class="col">
        <h1>ChaosRat - 채팅 오버레이 URL 생성</h1>
      </div>
    </div>
    <div class="card input-card">
      <div class="row">
        <div class="col-2">
          <label for="chzzkChannelId">치지직 채널 ID</label>
        </div>
        <div class="col input-with-prefix">
          <input
            type="text"
            class="form-control"
            id="chzzkChannelId"
            @input="chzzkChannelId = ($event.target as HTMLInputElement).value"
            :value="chzzkChannelId"
            placeholder="6d6e213a87a1fa5315a0da74ac15946e"
          />
          <p>
            치지직 채널 페이지 URL의 뒤쪽에서 확인할 수 있습니다.<br />
            ex) https://chzzk.naver.com/<b>6d6e213a87a1fa5315a0da74ac15946e</b>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="twitchChannel">트위치 채널 ID</label>
        </div>
        <div class="col">
          <input
            type="text"
            class="form-control"
            id="twitchChannel"
            @input="twitchChannel = ($event.target as HTMLInputElement).value"
            :value="twitchChannel"
            placeholder="sleeping_ce"
          />
          <p>
            트위치 채널 페이지 URL의 뒤쪽에서 확인할 수 있습니다.<br />
            ex) https://www.twitch.tv/<b>sleeping_ce</b>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="youtubeHandle">유튜브 채널 핸들</label>
        </div>
        <div class="col">
          <input
            type="text"
            class="form-control"
            id="youtubeHandle"
            @input="youtubeHandle = ($event.target as HTMLInputElement).value"
            :value="youtubeHandle"
            placeholder="@sleeping.c.elegans"
          />
          <p>
            유튜브 채널 페이지 URL의 뒤쪽에서 확인할 수 있습니다.<br />
            ex) https://www.youtube.com/<b>@sleeping.c.elegans</b>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="theme">테마</label>
        </div>
        <div class="col">
          <select
            class="form-control"
            id="theme"
            @change="
              theme = ($event.target as HTMLSelectElement).value as ChatTheme
            "
            :value="theme"
          >
            <option
              v-for="option in themeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="maxChatSize">최대 채팅 수</label>
        </div>
        <div class="col">
          <input
            type="number"
            class="form-control"
            id="maxChatSize"
            @input="
              maxChatSize = parseInt(
                ($event.target as HTMLInputElement).value,
                10
              )
            "
            :value="maxChatSize"
          />
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label>기타 옵션</label>
        </div>
        <div class="col">
          <input
            type="checkbox"
            class="form-check-input"
            id="isUseOpenDcconSelector"
            @change="
              isUseOpenDcconSelector = ($event.target as HTMLInputElement)
                .checked
            "
            :checked="isUseOpenDcconSelector"
          />
          <label class="form-check-label" for="isUseOpenDcconSelector">
            Open Dccon Selector에서 스티커 불러오기
          </label>
        </div>
      </div>
    </div>
    <div class="card result-card">
      <div class="row">
        <div class="col-2">
          <label for="chatOverlayUrl">채팅 오버레이 URL</label>
        </div>
        <div class="col input-with-button">
          <input
            type="text"
            readonly
            id="chatOverlayUrl"
            :value="chatOverlayUrl"
          />
          <button
            class="button primary"
            @click="copyChatOverlayUrl(chatOverlayUrl)"
          >
            {{ copiedChatOverlayUrl ? "복사됨" : "URL 복사" }}
          </button>
          <a class="button secondary" :href="chatOverlayUrl" target="_blank">
            열기
          </a>
        </div>
      </div>
    </div>
    <div class="card preview-card">
      <header>
        <h2>실시간 미리보기</h2>
      </header>
      <ClientOnly fallback-tag="div" fallback="Loading chats...">
        <iframe
          class="chat-overlay"
          :src="chatOverlayUrl"
          width="100%"
          frameborder="0"
          scrolling="no"
        ></iframe>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClipboard } from "@vueuse/core";
import type { ChatTheme } from "~/lib/interfaces";

useHead({
  title: "ChaosRat - 채팅 오버레이 URL 생성",
  bodyAttrs: {
    class: "index",
  },
});

const themeOptions: {
  value: ChatTheme;
  label: string;
}[] = [
  { value: "default", label: "기본" },
  { value: "colorful", label: "컬러풀" },
  { value: "video-master", label: "비디오마스터" },
];

const requestUrl = useRequestURL();

const chzzkChannelId = ref<string>("");
const twitchChannel = ref<string>("");
const youtubeHandle = ref<string>("");
const theme = ref<ChatTheme>("default");
const maxChatSize = ref<number>(100);
const isUseOpenDcconSelector = ref<boolean>(false);

const chatOverlayUrl = computed(() => {
  const url = new URL(requestUrl);
  url.pathname = "/chat";
  url.searchParams.set("chzzkChannelId", chzzkChannelId.value);
  url.searchParams.set("twitchChannel", twitchChannel.value);
  url.searchParams.set("youtubeHandle", youtubeHandle.value);
  url.searchParams.set("theme", theme.value);
  url.searchParams.set("maxChatSize", maxChatSize.value.toString());
  if (isUseOpenDcconSelector.value) {
    url.searchParams.set("isUseOpenDcconSelector", "true");
  }
  return url.toString();
});
const { copy: copyChatOverlayUrl, copied: copiedChatOverlayUrl } = useClipboard(
  {
    source: chatOverlayUrl,
  }
);
</script>

<style>
body.index {
  --bg-color: #ffffff;
  --bg-secondary-color: #f3f3f6;
  --color-primary: #14854f;
  --color-lightGrey: #d2d6dd;
  --color-grey: #747681;
  --color-darkGrey: #3f4144;
  --color-error: #d43939;
  --color-success: #28bd14;
  --grid-maxWidth: 120rem;
  --grid-gutter: 2rem;
  --font-size: 1.6rem;
  --font-color: #333333;
  --font-family-sans: "Pretendard Variable", Pretendard, -apple-system,
    BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI",
    "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
  --font-family-mono: monaco, "Consolas", "Lucida Console", monospace;
}
</style>

<style scoped>
.input-card {
  padding-top: 2rem;
}

.input-with-button {
  display: flex;
  align-items: flex-start;
}

.input-with-button input {
  margin-right: 1rem;
}

.input-with-button .button {
  flex-shrink: 0;
}

.result-card {
  margin-top: 2rem;
  padding-top: 2rem;
}
.preview-card {
  margin-top: 2rem;
}

.chat-overlay {
  height: 45rem;
}
</style>
