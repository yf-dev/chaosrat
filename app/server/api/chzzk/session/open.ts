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

      // Chzzk mirrors the HTTP status inside the response envelope, so a
      // 200-status response can still carry code: 401 (INVALID_TOKEN /
      // UNAUTHORIZED) when the access token is stale.
      if (response.code === 401) {
        return {
          status: "ERROR",
          code: "unauthorized",
          error: "Chzzk rejected the access token",
        };
      }

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
      // $fetch throws a FetchError on non-2xx responses; check the
      // possible shapes defensively since ofetch's error surface differs
      // across environments/versions.
      const status =
        (error as { response?: { status?: number } })?.response?.status ??
        (error as { statusCode?: number })?.statusCode ??
        (error as { status?: number })?.status;

      if (status === 401) {
        console.log("Chzzk session/open Api Error: unauthorized");
        console.error(error);
        return {
          status: "ERROR",
          code: "unauthorized",
          error: "Chzzk rejected the access token",
        };
      }

      console.log("Chzzk session/open Api Error");
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
