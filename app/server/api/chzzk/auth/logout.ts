import { setResponseStatus } from "h3";
import type { ApiError, ApiOk } from "~/lib/interfaces";

export default defineEventHandler(async (event): Promise<ApiOk | ApiError> => {
  try {
    // CSRF hardening: this route is state-changing (revokes tokens, clears
    // cookies), and sameSite: "lax" cookies are still sent on a cross-site
    // top-level navigation (e.g. an attacker <a> link), so a bare GET must
    // not trigger it.
    if (event.method !== "POST") {
      setResponseStatus(event, 405);
      return {
        status: "ERROR",
        code: "method_not_allowed",
        error: "Method Not Allowed",
      };
    }

    const config = useRuntimeConfig(event);

    const accessToken = getCookie(event, "chzzk_access_token");
    const refreshToken = getCookie(event, "chzzk_refresh_token");

    try {
      // try to revoke the access token
      if (accessToken) {
        await $fetch<{
          code: number;
          message: string | null;
          content?: null;
        }>("/auth/v1/token/revoke", {
          baseURL: "https://chzzk.naver.com",
          method: "POST",
          body: {
            token: accessToken,
            tokenTypeHint: "access_token",
            clientId: config.chzzkClientId,
            clientSecret: config.chzzkClientSecret,
          },
        });
      }
    } catch {
      // ignore the error
    }

    try {
      // try to revoke the refresh token
      if (refreshToken) {
        await $fetch<{
          code: number;
          message: string | null;
          content?: null;
        }>("/auth/v1/token/revoke", {
          baseURL: "https://chzzk.naver.com",
          method: "POST",
          body: {
            token: refreshToken,
            tokenTypeHint: "refresh_token",
            clientId: config.chzzkClientId,
            clientSecret: config.chzzkClientSecret,
          },
        });
      }
    } catch {
      // ignore the error
    }

    // Clear the access and refresh tokens from cookies
    deleteCookie(event, "chzzk_access_token");
    deleteCookie(event, "chzzk_refresh_token");
    deleteCookie(event, "chzzk_token_created_at");
    return {
      status: "OK",
    };
  } catch (error) {
    console.log("Chzzk auth/logout Api Error");
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
