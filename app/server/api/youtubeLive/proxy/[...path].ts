import { defineEventHandler, proxyRequest } from "h3";
import { ApiError } from "~/lib/interfaces";

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
      return proxyRequest(event, url.toString(), {
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
  }
);
