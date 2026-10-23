import { getRequestHeader, setResponseStatus, type H3Event } from "h3";
import type { ApiError } from "~/lib/interfaces";

/** Reject a browser POST unless it came from the configured app origin. */
export function rejectCrossOriginPost(event: H3Event): ApiError | undefined {
  const origin = getRequestHeader(event, "origin");
  let appOrigin: string;
  try {
    const baseURL = new URL(useRuntimeConfig(event).public.baseURL);
    appOrigin =
      baseURL.protocol === "http:" || baseURL.protocol === "https:"
        ? baseURL.origin
        : "";
  } catch {
    // An unset or invalid base URL must not disable the CSRF check.
    appOrigin = "";
  }

  if (origin === appOrigin && appOrigin !== "") {
    return;
  }

  setResponseStatus(event, 403);
  return {
    status: "ERROR",
    code: "forbidden_origin",
    error: "Forbidden Origin",
  };
}
