import {
  createEvent,
  getCookie,
  setCookie,
  deleteCookie,
  readBody,
  getQuery,
  sendRedirect,
  createError,
  defineEventHandler,
  proxyRequest,
} from "h3";
import type { IncomingMessage, ServerResponse } from "node:http";
import { vi } from "vitest";
import { createSingleFlight } from "~/server/utils/singleFlight";

// The server/api/** handlers are Nitro route files: they reference
// getCookie/setCookie/deleteCookie/readBody/getQuery/sendRedirect/
// createError/defineEventHandler/proxyRequest/useRuntimeConfig as bare
// identifiers, relying on Nitro's build-time auto-import (unimport) to wire
// them up. Plain vitest never runs that build step, so importing a handler
// module here would throw ReferenceError the moment it's invoked.
//
// Rather than mock those away, we install the *real* h3 implementations onto
// globalThis so the handler's own logic (cookie parsing/serialization, query
// parsing, error shaping, ...) runs unmodified. `useRuntimeConfig` has no
// standalone h3 equivalent (it's Nitro-specific), so it gets a stub that
// always returns obviously-fake credentials.
export function installH3Globals(
  runtimeConfigOverrides: Record<string, unknown> = {},
) {
  Object.assign(globalThis, {
    defineEventHandler,
    getCookie,
    setCookie,
    deleteCookie,
    readBody,
    getQuery,
    sendRedirect,
    createError,
    proxyRequest,
    // server/utils/*.ts (e.g. createSingleFlight) is Nitro's own
    // auto-imported "server utils" convention — same bare-identifier
    // problem as the h3 helpers above, so it gets installed the same way.
    createSingleFlight,
    useRuntimeConfig: vi.fn(() => ({
      chzzkClientId: "fake-chzzk-client-id",
      chzzkClientSecret: "fake-chzzk-client-secret",
      twitchClientId: "fake-twitch-client-id",
      twitchClientSecret: "fake-twitch-client-secret",
      public: { baseURL: "https://chaosrat.test" },
      ...runtimeConfigOverrides,
    })),
  });
}

export interface MockEventOptions {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  /**
   * When provided (even `undefined` explicitly is not the same as omitting
   * this key), stashed onto `event._requestBody` so the real `readBody()`
   * picks it up without needing a real request stream.
   */
  body?: unknown;
}

/**
 * Builds a real h3 `H3Event` backed by minimal Node req/res stand-ins that
 * implement just enough of the surface `getCookie`/`setCookie`/`deleteCookie`/
 * `getQuery`/`sendRedirect` actually touch: request headers + url, and a
 * response header store (get/set/remove/append) plus statusCode.
 */
export function createMockEvent(opts: MockEventOptions = {}) {
  const req = {
    method: opts.method ?? "GET",
    url: opts.url ?? "/",
    headers: { ...(opts.headers ?? {}) },
  } as unknown as IncomingMessage;

  const resHeaders = new Map<string, string | string[]>();
  const res = {
    statusCode: 200,
    statusMessage: "",
    writableEnded: false,
    headersSent: false,
    getHeader: (name: string) => resHeaders.get(name.toLowerCase()),
    setHeader: (name: string, value: string | string[]) => {
      resHeaders.set(name.toLowerCase(), value);
      return res;
    },
    removeHeader: (name: string) => {
      resHeaders.delete(name.toLowerCase());
    },
    appendHeader: (name: string, value: string) => {
      const key = name.toLowerCase();
      const existing = resHeaders.get(key);
      if (existing === undefined) {
        resHeaders.set(key, value);
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        resHeaders.set(key, [existing, value]);
      }
    },
    getHeaders: () => Object.fromEntries(resHeaders),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  const event = createEvent(req, res);
  if ("body" in opts) {
    (event as unknown as { _requestBody?: unknown })._requestBody = opts.body;
  }

  return {
    event,
    getResponseHeader: (name: string) => resHeaders.get(name.toLowerCase()),
    getStatusCode: () => res.statusCode,
  };
}
