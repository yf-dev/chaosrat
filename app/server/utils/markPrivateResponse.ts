import { setResponseHeader, type H3Event } from "h3";

/** Keep cookie-bound API responses out of browser and shared caches. */
export function markPrivateResponse(event: H3Event): void {
  setResponseHeader(event, "cache-control", "private, no-store");
}
