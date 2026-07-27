import type { ApiError } from "~/lib/interfaces";

// This handler `return`s a redirect via h3's `sendRedirect()` (typed
// `Promise<void>`) alongside `ApiError` objects on other paths. h3 itself
// uses this exact idiom (e.g. `serveStatic`'s `Promise<void | false>`) to
// mean "the response was already sent, there's nothing more to return" —
// it's a legitimate Nitro/h3 pattern, not a mistake.
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- see above
export default defineEventHandler(async (event): Promise<void | ApiError> => {
  try {
    const query = getQuery(event);
    const config = useRuntimeConfig(event);

    const { code, state } = query;

    if (!code || typeof code !== "string") {
      throw createError({
        statusCode: 400,
        message: "Missing authorization code",
      });
    }

    // Retrieve the state from the session
    const storedState = getCookie(event, "oauth_state");
    if (!storedState || storedState !== state) {
      return {
        status: "ERROR",
        code: "invalid_state",
        error: "Invalid state parameter",
      };
    }

    // Retrive the redirect URL from the session
    let redirectTo = getCookie(event, "oauth_redirect");
    if (redirectTo) {
      // Clear the redirect URL from the session
      deleteCookie(event, "oauth_redirect");
    } else {
      redirectTo = "/";
    }

    // Check redirect URL: must resolve to the same origin as this app.
    //
    // This used to be a character-enumeration guard (reject a leading "//",
    // reject "\"), which closed the protocol-relative and backslash
    // bypasses but missed a third: the WHATWG URL parser silently strips
    // TAB (U+0009), LF (U+000A) and CR (U+000D) before parsing, so
    // "/\t/evil.example" satisfied every clause in that list — starts with
    // "/", doesn't start with "//", has no backslash — yet a browser
    // resolves it to "//evil.example", a protocol-relative URL to a
    // different origin. That is not a sign the list needed a fourth
    // clause; it is a sign enumerating forbidden characters can never be
    // complete, because it requires knowing every normalisation a URL
    // parser performs. Resolving against the app's own origin sidesteps
    // that entirely: it asks the same parser the browser will use whether
    // the *result* is same-origin, which is normalisation-complete by
    // construction. Do not revert this to a `startsWith`/`includes`
    // character list — that is exactly the shape of guard that has now
    // failed twice.
    let redirectTarget: URL;
    try {
      // `config.public.baseURL` may be unset in a misconfigured
      // environment (it throws `new URL(..., "")`); fail closed rather
      // than let redirect validation silently pass everything.
      redirectTarget = new URL(redirectTo, config.public.baseURL);
    } catch {
      return {
        status: "ERROR",
        code: "invalid_redirect",
        error: "Invalid redirect URL",
      };
    }
    if (redirectTarget.origin !== new URL(config.public.baseURL).origin) {
      return {
        status: "ERROR",
        code: "invalid_redirect",
        error: "Invalid redirect URL",
      };
    }
    // Redirect to the re-serialised path, not the raw cookie value. This is
    // the load-bearing half of the fix: re-serialising through `URL` is what
    // guarantees no parser-stripped character (TAB/LF/CR) ever reaches the
    // `Location` header, regardless of what the origin check above did or
    // did not catch.
    redirectTo = `${redirectTarget.pathname}${redirectTarget.search}${redirectTarget.hash}`;

    try {
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
        body: {
          grantType: "authorization_code",
          code: code,
          state: state as string,
          clientId: config.chzzkClientId,
          clientSecret: config.chzzkClientSecret,
        },
      });

      if (
        !tokenResponse.content?.accessToken ||
        !tokenResponse.content?.refreshToken ||
        !tokenResponse.content?.expiresIn
      ) {
        return {
          status: "ERROR",
          code: "invalid_token",
          error: "Failed to get Chzzk access token",
        };
      }

      // Store tokens in secure httpOnly cookies
      setCookie(
        event,
        "chzzk_access_token",
        tokenResponse.content.accessToken,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: tokenResponse.content.expiresIn,
        },
      );

      setCookie(
        event,
        "chzzk_refresh_token",
        tokenResponse.content.refreshToken,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60, // 30 days
        },
      );

      setCookie(event, "chzzk_token_created_at", new Date().toISOString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      // Redirect back to chat page
      return sendRedirect(event, redirectTo);
    } catch (error) {
      console.error(error);
      return {
        status: "ERROR",
        code: "invalid_token",
        error: "Failed to get Chzzk access token",
      };
    }
  } catch (error) {
    console.log("Chzzk auth/callback Api Error");
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
