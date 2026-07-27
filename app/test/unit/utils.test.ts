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
  it("strips <script> tags and their content entirely", () => {
    const chat = makeChatItem({ message: "<script>alert(1)</script>hello" });
    expect(messageHtml(chat)).toBe("hello");
  });

  it("strips disallowed tags carrying event-handler attributes (e.g. onerror)", () => {
    const chat = makeChatItem({
      message: "<img src=x onerror=alert(1)>look",
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
    expect(html).toBe("look");
  });

  it("strips javascript: URLs from href attributes", () => {
    const chat = makeChatItem({
      message: '<a href="javascript:alert(1)">click</a>',
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("javascript:");
    expect(html).toBe("<a>click</a>");
  });

  it("strips onclick handlers while preserving a safe href", () => {
    const chat = makeChatItem({
      message: '<a href="https://example.com" onclick="evil()">ok</a>',
    });
    const html = messageHtml(chat);
    expect(html).not.toContain("onclick");
    expect(html).toBe('<a href="https://example.com">ok</a>');
  });

  it("lets legitimate, allow-listed formatting survive untouched", () => {
    const chat = makeChatItem({
      message: "plain & <b>bold</b> <i>italic</i> text",
    });
    expect(messageHtml(chat)).toBe(
      "plain &amp; <b>bold</b> <i>italic</i> text",
    );
  });

  it("substitutes emoji codes with the injected tag function, after sanitization", () => {
    const chat = makeChatItem({
      message: "<script>evil()</script>:wave:",
      extra: { emojis: { ":wave:": "https://cdn.example/wave.png" } },
    });
    const emojiToTagFn = vi.fn((url: string) => `[emoji:${url}]`);
    const html = messageHtml(chat, emojiToTagFn);
    // the <script> payload never reaches the output, regardless of the emoji dictionary
    expect(html).toBe("[emoji:https://cdn.example/wave.png]");
    expect(emojiToTagFn).toHaveBeenCalledWith("https://cdn.example/wave.png");
  });

  it("substitutes sticker codes with the injected tag function, after sanitization", () => {
    const chat = makeChatItem({
      message: "<img src=x onerror=evil()>:sticker:",
      extra: { stickers: { ":sticker:": "https://cdn.example/sticker.png" } },
    });
    const stickerToTagFn = vi.fn((url: string) => `[sticker:${url}]`);
    const html = messageHtml(chat, undefined, stickerToTagFn);
    expect(html).toBe("[sticker:https://cdn.example/sticker.png]");
    expect(stickerToTagFn).toHaveBeenCalledWith(
      "https://cdn.example/sticker.png",
    );
  });

  it("does not let a stripped tag's dangerous content be reconstructed via emoji substitution", () => {
    // The message tries to smuggle a script through a code that only exists
    // inside a tag sanitize-html removes; the emoji key must not match
    // anything surviving sanitization.
    const chat = makeChatItem({
      message: "<script>:code:</script> safe text",
      extra: { emojis: { ":code:": "https://cdn.example/e.png" } },
    });
    const html = messageHtml(chat);
    expect(html).toBe(" safe text");
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

  it("applies substitution inside surviving allow-listed tags (expected, not a hole)", () => {
    const chat = makeChatItem({
      message: "<b>:wave:</b> hi",
      extra: { emojis: { ":wave:": "https://cdn.example/wave.png" } },
    });
    const emojiToTagFn = (url: string) => `<img src="${url}">`;
    const html = messageHtml(chat, emojiToTagFn);
    expect(html).toBe('<b><img src="https://cdn.example/wave.png"></b> hi');
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
