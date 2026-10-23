import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatFilterRequest } from "~/lib/chatFilter";

afterEach(() => vi.unstubAllGlobals());

describe("chat filter worker protocol", () => {
  it("announces readiness and evaluates valid JavaScript patterns", async () => {
    vi.resetModules();
    const scope = {
      onmessage: null as
        ((event: MessageEvent<ChatFilterRequest>) => void) | null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", scope);
    await import("~/lib/chatFilterWorker");

    expect(scope.postMessage).toHaveBeenCalledWith({ type: "ready" });
    scope.onmessage!({
      data: {
        type: "evaluate",
        id: 1,
        usernamePattern: "(?<=foo)bar",
        messagePattern: "",
        nickname: "foobar",
        message: "hello",
      },
    } as MessageEvent<ChatFilterRequest>);
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "result",
      id: 1,
      visible: false,
    });
    scope.onmessage!({
      data: {
        type: "evaluate",
        id: 2,
        usernamePattern: "(?<=foo)bar",
        messagePattern: "",
        nickname: "regular",
        message: "hello",
      },
    } as MessageEvent<ChatFilterRequest>);
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "result",
      id: 2,
      visible: true,
    });
  });

  it("hides invalid patterns and ignores non-evaluation messages", async () => {
    vi.resetModules();
    const scope = {
      onmessage: null as
        ((event: MessageEvent<ChatFilterRequest>) => void) | null,
      postMessage: vi.fn(),
    };
    vi.stubGlobal("self", scope);
    await import("~/lib/chatFilterWorker");

    scope.onmessage!({
      data: { type: "unknown" },
    } as unknown as MessageEvent<ChatFilterRequest>);
    expect(scope.postMessage).toHaveBeenCalledTimes(1);
    scope.onmessage!({
      data: {
        type: "evaluate",
        id: 3,
        usernamePattern: "[",
        messagePattern: "",
        nickname: "nick",
        message: "hello",
      },
    } as MessageEvent<ChatFilterRequest>);
    expect(scope.postMessage).toHaveBeenLastCalledWith({
      type: "result",
      id: 3,
      visible: false,
    });
  });
});
