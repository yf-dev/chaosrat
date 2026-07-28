import { setResponseStatus } from "h3";
import type { ApiError, ApiOk } from "~/lib/interfaces";

interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// The Chzzk refresh token is single-use: every grantType=refresh_token
// exchange invalidates the old refresh token and issues a new one. Multiple
// OBS Browser Sources (tabs) can hit this route concurrently with the same
// (still valid, at the time each request was sent) refresh token cookie, so
// this single-flight collapses concurrent/near-concurrent requests keyed by
// that cookie value into a single upstream exchange, and lets later callers
// within cacheMs reuse the same result instead of retrying with an
// already-invalidated token.
//
// cacheMs is 10 minutes rather than the original 60 seconds to cover a
// straggler: a source that fetched this cookie value some time ago and only
// gets around to replaying it later. Whether OBS actually gives each Browser
// Source its own cookie jar (which would let sources rotate independently
// and leave one holding a spent token) has not been verified from this
// devcontainer -- if all sources in fact share one jar, this window is
// simply inert. The cost of widening it: a rotated access/refresh token pair
// sits in server memory, keyed by the now-spent refresh token, for up to 10
// minutes instead of 1. A pair served from this cache after a logout/revoke
// is already-dead by then -- cosmetically wrong (a caller briefly believes
// it refreshed) but self-correcting on the very next API call, since the
// dead access token fails and there is no live refresh token left to retry
// with. That self-correcting failure mode is why 10 minutes is treated as a
// deliberate stopping point, not a floor -- widen it further only with a
// concrete reason, not just to shave off more of this hypothetical.
const refreshFlight = createSingleFlight<RefreshTokenResult>({
  cacheMs: 10 * 60_000,
  inFlightTimeoutMs: 5_000,
});

export default defineEventHandler(async (event): Promise<ApiOk | ApiError> => {
  try {
    // CSRF hardening: this route is state-changing (rotates the single-use
    // refresh token), and sameSite: "lax" cookies are still sent on a
    // cross-site top-level navigation (e.g. an attacker <a> link), so a bare
    // GET must not trigger it.
    if (event.method !== "POST") {
      setResponseStatus(event, 405);
      return {
        status: "ERROR",
        code: "method_not_allowed",
        error: "Method Not Allowed",
      };
    }

    const config = useRuntimeConfig(event);

    const refreshToken = getCookie(event, "chzzk_refresh_token");
    if (!refreshToken) {
      return {
        status: "ERROR",
        code: "no_refresh_token",
        error: "No refresh token found",
      };
    }

    try {
      const result = await refreshFlight.run(refreshToken, async () => {
        // Exchange code for access token
        const tokenResponse = await $fetch<{
          code: number;
          message: string | null;
          content?: {
            accessToken: string;
            refreshToken: string;
            tokenType: string;
            expiresIn: number;
            scope: string;
          };
        }>("/auth/v1/token", {
          baseURL: "https://chzzk.naver.com",
          method: "POST",
          timeout: 5000,
          body: {
            grantType: "refresh_token",
            refreshToken: refreshToken,
            clientId: config.chzzkClientId,
            clientSecret: config.chzzkClientSecret,
          },
        });

        if (
          !tokenResponse.content?.accessToken ||
          !tokenResponse.content?.refreshToken ||
          !tokenResponse.content?.expiresIn
        ) {
          throw createError({
            statusCode: 502,
            message: "Failed to get Chzzk access token",
          });
        }

        return {
          accessToken: tokenResponse.content.accessToken,
          refreshToken: tokenResponse.content.refreshToken,
          expiresIn: tokenResponse.content.expiresIn,
        };
      });

      // Store tokens in secure httpOnly cookies. This runs per request (not
      // once inside the flight) since cookies are per-response: every
      // caller — the one that did the work and the ones that joined or hit
      // the cache — must still get the tokens written to their own response.
      setCookie(event, "chzzk_access_token", result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: result.expiresIn,
      });

      setCookie(event, "chzzk_refresh_token", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      setCookie(event, "chzzk_token_created_at", new Date().toISOString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      // Redirect back to chat page
      return {
        status: "OK",
      };
    } catch (error) {
      console.error(error);
      return {
        status: "ERROR",
        code: "invalid_token",
        error: "Failed to refresh Chzzk access token",
      };
    }
  } catch (error) {
    console.log("Chzzk auth/refresh Api Error");
    console.error(error);
    // if (error && typeof error === "object" && "data" in error) {
    //   console.log("Chzzk API Error Data:", error.data);
    // }
    return {
      status: "ERROR",
      code: "internal_server_error",
      error: "Internal Server Error",
    };
  }
});
