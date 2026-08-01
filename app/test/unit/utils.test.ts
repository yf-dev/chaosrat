import { Window } from "happy-dom";
import {
  decodeUrlSafeBase64,
  encodeFormatString,
  encodeUrlSafeBase64,
  escapeFormatString,
  hashCode,
  hashToColor,
  iconUrl,
  messageHtml,
  parseIntOrDefault,
  unescapeFormatString,
} from "../../lib/utils";
import type { ChatItem, ChatPlatform } from "../../lib/interfaces";

// The `test/unit` project runs in vitest's `node` environment (no DOM), but
// this file needs real DOM parsing to prove a string is well-formed markup
// rather than merely eyeballing it via string matching -- string matching is
// exactly what let the single-pass substitution bug hide in the first place
// (a malformed-but-plausible-looking string can still contain the right
// substrings). `happy-dom` is already a project dependency (it backs the
// `nuxt` vitest environment), so it is instantiated directly here rather than
// pulling this file into the `nuxt` project just for a `<div>`.
function parseHtml(html: string): HTMLElement {
  const window = new Window();
  const div = window.document.createElement("div");
  div.innerHTML = html;
  return div as unknown as HTMLElement;
}

function makeChatItem(overrides: Partial<ChatItem> = {}): ChatItem {
  return {
    platform: "chzzk",
    id: "1",
    nickname: "tester",
    message: "",
    timestamp: 0,
    extra: {},
    ...overrides,
  };
}

describe("escapeFormatString", () => {
  it.each([
    ["hi", "hi"],
    ["{hi}", "\\{hi\\}"],
    // NOTE: the JSDoc @example on escapeFormatString claims this input
    // produces "\\\\{hi\\\\}" (2 backslashes per brace); the real
    // implementation actually produces 3 (verified by running the code).
    // The doc comment is stale — this asserts the real behaviour.
    ["\\{hi\\}", "\\\\\\{hi\\\\\\}"],
    ["", ""],
    ["\\", "\\\\"],
    ["{}", "\\{\\}"],
  ])("escapeFormatString(%j) === %j", (input, expected) => {
    expect(escapeFormatString(input)).toBe(expected);
  });
});

describe("unescapeFormatString", () => {
  it.each([
    ["hi", "hi"],
    ["\\{hi\\}", "{hi}"],
    ["\\\\{hi\\\\}", "\\{hi\\}"],
    ["", ""],
  ])("unescapeFormatString(%j) === %j", (input, expected) => {
    expect(unescapeFormatString(input)).toBe(expected);
  });

  it("is the inverse of escapeFormatString for arbitrary strings", () => {
    const samples = [
      "plain text",
      "{fake_target} hi {true_target}",
      "\\{escaped\\}",
      "back\\slash and {brace}",
    ];
    for (const sample of samples) {
      expect(unescapeFormatString(escapeFormatString(sample))).toBe(sample);
    }
  });
});

describe("encodeFormatString", () => {
  it("matches the documented example: escapes fake targets, encodes true targets", () => {
    const result = encodeFormatString("{fake_target} hi {true_target}", [
      "{true_target}",
    ]);
    expect(result.message).toBe("\\{fake_target\\} hi {0}");
    expect(result.targets).toEqual({ "{true_target}": "{0}" });
  });

  it("encodes multiple targets in order using positional indices", () => {
    const result = encodeFormatString("a b c", ["a", "b", "c"]);
    expect(result.message).toBe("{0} {1} {2}");
    expect(result.targets).toEqual({ a: "{0}", b: "{1}", c: "{2}" });
  });

  it("replaces every occurrence of a repeated target", () => {
    const result = encodeFormatString("dup dup dup", ["dup"]);
    expect(result.message).toBe("{0} {0} {0}");
  });

  it("leaves the message untouched aside from escaping when no targets are given", () => {
    const result = encodeFormatString("{already} braces", []);
    expect(result.message).toBe("\\{already\\} braces");
    expect(result.targets).toEqual({});
  });

  it("does nothing extra when a target never appears in the message", () => {
    const result = encodeFormatString("hello world", ["missing"]);
    expect(result.message).toBe("hello world");
    expect(result.targets).toEqual({ missing: "{0}" });
  });
});

describe("messageHtml — security boundary", () => {
  // All four platforms deliver plain text in chat.message; none send
  // intentional HTML. messageHtml() therefore HTML-escapes the message
  // instead of sanitizing it: markup is neutralised as inert text, not
  // removed, so nothing an escaped string produces can ever become a live
  // DOM element.
  it("neutralises <script> markup as inert escaped text rather than stripping it", () => {
    const chat = makeChatItem({ message: "<script>alert(1)</script>hello" });
    const html = messageHtml(chat);
    expect(html).toBe("&lt;script&gt;alert(1)&lt;/script&gt;hello");
    expect(html).not.toContain("<script");
  });

  it("neutralises tags carrying event-handler attributes (e.g. onerror) as inert text", () => {
    const chat = makeChatItem({
      message: "<img src=x onerror=alert(1)>look",
    });
    const html = messageHtml(chat);
    // "onerror" legitimately appears as inert text now; what matters is that
    // no <img element is created and no unescaped "<" survives.
    expect(html).not.toContain("<img");
    expect(html).toBe("&lt;img src=x onerror=alert(1)&gt;look");
  });

  it("neutralises javascript: URLs — no <a> element is ever produced", () => {
    const chat = makeChatItem({
      message: '<a href="javascript:alert(1)">click</a>',
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("<a");
    expect(html).toBe(
      "&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;",
    );
  });

  it("neutralises onclick handlers — no <a> element is ever produced", () => {
    const chat = makeChatItem({
      message: '<a href="https://example.com" onclick="evil()">ok</a>',
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("<a");
    expect(html).toBe(
      "&lt;a href=&quot;https://example.com&quot; onclick=&quot;evil()&quot;&gt;ok&lt;/a&gt;",
    );
  });

  it("renders formatting markup as inert text rather than live elements", () => {
    const chat = makeChatItem({
      message: "plain & <b>bold</b> <i>italic</i> text",
    });
    expect(messageHtml(chat)).toBe(
      "plain &amp; &lt;b&gt;bold&lt;/b&gt; &lt;i&gt;italic&lt;/i&gt; text",
    );
  });

  it("substitutes emoji codes with the injected tag function, after escaping", () => {
    const chat = makeChatItem({
      message: "<script>evil()</script>:wave:",
      extra: { emojis: { ":wave:": "https://cdn.example/wave.png" } },
    });
    const emojiToTagFn = vi.fn((url: string) => `[emoji:${url}]`);
    const html = messageHtml(chat, emojiToTagFn);
    // the <script> payload is escaped to inert text; the emoji code next to
    // it still substitutes normally.
    expect(html).toBe(
      "&lt;script&gt;evil()&lt;/script&gt;[emoji:https://cdn.example/wave.png]",
    );
    expect(emojiToTagFn).toHaveBeenCalledWith("https://cdn.example/wave.png");
  });

  it("substitutes sticker codes with the injected tag function, after escaping", () => {
    const chat = makeChatItem({
      message: "<img src=x onerror=evil()>:sticker:",
      extra: { stickers: { ":sticker:": "https://cdn.example/sticker.png" } },
    });
    const stickerToTagFn = vi.fn((url: string) => `[sticker:${url}]`);
    const html = messageHtml(chat, undefined, stickerToTagFn);
    expect(html).toBe(
      "&lt;img src=x onerror=evil()&gt;[sticker:https://cdn.example/sticker.png]",
    );
    expect(stickerToTagFn).toHaveBeenCalledWith(
      "https://cdn.example/sticker.png",
    );
  });

  it("substitutes an emoji code that sits inside escaped markup, without reviving that markup", () => {
    // Nothing is stripped anymore, so a code inside what used to be a
    // sanitizer-stripped tag now substitutes normally. That is still safe:
    // the injected content is a fixed `<img class="emoji" src="...">`
    // template with an escaped URL, and the surrounding <script> text stays
    // escaped — no live <script> element is ever produced.
    const chat = makeChatItem({
      message: "<script>:code:</script> safe text",
      extra: { emojis: { ":code:": "https://cdn.example/e.png" } },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      '&lt;script&gt;<img class="emoji" src="https://cdn.example/e.png" />&lt;/script&gt; safe text',
    );
    expect(html).not.toContain("<script");
  });

  it("uses the real default sticker tag builder when no custom function is provided", () => {
    const chat = makeChatItem({
      message: "hello :sticker:",
      extra: { stickers: { ":sticker:": "https://cdn.example/sticker.png" } },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      'hello <img class="sticker" src="https://cdn.example/sticker.png" />',
    );
  });

  it("applies substitution around escaped former-markup text (expected, not a hole)", () => {
    const chat = makeChatItem({
      message: "<b>:wave:</b> hi",
      extra: { emojis: { ":wave:": "https://cdn.example/wave.png" } },
    });
    const emojiToTagFn = (url: string) => `<img src="${url}">`;
    const html = messageHtml(chat, emojiToTagFn);
    expect(html).toBe(
      '&lt;b&gt;<img src="https://cdn.example/wave.png">&lt;/b&gt; hi',
    );
  });

  it("closes the layout-griefing vector: <table> markup is neutralised as inert text", () => {
    const chat = makeChatItem({
      message: "<table><tr><td>x</td></tr></table>",
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<tr");
    expect(html).not.toContain("<td");
  });

  it("closes the layout-griefing vector: <blockquote>/<h3> markup is neutralised as inert text", () => {
    const chat = makeChatItem({
      message: "<blockquote>q</blockquote><h3>big</h3>",
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("<blockquote");
    expect(html).not.toContain("<h3");
  });

  it("substitutes an emoji key containing HTML metacharacters after escaping", () => {
    // A code like "<3" contains HTML metacharacters. The message is
    // HTML-escaped before substitution runs, so the raw key "<3" would never
    // match the now-escaped "&lt;3" in the message unless the key is escaped
    // the same way. (In production, ChatOverlay normalises every code to a
    // `{N}` placeholder before messageHtml runs, so a raw code like "<3"
    // never actually reaches this function today — but the function must
    // still be correct for a key containing metacharacters on its own terms.)
    const chat = makeChatItem({
      message: "hey <3 there",
      extra: { emojis: { "<3": "https://cdn.example/heart.png" } },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      'hey <img class="emoji" src="https://cdn.example/heart.png" /> there',
    );
  });

  it("does not falsely substitute literal escaped-looking text typed by the user", () => {
    // The user literally typed the characters "&lt;3" (not an actual "<3").
    // escapeHtml is injective, so escaping that literal text produces
    // "&amp;lt;3", which must not collide with the escaped emoji key "&lt;3".
    const chat = makeChatItem({
      message: "look &lt;3 here",
      extra: { emojis: { "<3": "https://cdn.example/heart.png" } },
    });
    const html = messageHtml(chat);
    expect(html).toBe("look &amp;lt;3 here");
    expect(html).not.toContain("<img");
  });

  it("escapes double quotes in emoji/sticker URLs, preventing attribute breakout", () => {
    const chat = makeChatItem({
      message: ":evil:",
      extra: {
        emojis: {
          ":evil:": 'x.png" onerror="alert(1)" data-x="',
        },
      },
    });
    // Called with NO custom tag functions, so production's real
    // emojiToTag/stickerToTag defaults are exercised.
    const html = messageHtml(chat);
    // No literal double quote survives inside the src value, so the payload
    // can no longer break out of the attribute to inject a live onerror
    // handler — the string "onerror=" may still appear, but only as inert
    // text inside the escaped attribute value.
    expect(html).toBe(
      '<img class="emoji" src="x.png&quot; onerror=&quot;alert(1)&quot; data-x=&quot;" />',
    );
  });

  it("leaves a legitimate URL, including one with a query string containing '&', byte-identical aside from HTML-attribute escaping of '&'", () => {
    const chat = makeChatItem({
      message: ":wave:",
      extra: {
        emojis: {
          ":wave:": "https://cdn.example/emoji.png?a=1&b=2",
        },
      },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      '<img class="emoji" src="https://cdn.example/emoji.png?a=1&amp;b=2" />',
    );
  });

  // Sequential `replaceAll` (one call per code) re-scans text that an
  // earlier iteration already injected. When a later code happens to be a
  // substring of the *tag* injected for an earlier code (e.g. "img", "src",
  // "class", the quote character itself), the later replaceAll splits that
  // already-injected tag apart mid-attribute and produces malformed markup.
  // This can't actually happen through the production pipeline: ChatOverlay
  // normalises every emoji/sticker code to a `{N}` placeholder before
  // messageHtml runs, and a `{N}` token can never be a substring of an
  // injected `<img ... />` tag. This test pins messageHtml's own correctness
  // independent of that upstream placeholder encoding, rather than closing a
  // reachable production bug.
  it("does not let one substituted tag's own markup get re-scanned and split by a later code", () => {
    const chat = makeChatItem({
      message: "hi Kappa img",
      extra: {
        emojis: {
          Kappa: "https://cdn.example/kappa.png",
          img: "https://cdn.example/img.png",
        },
      },
    });
    const html = messageHtml(chat);

    const div = parseHtml(html);
    const imgs = div.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    for (const img of Array.from(imgs)) {
      const attrNames = Array.from(img.attributes).map((a) => a.name);
      expect(attrNames.sort()).toEqual(["class", "src"]);
    }
    expect(imgs[0].getAttribute("class")).toBe("emoji");
    expect(imgs[0].getAttribute("src")).toBe("https://cdn.example/kappa.png");
    expect(imgs[1].getAttribute("class")).toBe("emoji");
    expect(imgs[1].getAttribute("src")).toBe("https://cdn.example/img.png");
  });

  // Parameterised sweep over codes that are substrings of the fixed
  // `<img class="emoji" src="..." />` / `<img class="sticker" src="..." />`
  // templates themselves. Any of these, paired with an ordinary code in the
  // same message, can retrigger the same re-scan-and-split failure -- the
  // assertion that matters is that no matter which one wins the race, the
  // result never grows an attacker-controlled attribute, and in particular
  // never an `on*` event-handler attribute.
  it.each(["emoji", "img", "src", "class", "png", "https"])(
    "keeps output well-formed when a hostile code (%j) collides with the injected tag markup",
    (hostileCode) => {
      const chat = makeChatItem({
        // "wave" must be inserted (and thus its tag substituted) BEFORE the
        // hostile code is processed, so the hostile code's replaceAll pass
        // rescans text that already contains an injected tag -- object
        // key/insertion order controls iteration order in the emojis loop.
        message: `hello wave ${hostileCode}`,
        extra: {
          emojis: {
            wave: "https://cdn.example/wave.png",
            [hostileCode]: "https://cdn.example/hostile.png",
          },
        },
      });
      const html = messageHtml(chat);

      const div = parseHtml(html);
      const imgs = div.querySelectorAll("img");
      expect(imgs.length).toBe(2);
      for (const img of Array.from(imgs)) {
        const attrNames = Array.from(img.attributes).map((a) => a.name);
        for (const name of attrNames) {
          expect(name.startsWith("on")).toBe(false);
        }
        expect(attrNames.sort()).toEqual(["class", "src"]);
      }
    },
  );

  it("prefers the longer of two overlapping codes (longest-first matching)", () => {
    const chat = makeChatItem({
      message: "say :wave:extra: now",
      extra: {
        emojis: {
          ":wave:": "https://cdn.example/wave.png",
          ":wave:extra:": "https://cdn.example/wave-extra.png",
        },
      },
    });
    const html = messageHtml(chat);
    // The longer code ":wave:extra:" must win whole -- the shorter ":wave:"
    // must not consume a prefix of it and leave "extra:" as leftover text.
    expect(html).toBe(
      'say <img class="emoji" src="https://cdn.example/wave-extra.png" /> now',
    );
  });

  it("treats a code containing regex metacharacters literally (Kick/Chzzk-style bracketed codes)", () => {
    // Kick codes look like "[emote:123:name]", Chzzk like "{:d_01:}" -- both
    // contain characters ([, ], {, }, :) that are regex metacharacters.
    // Without escaping, "[emote:123:name]" would be parsed as a character
    // class and "{:d_01:}" would misparse the "{...}" as a quantifier.
    const chat = makeChatItem({
      message: "kick [emote:123:name] chzzk {:d_01:} end",
      extra: {
        emojis: {
          "[emote:123:name]": "https://cdn.example/kick-emote.png",
          "{:d_01:}": "https://cdn.example/chzzk-emote.png",
        },
      },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      'kick <img class="emoji" src="https://cdn.example/kick-emote.png" /> chzzk <img class="emoji" src="https://cdn.example/chzzk-emote.png" /> end',
    );
  });

  it("inserts an emote URL containing '$&' literally instead of interpreting it as a replacement pattern", () => {
    // If the substitution ever used a *string* replacement instead of a
    // callback, "$&" in the replacement text would be interpreted by
    // String.prototype.replace as "the whole match", corrupting the output.
    const chat = makeChatItem({
      message: ":wave:",
      extra: {
        emojis: {
          ":wave:": "https://cdn.example/a$&b.png",
        },
      },
    });
    const html = messageHtml(chat);
    // The "&" in the URL is correctly HTML-escaped to "&amp;" by emojiToTag
    // (unrelated to what this test is pinning); what matters is that "$&"
    // is NOT interpreted as a String.prototype.replace substitution pattern
    // (which would silently expand it to "the whole match" and corrupt the
    // URL into something other than a literal "$&amp;").
    expect(html).toBe(
      '<img class="emoji" src="https://cdn.example/a$&amp;b.png" />',
    );
  });

  it("ignores an empty-string emoji/sticker code instead of matching everywhere", () => {
    // An empty alternation branch in the combined regex would match at
    // every position in the string, corrupting output; empty keys must be
    // skipped when building the replacement map.
    const chat = makeChatItem({
      message: "hello :wave: world",
      extra: {
        emojis: {
          "": "https://cdn.example/should-not-appear.png",
          ":wave:": "https://cdn.example/wave.png",
        },
        stickers: {
          "": "https://cdn.example/should-not-appear-either.png",
        },
      },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      'hello <img class="emoji" src="https://cdn.example/wave.png" /> world',
    );
  });

  it("gives emoji precedence over a sticker sharing the same code", () => {
    const chat = makeChatItem({
      message: ":dup:",
      extra: {
        emojis: { ":dup:": "https://cdn.example/emoji-wins.png" },
        stickers: { ":dup:": "https://cdn.example/sticker-loses.png" },
      },
    });
    const html = messageHtml(chat);
    expect(html).toBe(
      '<img class="emoji" src="https://cdn.example/emoji-wins.png" />',
    );
  });
});

describe("hashCode", () => {
  it("is deterministic for the same input", () => {
    expect(hashCode("abc")).toBe(hashCode("abc"));
    expect(hashCode("hello world")).toBe(hashCode("hello world"));
  });

  it("matches known values for the documented algorithm", () => {
    expect(hashCode("abc")).toBe(96354);
    expect(hashCode("")).toBe(0);
    expect(hashCode("hello world")).toBe(1794106052);
  });

  it("returns a 32-bit signed integer", () => {
    const result = hashCode(
      "a fairly long string used to try to overflow the running hash total",
    );
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(result).toBeLessThan(2 ** 31);
  });
});

describe("encodeUrlSafeBase64 / decodeUrlSafeBase64", () => {
  it("round-trips ASCII text", () => {
    const original = "hello world!";
    expect(decodeUrlSafeBase64(encodeUrlSafeBase64(original))).toBe(original);
  });

  it("round-trips unicode text", () => {
    const original = "hello world! 안녕? 🎉";
    expect(decodeUrlSafeBase64(encodeUrlSafeBase64(original))).toBe(original);
  });

  it("round-trips the empty string", () => {
    expect(encodeUrlSafeBase64("")).toBe("");
    expect(decodeUrlSafeBase64("")).toBe("");
  });

  it("produces a URL-safe alphabet: '+' becomes '-' and padding is stripped", () => {
    // Bytes [0, 190, 255] are "AMK+w78=" in standard base64.
    const input = String.fromCharCode(0, 190, 255);
    const encoded = encodeUrlSafeBase64(input);
    expect(encoded).toBe("AMK-w78");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("=");
    expect(decodeUrlSafeBase64(encoded)).toBe(input);
  });

  it("produces a URL-safe alphabet: '/' becomes '_'", () => {
    // Bytes [0xfb, 0xff, 0xbf] are "w7vDv8K/" in standard base64.
    const input = String.fromCharCode(0xfb, 0xff, 0xbf);
    const encoded = encodeUrlSafeBase64(input);
    expect(encoded).toBe("w7vDv8K_");
    expect(encoded).not.toContain("/");
    expect(decodeUrlSafeBase64(encoded)).toBe(input);
  });

  it("does not throw on malformed/non-base64 input", () => {
    expect(() => decodeUrlSafeBase64("not-valid-base64!!!")).not.toThrow();
  });
});

describe("hashToColor", () => {
  it("returns a well-formed hsl() string with default saturation/lightness", () => {
    const color = hashToColor(96354);
    expect(color).toBe("hsl(234, 100%, 50%)");
    expect(color).toMatch(/^hsl\(-?\d+, \d+%, \d+%\)$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashToColor(96354)).toBe(hashToColor(96354));
  });

  it("wraps the hue into a [0, 360) range via modulo for large numbers", () => {
    expect(hashToColor(360)).toBe("hsl(0, 100%, 50%)");
    expect(hashToColor(720 + 45)).toBe("hsl(45, 100%, 50%)");
  });

  it("respects custom saturation and lightness", () => {
    expect(hashToColor(45, 50, 25)).toBe("hsl(45, 50%, 25%)");
  });

  it("does not normalize negative numbers into the positive range (JS % semantics)", () => {
    // Documents the current behaviour rather than an assumption: JS's `%`
    // preserves the sign of the dividend, so a negative hash produces a
    // negative degree value instead of wrapping into [0, 360).
    expect(hashToColor(-10)).toBe("hsl(-10, 100%, 50%)");
  });
});

describe("iconUrl", () => {
  it.each([
    ["chzzk", "/chzzk.png"],
    ["twitch", "/twitch.png"],
    ["youtube-live", "/youtube.png"],
    ["kick", "/kick.png"],
  ])("iconUrl(%j) === %j", (platform, expected) => {
    expect(iconUrl(platform as ChatPlatform)).toBe(expected);
  });

  it("returns an empty string for an unrecognized platform", () => {
    expect(iconUrl("unknown-platform" as ChatPlatform)).toBe("");
  });
});

describe("parseIntOrDefault", () => {
  it.each([
    ["42", 10, -1, 42],
    ["2a", 16, -1, 42],
    ["-7", 10, -1, -7],
    [" 42 ", 10, -1, 42],
  ])(
    "parseIntOrDefault(%j, %j, %j) === %j",
    (str, radix, defaultValue, expected) => {
      expect(parseIntOrDefault(str, radix, defaultValue)).toBe(expected);
    },
  );

  it("falls back to the default value for non-numeric input", () => {
    expect(parseIntOrDefault("not a number", 10, 7)).toBe(7);
    expect(parseIntOrDefault("", 10, 7)).toBe(7);
  });

  it("parses the numeric prefix rather than requiring the whole string to be numeric", () => {
    // Documents parseInt's native "parse a leading numeric prefix" behaviour,
    // e.g. maxChatSize=42abc from a hand-edited query string should not
    // silently become the default.
    expect(parseIntOrDefault("42abc", 10, -1)).toBe(42);
  });

  it("respects the provided radix", () => {
    expect(parseIntOrDefault("10", 2, -1)).toBe(2);
    expect(parseIntOrDefault("ff", 16, -1)).toBe(255);
  });
});
