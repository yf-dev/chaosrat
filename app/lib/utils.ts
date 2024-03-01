import sanitizeHtml from "sanitize-html";
import type { ChatItem } from "./interfaces";
import {
  encodeURI as base64EncodeURI,
  decode as base64DecodeURI,
} from "js-base64";

/**
 * Escape curly braces and backslashes
 *
 * `{` -> `\\{`, `}` -> `\\}`, `\\` -> `\\\\`
 *
 * @param str - The string to escape
 * @returns The escaped string
 * @example
 * escapeFormatString("hi") // "hi"
 * escapeFormatString("{hi}") // "\\{hi\\}"
 * escapeFormatString("\\{hi\\}") // "\\\\{hi\\\\}"
 */
export function escapeFormatString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}");
}

/**
 * Unescape curly braces and backslashes
 *
 * `\\{` -> `{`, `\\}` -> `}`, `\\\\` -> `\\`
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
  targets: string[]
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
      encoded
    );
  }

  return {
    message: encodedMessage,
    targets: targetMap,
  };
}

export function messageHtml(
  chat: ChatItem,
  emojiToTag: (emojiUrl: string) => string,
  stickerToTag: (stickerUrl: string) => string
): string {
  // console.log(chat);
  let message = sanitizeHtml(chat.message);

  // replace emojis
  if (chat.extra.emojis) {
    for (const emoji in chat.extra.emojis) {
      message = message.replaceAll(emoji, emojiToTag(chat.extra.emojis[emoji]));
    }
  }

  // replace stickers
  if (chat.extra.stickers) {
    for (const sticker in chat.extra.stickers) {
      message = message.replaceAll(
        sticker,
        stickerToTag(chat.extra.stickers[sticker])
      );
    }
  }

  return message;
}

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    let chr = str.charCodeAt(i);
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
