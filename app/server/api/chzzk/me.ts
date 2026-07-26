import { ChzzkMeResponse, ApiError } from "~/lib/interfaces";

interface ChzzkIdentity {
  channelId: string;
  channelName: string;
}

// Every open tab/OBS Browser Source polls this route once a minute for data
// that is effectively static. This single-flight collapses concurrent and
// near-concurrent requests keyed by the access-token cookie into a single
// upstream lookup, and caches the result for 30s. Keying on the token (not a
// constant) means a token rotation is an immediate cache miss, so a new
// user's identity is never served from a stale entry.
const meFlight = createSingleFlight<ChzzkIdentity>({ cacheMs: 30_000 });

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

      const identity = await meFlight.run(accessToken, async () => {
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
          throw createError({
            statusCode: 502,
            message: "Failed to get Chzzk user info",
            data: { chzzkMeCode: "failed_to_get_user_info" },
          });
        }

        return {
          channelId: response.content.channelId,
          channelName: response.content.channelName,
        };
      });

      return {
        status: "OK",
        channelId: identity.channelId,
        channelName: identity.channelName,
      };
    } catch (error) {
      console.log("Chzzk me Api Error");
      console.error(error);
      if (
        error &&
        typeof error === "object" &&
        "data" in error &&
        (error as { data?: { chzzkMeCode?: string } }).data?.chzzkMeCode ===
          "failed_to_get_user_info"
      ) {
        return {
          status: "ERROR",
          code: "failed_to_get_user_info",
          error: "Failed to get user info",
        };
      }
      return {
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      };
    }
  }
);
