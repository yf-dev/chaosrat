import { ChzzkSessionOpenResponse, ApiError } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<ChzzkSessionOpenResponse | ApiError> => {
    try {
      const accessToken = getCookie(event, "chzzk_access_token");
      if (!accessToken) {
        return {
          status: "ERROR",
          code: "not_logged_in",
          error: "User is not logged in",
        };
      }

      const response = await $fetch<{
        code: number;
        message: string | null;
        content?: {
          url: string;
        };
      }>("https://openapi.chzzk.naver.com/open/v1/sessions/auth", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.content?.url) {
        return {
          status: "ERROR",
          code: "failed_to_open_session",
          error: "Failed to open session",
        };
      }

      return {
        status: "OK",
        url: response.content?.url,
      };
    } catch (error) {
      console.log("Chzzk session/open Api Error");
      console.error(error);
      return {
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      };
    }
  }
);
