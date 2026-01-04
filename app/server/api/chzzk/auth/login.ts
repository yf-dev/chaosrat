import crypto from "crypto";
import { ChzzkAuthLoginResponse, ApiError } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<ChzzkAuthLoginResponse | ApiError> => {
    try {
      const config = useRuntimeConfig(event);

      const query = getQuery(event);
      const redirectTo = query.redirectTo;

      // Generate a random state string
      const state = crypto.randomBytes(16).toString("hex");

      // Store the state in the session
      setCookie(event, "oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 300, // 5 minutes
      });

      // Store the redirect URL in the session
      if (redirectTo && typeof redirectTo === "string") {
        setCookie(event, "oauth_redirect", redirectTo, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 300, // 5 minutes
        });
      }

      // Return the URL for OAuth authorization
      return {
        status: "OK",
        authUrl:
          `https://chzzk.naver.com/account-interlock?` +
          new URLSearchParams({
            clientId: config.chzzkClientId,
            redirectUri: `${config.public.baseURL}/api/chzzk/auth/callback`,
            state: state,
          }),
      };
    } catch (error) {
      console.log("Chzzk auth/login Api Error");
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
  }
);
