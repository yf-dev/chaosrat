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
          <span>치지직 채널 ID</span>
        </div>
        <div class="col input-with-prefix">
          <p>
            <span v-if="!isChzzkLoggedIn">
              치지직 채널에 연결하기 위해서는 먼저
              <button class="link" type="button" @click="loginToChzzk">
                치지직 로그인</button
              >이 필요합니다.<br />
            </span>
            <span v-else>
              현재 로그인한 치지직 채널: {{ chzzkMeChannelName }}(<button
                class="link"
                type="button"
                @click="logoutFromChzzk"
              >
                로그아웃</button
              >)<br />
            </span>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="twitchChannel">트위치 채널 ID</label>
        </div>
        <div class="col">
          <input
            id="twitchChannel"
            type="text"
            class="form-control"
            :value="twitchChannel"
            placeholder="sleeping_ce"
            @input="twitchChannel = ($event.target as HTMLInputElement).value"
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
            id="youtubeHandle"
            type="text"
            class="form-control"
            :value="youtubeHandle"
            placeholder="@sleeping.c.elegans"
            @input="youtubeHandle = ($event.target as HTMLInputElement).value"
          />
          <p>
            유튜브 채널 페이지 URL의 뒤쪽에서 확인할 수 있습니다.<br />
            ex) https://www.youtube.com/<b>@sleeping.c.elegans</b>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="kickChannel">Kick 채널 ID</label>
        </div>
        <div class="col">
          <input
            id="kickChannel"
            type="text"
            class="form-control"
            :value="kickChannel"
            placeholder="sleeping-c-elegans"
            @input="kickChannel = ($event.target as HTMLInputElement).value"
          />
          <p>
            Kick 채널 페이지 URL의 뒤쪽에서 확인할 수 있습니다.<br />
            ex) https://kick.com/<b>sleeping-c-elegans</b>
          </p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="theme">테마</label>
        </div>
        <div class="col">
          <select
            id="theme"
            class="form-control"
            :value="theme"
            @change="
              theme = ($event.target as HTMLSelectElement).value as ChatTheme
            "
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
            id="maxChatSize"
            type="number"
            class="form-control"
            :value="maxChatSize"
            @input="
              maxChatSize = parseIntOrDefault(
                ($event.target as HTMLInputElement).value,
                10,
                100,
              )
            "
          />
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="hiddenUsernameRegex">숨길 유저명</label>
        </div>
        <div class="col">
          <input
            id="hiddenUsernameRegex"
            type="text"
            class="form-control"
            :value="hiddenUsernameRegex"
            @input="
              hiddenUsernameRegex = ($event.target as HTMLInputElement).value
            "
          />
          <p>정규표현식(RegExp)으로 입력하세요.</p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="hiddenMessageRegex">숨길 메시지</label>
        </div>
        <div class="col">
          <input
            id="hiddenMessageRegex"
            type="text"
            class="form-control"
            :value="hiddenMessageRegex"
            @input="
              hiddenMessageRegex = ($event.target as HTMLInputElement).value
            "
          />
          <p>정규표현식(RegExp)으로 입력하세요.</p>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="soundEffectType">효과음 종류</label>
        </div>
        <div class="col">
          <div>
            <select
              id="soundEffectType"
              class="form-control"
              :value="soundEffectType"
              @change="
                soundEffectType = ($event.target as HTMLSelectElement)
                  .value as SoundEffectType
              "
            >
              <option
                v-for="option in soundEffectTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <div v-if="soundEffectType === 'custom'">
            <label for="soundEffectCustomUrl">효과음 URL</label>
            <input
              id="soundEffectCustomUrl"
              type="text"
              class="form-control"
              :value="soundEffectCustomUrl"
              placeholder="https://example.com/sound-effect.mp3"
              @input="
                soundEffectCustomUrl = ($event.target as HTMLInputElement).value
              "
            />
          </div>
        </div>
      </div>
      <div class="row">
        <div class="col-2">
          <label for="soundEffectVolume">효과음 볼륨</label>
        </div>
        <div class="col">
          <input
            id="soundEffectVolume"
            type="range"
            min="0"
            max="100"
            class="form-control"
            :value="soundEffectVolume"
            :disabled="soundEffectType === 'none'"
            @input="
              soundEffectVolume = parseIntOrDefault(
                ($event.target as HTMLInputElement).value,
                10,
                100,
              )
            "
          />
        </div>
        <div class="col-1">
          <div class="range-value">
            {{ soundEffectVolume }}
          </div>
        </div>
      </div>
      <div class="row">
        <fieldset class="option-group">
          <legend class="col-2">기타 옵션</legend>
          <div class="col">
            <div>
              <input
                id="isUseOpenDcconSelector"
                type="checkbox"
                class="form-check-input"
                :checked="isUseOpenDcconSelector"
                :disabled="!twitchChannel"
                @change="
                  isUseOpenDcconSelector = ($event.target as HTMLInputElement)
                    .checked
                "
              />
              <label class="form-check-label" for="isUseOpenDcconSelector">
                Open Dccon Selector에서 스티커 불러오기
                <span
                  class="tooltip"
                  title="트위치 채널 ID를 설정해야 동작합니다"
                  >?</span
                >
              </label>
            </div>
            <div>
              <input
                id="isHidePlatformIcon"
                type="checkbox"
                class="form-check-input"
                :checked="isHidePlatformIcon"
                @change="
                  isHidePlatformIcon = ($event.target as HTMLInputElement)
                    .checked
                "
              />
              <label class="form-check-label" for="isHidePlatformIcon">
                플랫폼 아이콘 숨기기
              </label>
            </div>
            <div>
              <input
                id="isDisableAnimation"
                type="checkbox"
                class="form-check-input"
                :checked="isDisableAnimation"
                @change="
                  isDisableAnimation = ($event.target as HTMLInputElement)
                    .checked
                "
              />
              <label class="form-check-label" for="isDisableAnimation">
                채팅 애니메이션 끄기
                <span
                  class="tooltip"
                  title="새 채팅은 아래에서 떠오르며 나타나고, 사라지는 채팅은 위로 밀려 올라가며 옅어지고, 그 사이 남은 채팅들은 새 위치로 부드럽게 이동합니다. 체크하면 이 움직임 없이 채팅이 즉시 나타나고 사라집니다"
                  >?</span
                >
              </label>
            </div>
          </div>
        </fieldset>
      </div>
    </div>
    <div class="card result-card">
      <div class="row">
        <div class="col-2">
          <label for="chatOverlayUrl">채팅 오버레이 URL</label>
        </div>
        <div class="col input-with-button">
          <input
            id="chatOverlayUrl"
            type="text"
            readonly
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
        />
      </ClientOnly>
    </div>
    <footer class="global-footer row">
      <a href="https://github.com/yf-dev/chaosrat">Github</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useClipboard, useTimeoutPoll } from "@vueuse/core";
import { BroadcastChannel } from "broadcast-channel";
import type {
  ChatTheme,
  SoundEffectType,
  ApiError,
  ChzzkAuthLoginResponse,
  ApiOk,
  ChzzkMeResponse,
} from "~/lib/interfaces";
import { encodeUrlSafeBase64, parseIntOrDefault } from "~/lib/utils";
import {
  createChzzkAuthBroadcast,
  type ChzzkAuthState,
} from "~/lib/chzzkAuthBroadcast";

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
  { value: "simple", label: "Simple" },
  { value: "pure", label: "Pure" },
  { value: "colorful", label: "Colorful" },
  { value: "video-master", label: "Video Master" },
  { value: "cute-left", label: "Cute Left" },
  { value: "cute-right", label: "Cute Right" },
];
const soundEffectTypeOptions: {
  value: SoundEffectType;
  label: string;
}[] = [
  { value: "none", label: "없음" },
  { value: "beep", label: "Beep" },
  { value: "bell", label: "Bell" },
  { value: "pingpong-bounce", label: "Pingpong Bounce" },
  { value: "retro-acute", label: "Retro Acute" },
  { value: "retro-blob", label: "Retro Blob" },
  { value: "retro-coin", label: "Retro Coin" },
  { value: "scifi-terminal", label: "Sci-fi Terminal" },
  { value: "synth-beep", label: "Synth Beep" },
  { value: "custom", label: "커스텀" },
];

const requestUrl = useRequestURL();

const chzzkChannelId = ref<string>("");
const chzzkMeChannelId = ref<string>("");
const chzzkMeChannelName = ref<string>("");
const twitchChannel = ref<string>("");
const youtubeHandle = ref<string>("");
const kickChannel = ref<string>("");
const theme = ref<ChatTheme>("default");
const maxChatSize = ref<number>(100);
const hiddenUsernameRegex = ref<string>("");
const hiddenMessageRegex = ref<string>("");
const soundEffectType = ref<SoundEffectType>("none");
const soundEffectVolume = ref<number>(100);
const soundEffectCustomUrl = ref<string>("");
const isUseOpenDcconSelector = ref<boolean>(false);
const isHidePlatformIcon = ref<boolean>(false);
const isDisableAnimation = ref<boolean>(false);

const isChzzkLoggedIn = ref<boolean>(false);

const chatOverlayUrl = computed(() => {
  const url = new URL(requestUrl);
  url.pathname = "/chat";
  if (chzzkChannelId.value) {
    url.searchParams.set("chzzkChannelId", chzzkChannelId.value);
  }
  if (twitchChannel.value) {
    url.searchParams.set("twitchChannel", twitchChannel.value);
    if (isUseOpenDcconSelector.value) {
      url.searchParams.set("isUseOpenDcconSelector", "true");
    }
  }
  if (youtubeHandle.value) {
    url.searchParams.set("youtubeHandle", youtubeHandle.value);
  }
  if (kickChannel.value) {
    url.searchParams.set("kickChannel", kickChannel.value);
  }
  if (theme.value !== "default") {
    url.searchParams.set("theme", theme.value);
  }
  if (maxChatSize.value !== 100) {
    url.searchParams.set("maxChatSize", maxChatSize.value.toString());
  }
  if (hiddenUsernameRegex.value) {
    url.searchParams.set(
      "hiddenUsernameRegex",
      encodeUrlSafeBase64(hiddenUsernameRegex.value),
    );
  }
  if (hiddenMessageRegex.value) {
    url.searchParams.set(
      "hiddenMessageRegex",
      encodeUrlSafeBase64(hiddenMessageRegex.value),
    );
  }
  if (soundEffectType.value !== "none") {
    url.searchParams.set("soundEffectType", soundEffectType.value);
    if (soundEffectType.value === "custom") {
      url.searchParams.set("soundEffectCustomUrl", soundEffectCustomUrl.value);
    }
    if (soundEffectVolume.value !== 100) {
      url.searchParams.set(
        "soundEffectVolume",
        soundEffectVolume.value.toString(),
      );
    }
  }

  if (isHidePlatformIcon.value) {
    url.searchParams.set("isHidePlatformIcon", "true");
  }
  if (isDisableAnimation.value) {
    url.searchParams.set("isDisableAnimation", "true");
  }
  return url.toString();
});
const { copy: copyChatOverlayUrl, copied: copiedChatOverlayUrl } = useClipboard(
  {
    source: chatOverlayUrl,
  },
);

async function loginToChzzk() {
  try {
    const response = await $fetch<ChzzkAuthLoginResponse | ApiError>(
      "/api/chzzk/auth/login",
      {
        query: { redirectTo: `${requestUrl.pathname}${requestUrl.search}` },
      },
    );
    if (response.status === "OK") {
      window.location.href = response.authUrl;
    } else {
      console.error("Failed to get Chzzk auth URL:", response);
    }
  } catch (e) {
    console.error("Failed to get Chzzk auth URL:", e);
  }
}

async function logoutFromChzzk() {
  try {
    const response = await $fetch<ApiOk | ApiError>("/api/chzzk/auth/logout", {
      method: "POST",
    });
    if (response.status === "OK") {
      applyChzzkAuthState({ status: "LOGIN_REQUIRED" });
      chzzkAuthBroadcast.publish({ status: "LOGIN_REQUIRED" });
    } else {
      console.error("Failed to logout from Chzzk:", response);
    }
  } catch (e) {
    console.error("Failed to logout from Chzzk:", e);
  }
}

// Applies a resolved auth state locally, whether it came from this tab's own
// check or from another tab's broadcast. Deliberately does not touch
// chzzkChannelId when moving to AUTHENTICATED if it's already set -- once
// populated, it must not be clobbered by a later check (see the "OK" branch
// below).
function applyChzzkAuthState(state: ChzzkAuthState) {
  if (state.status === "AUTHENTICATED") {
    isChzzkLoggedIn.value = true;
    if (!chzzkChannelId.value) {
      chzzkChannelId.value = state.channelId;
    }
    chzzkMeChannelId.value = state.channelId;
    chzzkMeChannelName.value = state.channelName;
  } else {
    isChzzkLoggedIn.value = false;
    chzzkMeChannelId.value = "";
    chzzkMeChannelName.value = "";
    chzzkChannelId.value = "";
  }
}

// Cross-tab push: lets another tab's login/logout show up here immediately,
// instead of waiting for this tab's own 60s poll below to catch up. See
// `lib/chzzkAuthBroadcast.ts`.
const chzzkAuthBroadcast = createChzzkAuthBroadcast({
  createChannel: (name) => new BroadcastChannel(name),
  onRemoteState: applyChzzkAuthState,
});

// Only refresh the CHZZK token once, as a mount-time keep-alive -- NOT on
// every poll tick. The refresh token is single-use (see the comment block at
// the top of server/api/chzzk/auth/refresh.ts), so rotating it every 60s in
// every open settings tab would invalidate it out from under itself.
let hasRefreshedChzzkToken = false;

async function checkChzzkAuth() {
  try {
    // A stalled request must not wedge the poll forever: useTimeoutPoll's
    // loop is `await fn(); start();`, so the next tick only arms once this
    // call settles, and $fetch has no default timeout.
    const response = await $fetch<ChzzkMeResponse | ApiError>("/api/chzzk/me", {
      timeout: 5000,
    });
    if (response.status === "OK") {
      const state: ChzzkAuthState = {
        status: "AUTHENTICATED",
        channelId: response.channelId,
        channelName: response.channelName,
      };
      applyChzzkAuthState(state);
      chzzkAuthBroadcast.publish(state);

      if (!hasRefreshedChzzkToken) {
        hasRefreshedChzzkToken = true;
        try {
          await $fetch<ApiOk | ApiError>("/api/chzzk/auth/refresh", {
            method: "POST",
            timeout: 5000,
          });
        } catch (e) {
          console.error("Failed to refresh Chzzk token:", e);
        }
      }
    } else {
      // An explicit ERROR envelope from our own server: the user genuinely
      // has no valid session.
      applyChzzkAuthState({ status: "LOGIN_REQUIRED" });
      chzzkAuthBroadcast.publish({ status: "LOGIN_REQUIRED" });
    }
  } catch (e) {
    // A thrown $fetch is a network/timeout failure, not a definitive answer
    // -- leave the existing state alone rather than flipping to logged-out.
    console.error("Failed to check Chzzk me:", e);
  }
}

useTimeoutPoll(checkChzzkAuth, 60_000, { immediate: true });

onScopeDispose(() => {
  void chzzkAuthBroadcast.close();
});
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
  --font-family-sans: var(--chat-font-sans);
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

.warning {
  color: var(--color-error);
}

.link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  display: inline;
  color: var(--color-primary);
  cursor: pointer;
}

.tooltip {
  display: inline-block;
  font-size: 1.1rem;
  font-weight: bold;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.8rem;
  text-align: center;
  background-color: var(--color-lightGrey);
  cursor: help;
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

.global-footer {
  margin: 2rem 0;
  padding-top: 2rem;
  justify-content: center;
}

/* The "기타 옵션" group is a <fieldset>/<legend> for correct group
   semantics, but browsers wrap a fieldset's non-legend children in an
   internal anonymous box that does not behave as a normal flex item (it
   ignores the flex-basis chota's .col sets and wraps onto its own line
   instead of sitting beside the legend). `display: contents` removes the
   fieldset's own generated box so its children (the legend and the .col
   div) become direct flex items of the surrounding .row, exactly like
   every other row on this page — while <legend> stays a real DOM child of
   <fieldset>, which is all the accessible-name association requires. */
.option-group {
  display: contents;
}

legend {
  /* Chrome sizes <legend> to fit its content regardless of the flex-basis
     `.col-2` sets, so it must be forced to fill the flex item explicitly.
     `margin` is left alone: chota's `[class^="col-"]` rule supplies the
     +margin that lines columns up with the gutter, and a scoped
     `legend { margin: 0 }` would outrank it (Vue's scoping attribute bumps
     the type selector's specificity above a plain class selector). */
  width: 100%;
  padding: 0;
  text-transform: none;
  font-size: inherit;
  letter-spacing: normal;
}

input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
