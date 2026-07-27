import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { ref } from "vue";
import type { ChatItem, ChatOptions } from "~/lib/interfaces";
import DefaultChatList from "~/components/themes/default/DefaultChatList.vue";
import ColorfulChatList from "~/components/themes/colorful/ColorfulChatList.vue";
import VideoMasterChatList from "~/components/themes/video-master/VideoMasterChatList.vue";
import SimpleChatList from "~/components/themes/simple/SimpleChatList.vue";
import PureChatList from "~/components/themes/pure/PureChatList.vue";
import CuteChatBaseList from "~/components/themes/cute/CuteChatBaseList.vue";
import CuteChatLeftList from "~/components/themes/cute/CuteChatLeftList.vue";
import CuteChatRightList from "~/components/themes/cute/CuteChatRightList.vue";

// All theme components except PureChatList call `useChatOptionsStore()`
// (directly, or -- for CuteChatLeftList/CuteChatRightList -- transitively
// through CuteChatBaseList) purely to read `isHidePlatformIcon`. Mocking the
// store here avoids ever touching the real Pinia/`useRoute` machinery (that's
// already covered by useChatOptionsStore.test.ts); it also sidesteps a real
// hazard: `@nuxt/test-utils`'s `mountSuspended` reuses one shared NuxtApp (and
// therefore one shared Pinia instance) across every `it()` in this file, so a
// real store's `chatOptions` ref -- and whatever `route.query` it captured on
// its first construction -- would leak across tests instead of resetting.
mockNuxtImport("useChatOptionsStore", () => {
  return vi.fn();
});

function setChatOptions(overrides: Partial<ChatOptions> = {}) {
  vi.mocked(useChatOptionsStore).mockReturnValue({
    chatOptions: ref<ChatOptions>({
      isHidePlatformIcon: false,
      ...overrides,
    }),
  } as unknown as ReturnType<typeof useChatOptionsStore>);
}

function makeChatItem(overrides: Partial<ChatItem> = {}): ChatItem {
  return {
    platform: "chzzk",
    id: "c1",
    nickname: "nick_one",
    message: "hello world",
    timestamp: 1,
    extra: {},
    ...overrides,
  };
}

beforeEach(() => {
  setChatOptions();
});

// Table-driven: every theme component takes the same `chatItems` prop shape
// and renders (nickname + message, badges, platform icon) the same way in
// spirit even though markup/classes differ. Rather than writing near-
// identical deep tests per theme, mount each with the same small set of
// fixtures and assert only the things that would actually break: text
// renders, sanitized HTML lands as real DOM (not escaped text -- this is
// exactly what a `v-html`/`:html` regression would break), and badges/icon
// show up when supplied.
const themes: {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table entries hold differently-typed components
  component: any;
  extraProps?: Record<string, unknown>;
  hasIcon: boolean;
  hasBadges: boolean;
  hasNickname: boolean;
}[] = [
  {
    name: "DefaultChatList",
    component: DefaultChatList,
    hasIcon: true,
    hasBadges: true,
    hasNickname: true,
  },
  {
    name: "ColorfulChatList",
    component: ColorfulChatList,
    hasIcon: true,
    hasBadges: true,
    hasNickname: true,
  },
  {
    name: "VideoMasterChatList",
    component: VideoMasterChatList,
    hasIcon: true,
    hasBadges: true,
    hasNickname: true,
  },
  {
    name: "SimpleChatList",
    component: SimpleChatList,
    hasIcon: true,
    hasBadges: true,
    hasNickname: true,
  },
  {
    name: "CuteChatBaseList",
    component: CuteChatBaseList,
    extraProps: { align: "left" },
    hasIcon: true,
    hasBadges: true,
    hasNickname: true,
  },
  {
    name: "PureChatList",
    component: PureChatList,
    hasIcon: false,
    hasBadges: false,
    // PureChatList never renders the nickname text at all -- by design, it
    // only shows a hashed color dot -- so this is asserted explicitly below
    // rather than through the shared "hasNickname" table field.
    hasNickname: false,
  },
];

describe.each(themes)(
  "$name",
  ({ component, extraProps, hasIcon, hasBadges, hasNickname }) => {
    it("renders the message text (and nickname, if this theme shows one)", async () => {
      const items = [
        makeChatItem({ id: "m1", nickname: "alice", message: "hello there" }),
      ];
      const wrapper = await mountSuspended(component, {
        props: { chatItems: items, ...extraProps },
      });

      const root = wrapper.find(".chat-container");
      expect(root.exists()).toBe(true);
      expect(root.text()).toContain("hello there");
      if (hasNickname) {
        expect(root.text()).toContain("alice");
      } else {
        expect(root.text()).not.toContain("alice");
      }
    });

    it('renders a sticker marker as a real <img class="sticker"> element, not escaped text', async () => {
      const items = [
        makeChatItem({
          id: "m2",
          message: "look ~cat",
          extra: { stickers: { "~cat": "https://example.com/cat.png" } },
        }),
      ];
      const wrapper = await mountSuspended(component, {
        props: { chatItems: items, ...extraProps },
      });

      const img = wrapper.find("img.sticker");
      expect(img.exists()).toBe(true);
      expect(img.attributes("src")).toBe("https://example.com/cat.png");
      // If `:html`/`v-html` were dropped, the raw `<img ...>` string would
      // show up as literal text instead of becoming a real element.
      expect(wrapper.find(".chat-container").text()).not.toContain("<img");
    });

    if (hasBadges) {
      it("renders one badge image per entry in chat.extra.badges", async () => {
        const items = [
          makeChatItem({
            id: "m3",
            extra: {
              badges: {
                b1: "https://example.com/b1.png",
                b2: "https://example.com/b2.png",
              },
            },
          }),
        ];
        const wrapper = await mountSuspended(component, {
          props: { chatItems: items, ...extraProps },
        });

        expect(wrapper.findAll("img.badge")).toHaveLength(2);
      });

      it("renders no badge images when chat.extra.badges is absent", async () => {
        const items = [makeChatItem({ id: "m3b" })];
        const wrapper = await mountSuspended(component, {
          props: { chatItems: items, ...extraProps },
        });

        expect(wrapper.findAll("img.badge")).toHaveLength(0);
      });
    }

    if (hasIcon) {
      it("shows the platform icon by default, and hides it when isHidePlatformIcon is true", async () => {
        const items = [makeChatItem({ id: "m4" })];

        setChatOptions({ isHidePlatformIcon: false });
        const shown = await mountSuspended(component, {
          props: { chatItems: items, ...extraProps },
        });
        expect(shown.find("img.icon").exists()).toBe(true);

        setChatOptions({ isHidePlatformIcon: true });
        const hidden = await mountSuspended(component, {
          props: { chatItems: items, ...extraProps },
        });
        expect(hidden.find("img.icon").exists()).toBe(false);
      });
    }
  },
);

describe("CuteChatLeftList / CuteChatRightList", () => {
  // These are thin wrappers over CuteChatBaseList -- one test each is enough
  // to pin that they render the base component and forward `align` and
  // `chatItems` correctly; the base's actual rendering behavior is already
  // covered by the table above.
  it('CuteChatLeftList renders CuteChatBaseList with align="left" and forwards chatItems', async () => {
    const items = [makeChatItem({ id: "cl1", nickname: "bob", message: "yo" })];
    const wrapper = await mountSuspended(CuteChatLeftList, {
      props: { chatItems: items },
    });

    const base = wrapper.findComponent(CuteChatBaseList);
    expect(base.exists()).toBe(true);
    expect(base.props("align")).toBe("left");
    expect(base.props("chatItems")).toEqual(items);
  });

  it('CuteChatRightList renders CuteChatBaseList with align="right" and forwards chatItems', async () => {
    const items = [makeChatItem({ id: "cr1", nickname: "bob", message: "yo" })];
    const wrapper = await mountSuspended(CuteChatRightList, {
      props: { chatItems: items },
    });

    const base = wrapper.findComponent(CuteChatBaseList);
    expect(base.exists()).toBe(true);
    expect(base.props("align")).toBe("right");
    expect(base.props("chatItems")).toEqual(items);
  });
});
