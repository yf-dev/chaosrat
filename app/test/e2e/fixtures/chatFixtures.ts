import type { TwitchIrcSendMessageOptions } from "./twitchIrc";
import { STICKER_KEYWORD } from "./network";

/**
 * Canonical, fixed chat fixture sets shared by the functional and visual
 * e2e specs. Every message uses a fixed `id` (not randomly generated)
 * because `cute` hashes `chat.id` and `pure` hashes `chat.nickname` into a
 * per-message accent color (`app/components/themes/cute/CuteChatBaseList.vue`,
 * `app/components/themes/pure/PureChatList.vue`) -- a random id/nickname
 * would make those themes' screenshots non-reproducible.
 *
 * Deliberately no emoji glyphs anywhere in this file: the emoji font
 * differs per OS/environment, which would make screenshot snapshots
 * non-reproducible across machines. Where a test wants to exercise an
 * "image inline with text" case, use a Twitch emote (`RICH`) or a sticker
 * (`STICKER`) instead -- both render from fixture PNGs, not a system font.
 */

/** A handful of ordinary messages: mixed short/long nicknames, ASCII and
 * Hangul text, no badges/emotes/stickers. */
export const BASIC_MESSAGES: TwitchIrcSendMessageOptions[] = [
  {
    id: "e2e-basic-0001",
    displayName: "Ann",
    message: "hello there",
  },
  {
    id: "e2e-basic-0002",
    displayName: "정말_긴_닉네임_테스트_계정_입니다",
    message: "안녕하세요, 반갑습니다!",
  },
  {
    id: "e2e-basic-0003",
    displayName: "Bob123456789",
    message: "gg wp, that was close!",
  },
];

/** One message with two badges, one emote, and text long enough to wrap
 * across multiple lines at the config's 1280px viewport width. The emote
 * ("Kappa", id 25) covers characters 86-90 of `message` -- computed once
 * and pinned here as a literal so a future edit to the message text doesn't
 * silently desync the offsets (see `tmi-utils`'s `parseEmotesInMessage`,
 * which reads `emotes` as `{ [id]: ["start-end", ...] }` against code-point
 * offsets into the message). */
const RICH_MESSAGE_TEXT =
  "This message intentionally runs long so it wraps across multiple lines " +
  "in the overlay Kappa and keeps going after the emote too";
export const RICH_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-rich-0001",
  displayName: "RichBroadcaster",
  message: RICH_MESSAGE_TEXT,
  badges: { broadcaster: "1", subscriber: "12" },
  emotes: "25:86-90",
};

/** A message containing a `~<keyword>` sticker marker matching
 * `network.ts`'s dccon fixture (`STICKER_KEYWORD`/`STICKER_PNG`). Requires
 * `isUseOpenDcconSelector=true` in the query string to activate. */
export const STICKER_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-sticker-0001",
  displayName: "StickerFan",
  message: `check this out ~${STICKER_KEYWORD} nice right`,
};

/**
 * Korean-wrapping stress fixtures for the responsive viewport matrix
 * (`visual.spec.ts`). ChaosRat is a Korean-first service and every theme's
 * `.chat-container` declares `word-break: keep-all` paired with
 * `overflow-wrap: anywhere` (verified by grep across
 * `components/themes/*\/*.vue`) -- `keep-all` keeps a 어절 (word) intact
 * whenever there's room, and `anywhere` (not `break-word`, which does not
 * reduce a shrink-to-fit box's min-content size) is what breaks inside a
 * 어절 only when there is no alternative, so nothing is allowed to overflow
 * the OBS source just to preserve a word. These four messages each isolate
 * one wrapping/overflow case so a future CSS change to either property
 * shows up as a diff instead of going unnoticed.
 */

/** A normal Korean sentence (with 어절-level spacing via spaces) long enough
 * to wrap across several lines even at the widest viewport (1280px). Pins
 * word-level (space-delimited) wrapping, which is unaffected by
 * `word-break` -- the contrast case against `LONG_HANGUL_RUN` below. */
const LONG_KOREAN_SENTENCE_TEXT =
  "이것은 오버레이가 아주 좁은 세로 화면이나 아주 짧은 가로 화면에 들어가도 " +
  "채팅 메시지가 올바르게 줄바꿈되는지 확인하기 위해 일부러 길게 작성한 " +
  "한국어 문장입니다 띄어쓰기가 포함되어 있으므로 어절 단위로 줄이 나뉘는지를 " +
  "기준으로 살펴봐 주세요";
export const LONG_KOREAN_SENTENCE_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-kowrap-sentence-0001",
  displayName: "KoreanSentence",
  message: LONG_KOREAN_SENTENCE_TEXT,
};

/** 90 Hangul syllables with no whitespace at all -- the `word-break` stress
 * case. There is no space-delimited 어절 boundary anywhere in this run, so
 * `word-break: keep-all` (today's state, all themes) has no word boundary to
 * preserve and the run is free to wrap; `overflow-wrap: anywhere` is what
 * actually performs that wrap without letting the run overflow its
 * container (`overflow-wrap: break-word` would not, since it doesn't reduce
 * a shrink-to-fit box's min-content size). Whatever renders today gets
 * baselined so a later change to either property is visible as a diff
 * rather than a surprise. */
const LONG_HANGUL_RUN_TEXT = "가나다라마바사아자차카타파하".repeat(7); // 98 chars, no spaces
export const LONG_HANGUL_RUN_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-kowrap-hangulrun-0001",
  displayName: "HangulRun",
  message: LONG_HANGUL_RUN_TEXT,
};

/** A long unbroken Latin/ASCII token (URL-shaped, 80+ chars, no spaces)
 * mixed with ordinary Korean text -- the classic "one giant word" overflow
 * case, and a useful contrast against `LONG_HANGUL_RUN_TEXT` since Latin
 * script and Hangul break under different Unicode line-breaking rules. Only
 * `overflow-wrap: anywhere` (which every theme now declares) can wrap
 * this at all, since there is no natural break opportunity in the token
 * itself. */
const LONG_ASCII_TOKEN = "https://example.com/" + "a".repeat(70) + "/tail";
const MIXED_ASCII_KOREAN_TEXT = `링크 확인해보세요 ${LONG_ASCII_TOKEN} 감사합니다`;
export const LONG_ASCII_TOKEN_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-kowrap-asciitoken-0001",
  displayName: "AsciiToken",
  message: MIXED_ASCII_KOREAN_TEXT,
};

/** A very long Korean nickname (30 syllables, no spaces) with an ordinary
 * short message. Nickname layout is a separate concern from message-body
 * layout: `video-master` truncates its `.nickname` cell with
 * `white-space: nowrap; text-overflow: ellipsis` while every other theme
 * wraps it, so this fixture pins both behaviours. */
export const LONG_KOREAN_NICKNAME_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-kowrap-nickname-0001",
  displayName:
    "이것은아주아주아주아주아주아주아주아주아주아주길게작성한한국어닉네임입니다",
  message: "안녕하세요",
};

/** The full Korean-wrapping scenario used by the responsive viewport matrix:
 * one message per case above, stacked in the order they're most useful to
 * read top-to-bottom in a screenshot. */
export const KOREAN_WRAP_MESSAGES: TwitchIrcSendMessageOptions[] = [
  LONG_KOREAN_SENTENCE_MESSAGE,
  LONG_HANGUL_RUN_MESSAGE,
  LONG_ASCII_TOKEN_MESSAGE,
  LONG_KOREAN_NICKNAME_MESSAGE,
];

/** The opposite extreme from every other fixture in this file: a
 * one-character nickname and a one-character message, with no badges,
 * emotes, or stickers. Every fixture above stresses *maximum* content; the
 * *minimum* content case is a distinct layout stress in its own right -- a
 * chat bubble, plate, or nickname strip sized down to almost nothing is
 * where padding, min-widths, border-radius, and the icon/badge row show up
 * disproportionately against a single glyph, which is exactly where a theme
 * most easily looks broken (a collapsed box, a squashed circle, misaligned
 * baseline). Meant to render alone in its own scenario/frame -- appending it
 * to another scenario's message list would let taller neighbouring messages
 * mask exactly the layout case this fixture exists to isolate. */
export const MINIMAL_MESSAGE: TwitchIrcSendMessageOptions = {
  id: "e2e-minimal-0001",
  displayName: "ㄱ",
  message: "ㅇ",
};
