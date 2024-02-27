import { defineEventHandler, proxyRequest } from "h3";

export default defineEventHandler(async (event): Promise<unknown> => {
  const url = new URL(event.node.req.url, "https://www.youtube.com");
  url.pathname = event.context.params.path;
  return proxyRequest(event, url.toString(), {
    headers: {
      host: url.host,
      origin: url.origin,
      referer: url.origin,
    },
  });
});
