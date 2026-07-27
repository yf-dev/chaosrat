import type {
  ChzzkSessionListResponse,
  ChzzkSessionInfo,
  ApiError,
} from "~/lib/interfaces";

// This project's approved Chzzk Open API scopes do allow calling
// GET /open/v1/sessions (세션 목록 조회(유저)): verified by hand in a browser
// against a live login, which also confirmed the list comes back newest-first
// and that disconnected sessions stay queryable for 90 days.
//
// That does not make a failure here meaningful. The call can still fail for
// reasons unrelated to chat health (network, an expired token, a scope change
// on Chzzk's side), and the response is paginated, so our session can be
// legitimately absent from the page we fetched. Callers must therefore treat
// any failure — and any absence — as "unknown" diagnostic state, never as
// proof that the chat subscription was lost; that determination still has to
// come from the actual chat/session lifecycle in lib/chzzkConnection.ts.

interface ChzzkSessionListUpstreamEntry {
  sessionKey: string;
  connectedDate?: string | null;
  disconnectedDate?: string | null;
  subscribedEvents?: { eventType: string; channelId: string }[];
}

// Several OBS Browser Sources may poll this diagnostic route at once, and the
// Chzzk session-list quota is limited, so concurrent/near-concurrent requests
// sharing the same access token are collapsed into a single upstream call.
const sessionListFlight = createSingleFlight<ChzzkSessionInfo[]>({
  cacheMs: 10_000,
});

export default defineEventHandler(
  async (event): Promise<ChzzkSessionListResponse | ApiError> => {
    try {
      const accessToken = getCookie(event, "chzzk_access_token");
      if (!accessToken) {
        return {
          status: "ERROR",
          code: "not_logged_in",
          error: "User is not logged in",
        };
      }

      const sessions = await sessionListFlight.run(accessToken, async () => {
        const response = await $fetch<{
          code: number;
          message: string | null;
          content?: {
            data?: ChzzkSessionListUpstreamEntry[];
          };
        }>("https://openapi.chzzk.naver.com/open/v1/sessions", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Chzzk mirrors the HTTP status inside the response envelope, so a
        // 200-status response can still carry code: 401 (INVALID_TOKEN /
        // UNAUTHORIZED) when the access token is stale.
        if (response.code === 401) {
          throw createError({
            statusCode: 401,
            message: "Chzzk rejected the access token",
            data: { chzzkSessionListCode: "unauthorized" },
          });
        }

        const data = response.content?.data ?? [];
        return data.map((entry): ChzzkSessionInfo => ({
          sessionKey: entry.sessionKey,
          connectedDate: entry.connectedDate ?? null,
          disconnectedDate: entry.disconnectedDate ?? null,
          subscribedEvents: entry.subscribedEvents ?? [],
        }));
      });

      return {
        status: "OK",
        sessions,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "data" in error &&
        (error as { data?: { chzzkSessionListCode?: string } }).data
          ?.chzzkSessionListCode === "unauthorized"
      ) {
        return {
          status: "ERROR",
          code: "unauthorized",
          error: "Chzzk rejected the access token",
        };
      }

      // $fetch throws a FetchError on non-2xx responses; check the possible
      // shapes defensively since ofetch's error surface differs across
      // environments/versions.
      const status =
        (error as { response?: { status?: number } })?.response?.status ??
        (error as { statusCode?: number })?.statusCode ??
        (error as { status?: number })?.status;

      if (status === 401) {
        console.log("Chzzk session/list Api Error: unauthorized");
        console.error(error);
        return {
          status: "ERROR",
          code: "unauthorized",
          error: "Chzzk rejected the access token",
        };
      }

      console.log("Chzzk session/list Api Error");
      console.error(error);
      return {
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      };
    }
  },
);
