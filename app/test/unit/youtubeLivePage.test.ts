import { getOptionsFromLivePage } from "youtube-chat/dist/parser";
import { repairYoutubeLivePage } from "~/lib/youtubeLivePage";

// Compact fixtures reproducing the real byte patterns YouTube serves, not the
// full ~1.3MB captured page. Each stresses one property of the repair:
//
// - DEGRADED_LIVE_PAGE: the "Sign in to confirm you're not a bot" page. Its
//   canonical <link> is blanked (href="undefined"), but the real video id is
//   embedded exactly once under "currentVideoEndpoint". Decoy
//   "watchEndpoint" entries (recommended/sidebar videos, the ~63-occurrence
//   trap described in the task) appear BOTH before and after that block, so
//   a naive "grab the first/last watchEndpoint" implementation would fail
//   this fixture.
// - HEALTHY_LIVE_PAGE: canonical already correct; must come back byte-identical.
// - OFFLINE_CHANNEL_PAGE: what `/@handle/live` serves when the channel is not
//   live -- a valid non-watch canonical, no "currentVideoEndpoint" at all.
// - NO_CANONICAL_WITH_HEAD_PAGE: no `<link rel="canonical">` at all, but a
//   `</head>` is present -- exercises inserting the tag before `</head>`.
// - NO_HEAD_NO_CANONICAL_PAGE: no `<link rel="canonical">` and no `</head>`,
//   but a valid "currentVideoEndpoint" -- exercises the fallback insertion
//   path.

const DEGRADED_LIVE_PAGE = [
  "<html><head>",
  '<link rel="canonical" href="undefined">',
  '<link rel="alternate" media="handheld" href="https://m.youtube.com/@SomeChannel/live">',
  "</head><body>",
  '<script>var ytInitialData = {"sidebar":{"navigationEndpoint":{"watchEndpoint":{"videoId":"DECOYBEFORE1"}}},',
  '"currentVideoEndpoint":{"clickTrackingParams":"CAAQg2ciEwj72Kvai_OVAxU0TjgFHdNOFirKAQTzusWc","commandMetadata":{"webCommandMetadata":{"url":"/watch?v=REALVIDEOID1","webPageType":"WEB_PAGE_TYPE_WATCH","rootVe":3832}},"watchEndpoint":{"videoId":"REALVIDEOID1","watchEndpointSupportedOnesieConfig":{"nested":{"deep":true}}}},',
  '"related":{"navigationEndpoint":{"watchEndpoint":{"videoId":"DECOYAFTER99"}}}};</script>',
  '<script>var ytcfg = {"INNERTUBE_API_KEY":"fake-api-key-123","clientVersion":"2.20260101.00.00"};</script>',
  '<script>"continuation":"fake-continuation-token"</script>',
  "</body></html>",
].join("\n");

const HEALTHY_LIVE_PAGE = [
  "<html><head>",
  '<link rel="canonical" href="https://www.youtube.com/watch?v=HEALTHYVIDEO1">',
  "</head><body>",
  '<script>var ytcfg = {"INNERTUBE_API_KEY":"fake-api-key-123","clientVersion":"2.20260101.00.00"};</script>',
  '<script>"continuation":"fake-continuation-token"</script>',
  "</body></html>",
].join("\n");

const OFFLINE_CHANNEL_PAGE = [
  "<html><head>",
  '<link rel="canonical" href="https://www.youtube.com/@SomeChannel">',
  "</head><body>",
  '<script>var ytInitialData = {"sidebar":{"navigationEndpoint":{"watchEndpoint":{"videoId":"UNRELATED0001"}}}};</script>',
  "</body></html>",
].join("\n");

const NO_CANONICAL_WITH_HEAD_PAGE = [
  "<html><head>",
  '<link rel="alternate" media="handheld" href="https://m.youtube.com/@SomeChannel/live">',
  "</head><body>",
  '<script>var ytInitialData = {"currentVideoEndpoint":{"clickTrackingParams":"CAAQg2c","commandMetadata":{"webCommandMetadata":{"url":"/watch?v=NOCANONICAL1","webPageType":"WEB_PAGE_TYPE_WATCH","rootVe":3832}},"watchEndpoint":{"videoId":"NOCANONICAL1","watchEndpointSupportedOnesieConfig":{"nested":{"deep":true}}}}};</script>',
  '<script>var ytcfg = {"INNERTUBE_API_KEY":"fake-api-key-123","clientVersion":"2.20260101.00.00"};</script>',
  '<script>"continuation":"fake-continuation-token"</script>',
  "</body></html>",
].join("\n");

const NO_HEAD_NO_CANONICAL_PAGE = [
  "<html><body>",
  '<script>var ytInitialData = {"currentVideoEndpoint":{"clickTrackingParams":"CAAQg2c","commandMetadata":{"webCommandMetadata":{"url":"/watch?v=NOHEADVIDEO1","webPageType":"WEB_PAGE_TYPE_WATCH","rootVe":3832}},"watchEndpoint":{"videoId":"NOHEADVIDEO1","watchEndpointSupportedOnesieConfig":{"nested":{"deep":true}}}}};</script>',
  '<script>var ytcfg = {"INNERTUBE_API_KEY":"fake-api-key-123","clientVersion":"2.20260101.00.00"};</script>',
  '<script>"continuation":"fake-continuation-token"</script>',
  "</body></html>",
].join("\n");

describe("repairYoutubeLivePage", () => {
  it("repairs the degraded bot-check page so the real video id parses, not a decoy", () => {
    const repaired = repairYoutubeLivePage(DEGRADED_LIVE_PAGE);

    const options = getOptionsFromLivePage(repaired);

    expect(options.liveId).toBe("REALVIDEOID1");
    expect(options.liveId).not.toBe("DECOYBEFORE1");
    expect(options.liveId).not.toBe("DECOYAFTER99");
    expect(options.apiKey).toBe("fake-api-key-123");
    expect(options.clientVersion).toBe("2.20260101.00.00");
    expect(options.continuation).toBe("fake-continuation-token");
  });

  it("returns a healthy page byte-identical", () => {
    const repaired = repairYoutubeLivePage(HEALTHY_LIVE_PAGE);

    expect(repaired).toBe(HEALTHY_LIVE_PAGE);
    expect(getOptionsFromLivePage(repaired).liveId).toBe("HEALTHYVIDEO1");
  });

  it("leaves an offline channel page unchanged and still unparseable", () => {
    const repaired = repairYoutubeLivePage(OFFLINE_CHANNEL_PAGE);

    expect(repaired).toBe(OFFLINE_CHANNEL_PAGE);
    expect(() => getOptionsFromLivePage(repaired)).toThrow(
      "Live Stream was not found",
    );
  });

  it("inserts a canonical tag before </head> when there is no existing canonical tag", () => {
    const repaired = repairYoutubeLivePage(NO_CANONICAL_WITH_HEAD_PAGE);

    expect(repaired).toBe(
      NO_CANONICAL_WITH_HEAD_PAGE.replace(
        "</head>",
        '<link rel="canonical" href="https://www.youtube.com/watch?v=NOCANONICAL1"></head>',
      ),
    );
    expect(getOptionsFromLivePage(repaired).liveId).toBe("NOCANONICAL1");
  });

  it("inserts a canonical tag at the end when there is no </head> and no existing canonical tag", () => {
    const repaired = repairYoutubeLivePage(NO_HEAD_NO_CANONICAL_PAGE);

    expect(repaired).toBe(
      `${NO_HEAD_NO_CANONICAL_PAGE}<link rel="canonical" href="https://www.youtube.com/watch?v=NOHEADVIDEO1">`,
    );
    expect(getOptionsFromLivePage(repaired).liveId).toBe("NOHEADVIDEO1");
  });
});
