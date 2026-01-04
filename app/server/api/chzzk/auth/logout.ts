import { ApiError, ApiOk } from "~/lib/interfaces";

export default defineEventHandler(async (event): Promise<ApiOk | ApiError> => {
  try {
    const config = useRuntimeConfig(event);

    const accessToken = getCookie(event, "chzzk_access_token");
    const refreshToken = getCookie(event, "chzzk_refresh_token");

    try {
      // try to revoke the access token
      if (accessToken) {
        const result = await $fetch<{
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
    } catch (error) {
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
    } catch (error) {
      // ignore the error
    }

    // Clear the access and refresh tokens from cookies
    deleteCookie(event, "chzzk_access_token");
    deleteCookie(event, "chzzk_refresh_token");
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
