import { ChzzkMeResponse, ApiError } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<ChzzkMeResponse | ApiError> => {
    try {
      const accessToken = getCookie(event, "chzzk_access_token");
      if (!accessToken) {
        return {
          status: "ERROR",
          code: "not_logged_in",
          error: "User is not logged in",
        };
      }

      // Verify the token and get user info from Chzzk API
      const response = await $fetch<{
        code: number;
        message: string | null;
        content?: {
          channelId: string;
          channelName: string;
        };
      }>("https://openapi.chzzk.naver.com/open/v1/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.content?.channelId || !response.content?.channelName) {
        return {
          status: "ERROR",
          code: "failed_to_get_user_info",
          error: "Failed to get user info",
        };
      }

      return {
        status: "OK",
        channelId: response.content.channelId,
        channelName: response.content.channelName,
      };
    } catch (error) {
      console.log("Chzzk me Api Error");
      console.error(error);
      return {
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      };
    }
  }
);
