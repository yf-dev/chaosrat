import { installH3Globals, createMockEvent } from "./h3TestHelpers";
import { createServer, request } from "node:http";
import { createApp, toNodeListener } from "h3";

installH3Globals();

const privateRoutes = [
  ["auth/login", () => import("~/server/api/chzzk/auth/login"), "GET"],
  ["auth/callback", () => import("~/server/api/chzzk/auth/callback"), "GET"],
  ["auth/logout", () => import("~/server/api/chzzk/auth/logout"), "POST"],
  ["auth/refresh", () => import("~/server/api/chzzk/auth/refresh"), "POST"],
  ["me", () => import("~/server/api/chzzk/me"), "GET"],
  ["session/open", () => import("~/server/api/chzzk/session/open"), "POST"],
  ["session/list", () => import("~/server/api/chzzk/session/list"), "GET"],
  [
    "session/subscribeChat",
    () => import("~/server/api/chzzk/session/subscribeChat"),
    "POST",
  ],
  [
    "session/unsubscribeChat",
    () => import("~/server/api/chzzk/session/unsubscribeChat"),
    "POST",
  ],
] as const;

describe("private CHZZK responses", () => {
  it.each(privateRoutes)(
    "forbids shared caching of %s",
    async (path, load, method) => {
      const { default: handler } = await load();
      const { event, getResponseHeader } = createMockEvent({
        method,
        url: `/api/chzzk/${path}`,
      });

      await handler(event);

      expect(getResponseHeader("cache-control")).toContain("no-store");
    },
  );

  it("sends no-store on the wire for an authenticated identity response", async () => {
    const { default: handler } = await import("~/server/api/chzzk/me");
    const app = createApp();
    app.use("/me", handler);
    const server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    globalThis.$fetch = vi.fn().mockResolvedValue({
      code: 200,
      content: { channelId: "owner-id", channelName: "Owner" },
    }) as unknown as typeof globalThis.$fetch;

    try {
      const response = await new Promise<{
        status: number;
        cacheControl: string | undefined;
        body: string;
      }>((resolve, reject) => {
        const req = request({
          hostname: "127.0.0.1",
          port: address.port,
          path: "/me",
          headers: { cookie: "chzzk_access_token=wire-test-token" },
        });
        req.on("error", reject);
        req.on("response", (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              cacheControl: res.headers["cache-control"],
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
        req.end();
      });

      expect(response.status).toBe(200);
      expect(response.cacheControl).toBe("private, no-store");
      expect(JSON.parse(response.body)).toMatchObject({
        status: "OK",
        channelId: "owner-id",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
