import { ApiError } from "~/lib/interfaces";

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

    // Check redirect URL
    if (typeof redirectTo !== "string" || !redirectTo.startsWith("/")) {
      return {
        status: "ERROR",
        code: "invalid_redirect",
        error: "Invalid redirect URL",
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
