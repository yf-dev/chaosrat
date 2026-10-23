import { createServer, request } from "node:http";
import { createApp, toNodeListener } from "h3";
import { installH3Globals } from "./h3TestHelpers";

installH3Globals();

describe("YouTube proxy over a real Node request stream", () => {
  it("returns 413 for an oversized chunked POST without resetting the socket", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const app = createApp();
    app.use("/proxy", (event) => {
      event.context.params = { path: "youtubei/v1/live_chat/get_live_chat" };
      return handler(event);
    });
    const server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const upstream = vi.fn();
    globalThis.fetch = upstream as unknown as typeof globalThis.fetch;

    try {
      const response = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          const req = request({
            hostname: "127.0.0.1",
            port: address.port,
            path: "/proxy",
            method: "POST",
            headers: { "transfer-encoding": "chunked" },
          });
          req.on("error", reject);
          req.on("response", (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("error", reject);
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          });
          req.write(Buffer.alloc(1024 * 1024));
          req.end("x");
        },
      );

      expect(response.status).toBe(413);
      expect(response.body).toContain("Payload Too Large");
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves proxied HTML with a sandbox policy on the app origin", async () => {
    const handler = (await import("~/server/api/youtubeLive/proxy/[...path]"))
      .default;
    const app = createApp();
    app.use("/proxy", (event) => {
      event.context.params = { path: "watch" };
      return handler(event);
    });
    const server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("<script>window.alert('active')</script>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ) as unknown as typeof globalThis.fetch;

    try {
      const response = await new Promise<{
        status: number;
        contentType: string | string[] | undefined;
        contentSecurityPolicy: string | string[] | undefined;
        body: string;
      }>((resolve, reject) => {
        const req = request({
          hostname: "127.0.0.1",
          port: address.port,
          path: "/proxy?v=video-id",
        });
        req.on("error", reject);
        req.on("response", (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              contentType: res.headers["content-type"],
              contentSecurityPolicy: res.headers["content-security-policy"],
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        });
        req.end();
      });

      expect(response.status).toBe(200);
      expect(response.contentType).toBe("text/html; charset=utf-8");
      expect(response.contentSecurityPolicy).toBe(
        "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
      );
      expect(response.body).toContain("<script>");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
