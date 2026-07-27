import type { Page, WebSocketRoute } from "@playwright/test";

/**
 * tmi.js connects from the browser to
 * `wss://irc-ws.chat.twitch.tv:443/` with the `irc` WebSocket subprotocol
 * (confirmed in node_modules/tmi.js/lib/client.js:1155-1162 -- it builds the
 * URL as `${secure ? 'wss' : 'ws'}://${server}:${port}/` and calls
 * `new WebSocket(url, 'irc', ...)`). This mock intercepts that connection
 * with `page.routeWebSocket` in mock mode (no `connectToServer()` call --
 * there is no real IRC server involved) and speaks just enough of the
 * Twitch IRC protocol for tmi.js to consider itself connected and joined.
 *
 * `routeWebSocket`'s predicate is a `(url: URL) => boolean` function rather
 * than a string/RegExp glob on purpose: the real URL includes an explicit
 * `:443` port (`wss://irc-ws.chat.twitch.tv:443/`) which trips up naive
 * string patterns. Matching on `url.hostname` sidesteps that entirely.
 *
 * The `'irc'` subprotocol did NOT cause any trouble with `routeWebSocket` in
 * testing -- Playwright accepts the mocked connection regardless of the
 * requested subprotocol, so no `addInitScript`/`window.WebSocket` shim
 * fallback was needed.
 */

export interface TwitchIrcSendMessageOptions {
  /** Becomes both the PRIVMSG `id` tag and, prefixed with `twitch-`, the
   * resulting ChatItem.id -- keep this fixed across test runs, since
   * `cute`/`pure` hash the id into a per-message color. */
  id: string;
  displayName: string;
  message: string;
  /** e.g. `{ broadcaster: "1", subscriber: "12" }` -- rendered into the
   * `badges` IRC tag as `broadcaster/1,subscriber/12`. */
  badges?: Record<string, string>;
  /** Raw IRC `emotes` tag value, e.g. `"25:86-90"` (id:start-end, matching
   * `tmi-utils`'s `parseEmotesInMessage` input format exactly -- start/end
   * are code-point offsets into `message`). */
  emotes?: string;
  /** Defaults to a value deterministically derived from `displayName`. */
  userId?: string;
  /** Defaults to a fixed color. */
  color?: string;
  /** Shorthand for `badges: { ...badges, broadcaster: "1" }` -- this is
   * what `useCommand`'s `onBroadcasterMessage` gate checks
   * (`tags.badges?.broadcaster === "1"`). */
  broadcaster?: boolean;
}

export interface TwitchIrcMock {
  /** The lowercase, non-`#`-prefixed channel name this mock joins clients
   * into -- pass the same value as the `twitchChannel` query param. */
  channel: string;
  sendMessage(opts: TwitchIrcSendMessageOptions): Promise<void>;
  sendClearChat(): Promise<void>;
  sendMessageDeleted(targetMsgId: string): Promise<void>;
  sendBan(targetUserId: string): Promise<void>;
  /** Escape hatch for anything the typed helpers above don't cover. A
   * trailing `\r\n` is appended if missing. */
  sendRaw(line: string): Promise<void>;
  /** Resolves once tmi.js has logged `Connected to Twitch <channel>` to the
   * console (see `useTwitch.ts`'s `connected` handler). Must be called
   * (and awaited) after navigation, since the listener is a one-shot
   * `page.waitForEvent('console', ...)` armed at install time -- awaiting
   * it twice on the same mock instance hangs forever after the first
   * resolution. `openOverlay` in `overlay.ts` already does this for you. */
  waitForConnected(): Promise<void>;
}

export interface InstallTwitchIrcMockOptions {
  /** Defaults to `"e2e_channel"`. Case-insensitive; stored lowercase. */
  channel?: string;
}

/** Small deterministic string hash (not cryptographic) used to derive
 * stable numeric ids from names, so fixtures never depend on Math.random()
 * or wall-clock time. */
function stableNumericId(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return String(100_000_000 + (hash % 900_000_000));
}

/** IRC nicks (the `nick!user@host` prefix on PRIVMSG etc.) must be
 * ASCII-safe; display names in fixtures may contain Hangul or spaces
 * (that's the point -- ChaosRat renders `tags['display-name']`, never the
 * raw nick), so the wire-level nick is derived from the message `id`
 * instead and is otherwise irrelevant to the app under test. */
function ircSafeNick(seed: string): string {
  const cleaned = seed.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return `u${cleaned || stableNumericId(seed)}`;
}

/** IRCv3 tag-value escaping (backslash, semicolon, space, CR, LF) per the
 * spec tmi.js's parser un-escapes on the way in. Fixture text in practice
 * never needs this, but tag values built from arbitrary strings (e.g.
 * `displayName`) should not be able to break the tag framing. */
function escapeTagValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\:")
    .replace(/ /g, "\\s")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export async function installTwitchIrcMock(
  page: Page,
  options: InstallTwitchIrcMockOptions = {},
): Promise<TwitchIrcMock> {
  const channel = (options.channel ?? "e2e_channel").toLowerCase();
  const channelTarget = `#${channel}`;
  const roomId = stableNumericId(channelTarget);

  let activeWs: WebSocketRoute | null = null;
  let nick = "";
  let tsCounter = 1_700_000_000_000;

  // Armed now, before navigation, so the one-shot console event can never
  // be missed. useTwitch.ts's `connected` handler does
  // `console.log(\`Connected to Twitch ${twitchChannel}\`)`.
  const connectedPromise = page
    .waitForEvent("console", {
      predicate: (msg) => msg.text() === `Connected to Twitch ${channel}`,
      timeout: 30_000,
    })
    .then(() => undefined);
  // Prevent an "unhandled rejection" warning if the test never calls
  // waitForConnected() (e.g. a test that only cares about the builder page).
  connectedPromise.catch(() => {});

  function send(line: string) {
    if (!activeWs) {
      throw new Error(
        "twitchIrc mock: no active WebSocket connection to irc-ws.chat.twitch.tv yet " +
          "-- navigate to a page with a matching ?twitchChannel= query param first.",
      );
    }
    activeWs.send(line);
  }

  function sendWelcomeBurst() {
    send(
      [
        `:tmi.twitch.tv 001 ${nick} :Welcome, GLHF!`,
        `:tmi.twitch.tv 002 ${nick} :Your host is tmi.twitch.tv`,
        `:tmi.twitch.tv 003 ${nick} :This server is rather new`,
        `:tmi.twitch.tv 004 ${nick} :-`,
        `:tmi.twitch.tv 375 ${nick} :-`,
        `:tmi.twitch.tv 372 ${nick} :You are in a maze of twisty passages, all alike.`,
        `:tmi.twitch.tv 376 ${nick} :>`,
        "",
      ].join("\r\n"),
    );
  }

  function sendJoinBurst(joinedChannel: string) {
    // Sent as several frames on purpose (as opposed to the welcome burst's
    // single frame) to exercise both framing shapes tmi.js's `_onMessage`
    // must handle (it splits each incoming frame on `\r\n`).
    send(`:${nick}!${nick}@${nick}.tmi.twitch.tv JOIN ${joinedChannel}\r\n`);
    send(
      [
        `:tmi.twitch.tv 353 ${nick} = ${joinedChannel} :${nick}`,
        `:tmi.twitch.tv 366 ${nick} ${joinedChannel} :End of /NAMES list`,
        "",
      ].join("\r\n"),
    );
    send(
      `@emote-only=0;followers-only=-1;r9k=0;rituals=0;room-id=${roomId};slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE ${joinedChannel}\r\n`,
    );
  }

  function handleIncomingLine(line: string) {
    if (line.length === 0) {
      return;
    }
    if (line.startsWith("CAP REQ")) {
      const caps = line.slice("CAP REQ :".length).trim();
      send(`:tmi.twitch.tv CAP * ACK :${caps}\r\n`);
      return;
    }
    if (line.startsWith("PASS ")) {
      // Anonymous (justinfan) auth -- nothing to validate.
      return;
    }
    if (line.startsWith("NICK ")) {
      nick = line.slice("NICK ".length).trim();
      sendWelcomeBurst();
      return;
    }
    if (line.startsWith("JOIN ")) {
      const joinedChannel = line.slice("JOIN ".length).trim().toLowerCase();
      sendJoinBurst(joinedChannel);
      return;
    }
    if (line === "PING") {
      send("PONG :tmi.twitch.tv\r\n");
      return;
    }
    if (line.startsWith("PONG")) {
      // The client answering a server-initiated PING (this mock never
      // sends one, but tolerate it rather than treating it as unknown).
      return;
    }
    // Anything else (e.g. a client-sent PRIVMSG, which this mock never
    // needs to answer) is ignored rather than treated as an error.
  }

  await page.routeWebSocket(
    (url) => url.hostname === "irc-ws.chat.twitch.tv",
    (ws) => {
      activeWs = ws;
      ws.onMessage((raw) => {
        const text = typeof raw === "string" ? raw : raw.toString("utf-8");
        for (const line of text.split("\r\n")) {
          handleIncomingLine(line);
        }
      });
      ws.onClose(() => {
        if (activeWs === ws) {
          activeWs = null;
        }
      });
    },
  );

  async function sendMessage(opts: TwitchIrcSendMessageOptions): Promise<void> {
    const badges = { ...(opts.badges ?? {}) };
    if (opts.broadcaster) {
      badges.broadcaster = "1";
    }
    const badgesTag = Object.entries(badges)
      .map(([badge, version]) => `${badge}/${version}`)
      .join(",");
    const userId = opts.userId ?? stableNumericId(opts.displayName);
    const color = opts.color ?? "#1E90FF";
    const ts = (tsCounter += 1000);
    const ircNick = ircSafeNick(opts.id);
    const tags = [
      "badge-info=",
      `badges=${badgesTag}`,
      `color=${color}`,
      `display-name=${escapeTagValue(opts.displayName)}`,
      `emotes=${opts.emotes ?? ""}`,
      "first-msg=0",
      "flags=",
      `id=${opts.id}`,
      "mod=0",
      `room-id=${roomId}`,
      `subscriber=${badges.subscriber ? "1" : "0"}`,
      `tmi-sent-ts=${ts}`,
      "turbo=0",
      `user-id=${userId}`,
      "user-type=",
    ].join(";");
    send(
      `@${tags} :${ircNick}!${ircNick}@${ircNick}.tmi.twitch.tv PRIVMSG ${channelTarget} :${opts.message}\r\n`,
    );
  }

  async function sendClearChat(): Promise<void> {
    send(`:tmi.twitch.tv CLEARCHAT ${channelTarget}\r\n`);
  }

  async function sendMessageDeleted(targetMsgId: string): Promise<void> {
    const ts = (tsCounter += 1000);
    send(
      `@login=e2e_deleter;target-msg-id=${targetMsgId};tmi-sent-ts=${ts} :tmi.twitch.tv CLEARMSG ${channelTarget} :deleted message\r\n`,
    );
  }

  async function sendBan(targetUserId: string): Promise<void> {
    const ts = (tsCounter += 1000);
    // No `ban-duration` tag at all -- that is how real Twitch distinguishes
    // a permanent ban from a timeout. tmi.js reads
    // `_.get(tags['ban-duration'], null)` (utils.js: `get(a,b) = typeof a
    // === 'undefined' ? b : a`), so an *absent* tag becomes `null` and
    // triggers `emit('ban', ...)`, whereas a present-but-empty
    // `ban-duration=` tag becomes `""` (not `undefined`), which is treated
    // as a truthy non-null duration and misfires `emit('timeout', ...)`
    // instead -- `useTwitch.ts` only listens for `ban`, so that variant
    // silently drops the removal. Caught by the scratch test that first
    // wrote this mock (`sendBan` produced a `timeout` event, not `ban`, and
    // the message was never removed) -- do not reintroduce the tag.
    send(
      `@room-id=${roomId};target-user-id=${targetUserId};tmi-sent-ts=${ts} :tmi.twitch.tv CLEARCHAT ${channelTarget} :banned-user\r\n`,
    );
  }

  async function sendRaw(line: string): Promise<void> {
    send(line.endsWith("\r\n") ? line : `${line}\r\n`);
  }

  async function waitForConnected(): Promise<void> {
    await connectedPromise;
  }

  return {
    channel,
    sendMessage,
    sendClearChat,
    sendMessageDeleted,
    sendBan,
    sendRaw,
    waitForConnected,
  };
}
