import {
  defineEventHandler,
  proxyRequest,
  setResponseHeader,
  setResponseStatus,
} from "h3";
import type { ApiError } from "~/lib/interfaces";
import { repairYoutubeLivePage } from "~/lib/youtubeLivePage";

export default defineEventHandler(
  async (event): Promise<unknown | ApiError> => {
    try {
      if (!event.node.req.url) {
        return {
          status: "ERROR",
          error: "No url in request",
        };
      }
      if (!event.context.params?.path) {
        return {
          status: "ERROR",
          error: "No path in params",
        };
      }
      const url = new URL(event.node.req.url, "https://www.youtube.com");
      url.pathname = event.context.params.path;

      // youtube-chat makes exactly two kinds of request through this proxy:
      // a GET for the live page's HTML (fetchLivePage) and a POST to
      // youtubei/v1/live_chat/get_live_chat (fetchChat, high-frequency
      // polling). Only the GET's body ever needs inspecting/repairing (see
      // repairYoutubeLivePage), so the HTTP method is used here as the
      // discriminator between the two -- the chat-polling POSTs keep using
      // the plain proxyRequest() pass-through below, untouched.
      if (event.node.req.method === "GET") {
        const upstreamResponse = await fetch(url.toString(), {
          headers: {
            host: url.host,
            origin: url.origin,
            referer: url.origin,
          },
        });
        const body = await upstreamResponse.text();
        const contentType = upstreamResponse.headers.get("content-type");
        if (contentType) {
          setResponseHeader(event, "content-type", contentType);
        }
        // Forward the upstream status (proxyRequest() below does this too) so
        // a 404/429/5xx from YouTube isn't laundered into a 200. The body is
        // still repaired regardless of status.
        setResponseStatus(event, upstreamResponse.status);
        return repairYoutubeLivePage(body);
      }

      // Must be awaited: proxyRequest()'s rejection (e.g. upstream fetch
      // failure) otherwise escapes this try block entirely, since `return
      // aPromise` from inside a try does not run the promise under the
      // try/catch — it just hands the promise up to be adopted by this
      // async function's own return.
      return await proxyRequest(event, url.toString(), {
        headers: {
          host: url.host,
          origin: url.origin,
          referer: url.origin,
        },
      });
    } catch (error) {
      console.log("Youtube Live proxy Api Error");
      console.error(error);
      return {
        status: "ERROR",
        error: "Internal Server Error",
      };
    }
  },
);
