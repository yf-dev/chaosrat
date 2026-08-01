import type { ChatItem, ChatPlatform } from "./interfaces";
import {
  encodeURI as base64EncodeURI,
  decode as base64DecodeURI,
} from "js-base64";

/**
 * Escape curly braces and backslashes
 *
 * Replaces, in order: `\` (backslash) with `\\`, then `{` with `\{`, then `}`
 * with `\}`. That line is written in actual characters. The `@example`
 * values below, by contrast, are JavaScript string literals, so every
 * backslash there is doubled to appear in source: one actual backslash is
 * written `"\\"`, two actual backslashes `"\\\\"`, and so on.
 *
 * @param str - The string to escape
 * @returns The escaped string
 * @example
 * escapeFormatString("hi") // "hi"
 * escapeFormatString("{hi}") // "\\{hi\\}"
 * escapeFormatString("\\{hi\\}") // "\\\\\\{hi\\\\\\}"
 */
export function escapeFormatString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
}

/**
 * Unescape curly braces and backslashes
 *
 * Replaces, in order: `\{` with `{`, then `\}` with `}`, then `\\` with `\`.
 * As above, that line is written in actual characters, while the
 * `@example` values below are JavaScript string literals (backslashes
 * doubled to appear in source).
 *
 * @param str - The string to unescape
 * @returns The unescaped string
 * @example
 * unescapeFormatString("hi") // "hi"
 * unescapeFormatString("\\{hi\\}") // "{hi}"
 * unescapeFormatString("\\\\{hi\\\\}") // "\\{hi\\}"
 */
export function unescapeFormatString(str: string): string {
  return str.replace(/\\{/g, "{").replace(/\\}/g, "}").replace(/\\\\/g, "\\");
}

/**
 * Encode the format string and targets
 *
 * all targets are encoded as {0}, {1}, {2}, ...
 * if the original message contains curly braces and backslashes, they are escaped
 * except for the targets
 *
 * @param message - The format string
 * @param targets - The targets to encode
 * @returns The encoded format string and targets
 * @example
 * encodeFormatString(
 *   "{fake_target} hi {true_target}",
 *   ["{true_target}"]
 * )
 * // {
 * //   message: "\\{fake_target\\} hi {0}",
 * //   targets: {
 * //     "{true_target}": "{0}",
 * //   },
 * // }
 */
export function encodeFormatString(
  message: string,
  targets: string[],
): {
  message: string;
  targets: {
    // key: original target, value: encoded target
    [key: string]: string;
  };
} {
  // create a map of original target to encoded target
  const targetMap: { [key: string]: string } = {};
  for (let i = 0; i < targets.length; i++) {
    targetMap[targets[i]] = `{${i}}`;
  }

  // escape curly braces and backslashes
  let encodedMessage = escapeFormatString(message);

  // replace original targets with encoded targets
  for (const [original, encoded] of Object.entries(targetMap)) {
    // if the original target contains curly braces and backslashes, they are not escaped
    // so we escape original targets before replacing them
    encodedMessage = encodedMessage.replaceAll(
      escapeFormatString(original),
      encoded,
    );
  }

  return {
    message: encodedMessage,
    targets: targetMap,
  };
}

/**
 * Escape a string for safe use as HTML text content and inside a
 * double-quoted HTML attribute value.
 *
 * `&` must be escaped first, otherwise the `&` produced by escaping `"`, `<`
 * and `>` would itself get escaped again.
 *
 * @param str - The string to escape
 * @returns The escaped string
 */
function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Escape a string for safe use as a literal (non-metacharacter) fragment
 * inside a `RegExp` pattern.
 *
 * Emoji/sticker codes are not guaranteed to be regex-safe text — Kick codes
 * look like `[emote:123:name]` and Chzzk codes like `{:id:}`, both full of
 * regex metacharacters that must match themselves and nothing else.
 *
 * @param str - The string to escape
 * @returns The escaped string
 * @example
 * escapeRegExp("[emote:123:name]") // "\\[emote:123:name\\]"
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emojiToTag(emojiUrl: string): string {
  return `<img class="emoji" src="${escapeHtml(emojiUrl)}" />`;
}

function stickerToTag(stickerUrl: string): string {
  return `<img class="sticker" src="${escapeHtml(stickerUrl)}" />`;
}

export function messageHtml(
  chat: ChatItem,
  emojiToTagFn: (emojiUrl: string) => string = emojiToTag,
  stickerToTagFn: (stickerUrl: string) => string = stickerToTag,
): string {
  // console.log(chat);
  // `chat.message` here is a *format string*: ChatOverlay.vue's
  // processedChatItems has already run encodeFormatString over the raw
  // message before this function ever sees it, so that a user-typed literal
  // "{0}" cannot collide with the "{0}"/"{1}"/... placeholder tokens real
  // emoji/sticker codes get rewritten to. Undoing that escape (via
  // unescapeFormatString) is this function's job and can't happen anywhere
  // else on the render path: the placeholder tokens have to survive intact
  // until substitution runs below, so unescaping has to happen after
  // substitution, not before it, and there is no later stage that gets
  // another look at the text.
  const message = escapeHtml(chat.message);

  // Collect every code -> replacement tag up front, keyed by the
  // HTML-escaped code (the message is HTML-escaped, so a key must be
  // escaped the same way to match it -- the production path hands over `{N}`
  // placeholder tokens from ChatOverlay's encodeFormatString, for which this
  // escape is a no-op, but callers are free to pass raw codes and the theme
  // tests do, so the function must not rely on that).
  // Emoji codes are inserted first and stickers are only added if the code
  // isn't already claimed, so a code present in both keeps the same
  // emoji-wins precedence the old sequential (emoji loop, then sticker
  // loop) order produced.
  const replacements = new Map<string, string>();
  if (chat.extra.emojis) {
    for (const emoji in chat.extra.emojis) {
      const key = escapeHtml(emoji);
      if (key === "") continue;
      replacements.set(key, emojiToTagFn(chat.extra.emojis[emoji]));
    }
  }
  if (chat.extra.stickers) {
    for (const sticker in chat.extra.stickers) {
      const key = escapeHtml(sticker);
      if (key === "" || replacements.has(key)) continue;
      replacements.set(key, stickerToTagFn(chat.extra.stickers[sticker]));
    }
  }

  if (replacements.size === 0) {
    return unescapeFormatString(message);
  }

  // A single combined regex, matched in one pass, is what makes this function
  // correct on its own terms. The previous code ran one `replaceAll` per
  // emoji/sticker in sequence, and each later `replaceAll` re-scanned text
  // that earlier iterations had already injected. A code that happened to be
  // a substring of an already-injected `<img class="emoji" src="..." />` tag
  // (e.g. "img", "src", "class", or even the quote character) would split
  // that tag apart mid-attribute. As the code stands, this can't actually
  // happen in production: ChatOverlay.vue's processedChatItems normalises
  // every emoji/sticker code to a `{N}` placeholder before messageHtml ever
  // runs, and a `{N}` token cannot be a substring of an injected tag, so this
  // was hardening a latent defect rather than closing a live one. But nothing
  // enforces that upstream normalisation from inside this function, so it
  // stays correct without depending on it. Matching every code against the
  // *original* escaped message in one `replace()` call means an injected tag
  // is never handed back to the regex engine to be re-matched. Codes are
  // sorted longest-first so a longer code (e.g. ":wave:extra:") wins over a
  // shorter code it happens to start with (":wave:"), and each code is
  // escaped for safe use inside the pattern since codes may contain regex
  // metacharacters (Kick codes like "[emote:123:name]", Chzzk codes like
  // "{:id:}"). The replacement is a callback rather than a string, so a
  // "$&"/"$1"-style sequence inside an emote URL is inserted literally
  // instead of being interpreted by String.prototype.replace as a
  // replacement pattern.
  const pattern = new RegExp(
    Array.from(replacements.keys())
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|"),
    "g",
  );

  // Every alternative in `pattern` came from a key already in `replacements`,
  // so a match can never fail the lookup; the non-null assertion just avoids
  // an untestable defensive branch for a case that cannot occur.
  //
  // The unescape has to run on the literal text *segments* between matches,
  // not on the finished HTML string, because a replacement tag is an emote
  // URL inserted verbatim (see the URL-integrity tests above, e.g. the "$&"
  // one) -- unescaping the finished string would also rewrite a `\` or `{`
  // that happens to sit inside that URL. `String.prototype.replace` gives no
  // hook for transforming the text between matches (only the matches
  // themselves), so a `matchAll` loop is used instead. This preserves the
  // single-pass property from above -- `pattern` still runs against the
  // *original* escaped `message`, so an injected tag is never re-scanned --
  // while unescaping each in-between segment on its way into the output.
  let html = "";
  let lastIndex = 0;
  for (const match of message.matchAll(pattern)) {
    html += unescapeFormatString(message.slice(lastIndex, match.index));
    html += replacements.get(match[0])!;
    lastIndex = match.index + match[0].length;
  }
  html += unescapeFormatString(message.slice(lastIndex));
  return html;
}

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function encodeUrlSafeBase64(str: string): string {
  return base64EncodeURI(str);
}

export function decodeUrlSafeBase64(str: string): string {
  return base64DecodeURI(str);
}

export function hashToColor(
  num: number,
  saturation: number = 100,
  lightness: number = 50,
): string {
  return `hsl(${(num % 360).toString()}, ${saturation}%, ${lightness}%)`;
}

export function iconUrl(platform: ChatPlatform): string {
  switch (platform) {
    case "chzzk":
      return "/chzzk.png";
    case "twitch":
      return "/twitch.png";
    case "youtube-live":
      return "/youtube.png";
    case "kick":
      return "/kick.png";
    default:
      return "";
  }
}

export function parseIntOrDefault(
  str: string,
  radix: number,
  defaultValue: number,
): number {
  const parsed = parseInt(str, radix);
  return isNaN(parsed) ? defaultValue : parsed;
}
