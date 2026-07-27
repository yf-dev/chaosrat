import { setResponseStatus } from "h3";
import type { ApiOk, ApiError } from "~/lib/interfaces";

export default defineEventHandler(async (event): Promise<ApiOk | ApiError> => {
  try {
    // CSRF hardening: this route is state-changing (unsubscribes a CHZZK
    // session from chat events), and sameSite: "lax" cookies are still sent
    // on a cross-site top-level navigation (e.g. an attacker <a> link), so a
    // bare GET must not trigger it.
    if (event.method !== "POST") {
      setResponseStatus(event, 405);
      return {
        status: "ERROR",
        code: "method_not_allowed",
        error: "Method Not Allowed",
      };
    }

    const accessToken = getCookie(event, "chzzk_access_token");
    if (!accessToken) {
      return {
        status: "ERROR",
        code: "not_logged_in",
        error: "User is not logged in",
      };
    }

    const body = await readBody(event);
    // get sessionKey from body
    if (!body) {
      return {
        status: "ERROR",
        code: "invalid_request",
        error: "Invalid request",
      };
    }
    if (
      typeof body !== "object" ||
      !body.sessionKey ||
      typeof body.sessionKey !== "string"
    ) {
      return {
        status: "ERROR",
        code: "invalid_request",
        error: "Invalid request",
      };
    }

    const response = await $fetch<{
      code: number;
      message: string | null;
      content?: null;
    }>(
      "https://openapi.chzzk.naver.com/open/v1/sessions/events/unsubscribe/chat",
      {
        method: "POST",
        query: { sessionKey: body.sessionKey },
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (response.code != 200) {
      return {
        status: "ERROR",
        code: "failed_to_unsubscribe_chat",
        error: "Failed to unsubscribe chat",
      };
    }

    return {
      status: "OK",
    };
  } catch (error) {
    console.log("Chzzk session/unsubscribeChat Api Error");
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
