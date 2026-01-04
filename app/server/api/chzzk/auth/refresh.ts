import { ApiError, ApiOk } from "~/lib/interfaces";

export default defineEventHandler(async (event): Promise<ApiOk | ApiError> => {
  try {
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
        }
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
        }
      );

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
