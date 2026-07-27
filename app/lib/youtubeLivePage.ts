// Repairs YouTube's degraded "Sign in to confirm you're not a bot" live page
// response, served to some server-side/datacenter IPs, before it reaches
// `youtube-chat`'s `getOptionsFromLivePage()`. That page has every value
// `youtube-chat` needs (INNERTUBE_API_KEY, clientVersion, continuation) except
// the canonical <link>, which is blanked to `href="undefined"` -- and
// `getOptionsFromLivePage()` finds the live video id *only* via that tag, so a
// blanked canonical makes it throw "Live Stream was not found" even though
// everything else on the page is usable.

// Byte-for-byte the same regex `youtube-chat`'s parser.js uses to find the
// canonical <link>. Kept in sync deliberately: if this check disagrees with
// theirs, a page that still needs repair would be skipped, or a healthy page
// would be touched for no reason.
const CANONICAL_LINK_REGEX =
  /<link rel="canonical" href="https:\/\/www.youtube.com\/watch\?v=(.+?)">/;

const EXISTING_CANONICAL_LINK_REGEX = /<link rel="canonical" href="[^"]*">/;

// The degraded page still embeds the real video id exactly once, under
// "currentVideoEndpoint" -- unlike the dozens of "watchEndpoint" occurrences
// scattered across recommended/sidebar video entries elsewhere on the page,
// which name videos other than the one this page is about. There are nested
// braces between "currentVideoEndpoint" and its "watchEndpoint" child, so a
// `[^}]*` bridge would break; a bounded lazy scan is used instead.
const CURRENT_VIDEO_ENDPOINT_REGEX =
  /"currentVideoEndpoint":\{[\s\S]{0,500}?"watchEndpoint":\{"videoId":"([\w-]+)"/;

export function repairYoutubeLivePage(html: string): string {
  if (CANONICAL_LINK_REGEX.test(html)) {
    return html;
  }

  const match = html.match(CURRENT_VIDEO_ENDPOINT_REGEX);
  if (!match) {
    return html;
  }

  const canonicalTag = `<link rel="canonical" href="https://www.youtube.com/watch?v=${match[1]}">`;

  if (EXISTING_CANONICAL_LINK_REGEX.test(html)) {
    return html.replace(EXISTING_CANONICAL_LINK_REGEX, canonicalTag);
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${canonicalTag}</head>`);
  }
  return html + canonicalTag;
}
