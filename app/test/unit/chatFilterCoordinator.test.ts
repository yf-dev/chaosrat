import { describe, expect, it, vi } from "vitest";
import {
  createChatFilterCoordinator,
  type ChatFilterWorker,
} from "~/lib/chatFilterCoordinator";
import { evaluateChatFilter } from "~/lib/chatFilter";
import type { ChatFilterRequest } from "~/lib/chatFilter";

class FakeWorker implements ChatFilterWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  send(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError() {
    const preventDefault = vi.fn();
    this.onerror?.({ preventDefault } as unknown as ErrorEvent);
    return preventDefault;
  }
}

function setup(maxEntries?: number) {
  const workers: FakeWorker[] = [];
  const changed = vi.fn();
  const coordinator = createChatFilterCoordinator({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    onChange: changed,
    maxEntries,
  });
  return { coordinator, workers, changed };
}

describe("chat filter coordinator", () => {
  it("does not create a worker without filters", () => {
    const { coordinator, workers } = setup();
    expect(coordinator.includes("nick", "message")).toBe(true);
    expect(workers).toHaveLength(0);
  });

  it("hides pending text, then applies the result and caches by content", () => {
    const { coordinator, workers, changed } = setup();
    coordinator.setPatterns("^spam_", "badword");
    expect(coordinator.includes("regular", "hello")).toBe(false);
    expect(workers).toHaveLength(1);
    expect(workers[0].postMessage).not.toHaveBeenCalled();
    workers[0].send({ type: "ready" });
    expect(workers[0].postMessage).toHaveBeenCalledWith({
      type: "evaluate",
      id: 1,
      nickname: "regular",
      message: "hello",
      usernamePattern: "^spam_",
      messagePattern: "badword",
    });
    workers[0].send({ type: "result", id: 1, visible: true });
    expect(changed).toHaveBeenCalledOnce();
    expect(coordinator.includes("regular", "hello")).toBe(true);
    expect(coordinator.includes("regular", "badword")).toBe(false);
    workers[0].send({ type: "result", id: 2, visible: false });
    expect(coordinator.includes("regular", "badword")).toBe(false);
  });

  it("invalidates results when patterns change and ignores stale workers", () => {
    const { coordinator, workers } = setup();
    coordinator.setPatterns("old", "");
    coordinator.includes("nick", "message");
    workers[0].send({ type: "ready" });
    coordinator.setPatterns("new", "");
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    workers[0].send({ type: "result", id: 1, visible: true });
    expect(coordinator.includes("nick", "message")).toBe(false);
    expect(workers).toHaveLength(2);
    expect(workers[0].emitError()).toHaveBeenCalledOnce();
    workers[0].onmessageerror?.();
    workers[1].send({ type: "ready" });
    workers[1].send({ type: "result", id: 2, visible: true });
    expect(coordinator.includes("nick", "message")).toBe(true);
  });

  it("terminates a stuck evaluation and continues queued messages", () => {
    vi.useFakeTimers();
    try {
      const { coordinator, workers } = setup();
      coordinator.setPatterns("^(a+)+$", "");
      coordinator.includes("a".repeat(100) + "!", "first");
      coordinator.includes("regular", "second");
      workers[0].send({ type: "ready" });
      vi.advanceTimersByTime(50);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(workers).toHaveLength(2);
      expect(workers[0].emitError()).toHaveBeenCalledOnce();
      workers[1].send({ type: "ready" });
      expect(workers[1].postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ message: "second" }),
      );
      workers[1].send({ type: "result", id: 2, visible: true });
      expect(coordinator.includes("regular", "second")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed on startup timeout and does not restart indefinitely", () => {
    vi.useFakeTimers();
    try {
      const { coordinator, workers } = setup();
      coordinator.setPatterns("blocked", "");
      coordinator.includes("one", "first");
      vi.advanceTimersByTime(5000);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      coordinator.includes("two", "second");
      expect(workers).toHaveLength(1);
      expect(coordinator.includes("one", "first")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores duplicate readiness and out-of-order results", () => {
    const { coordinator, workers, changed } = setup();
    coordinator.setPatterns("blocked", "");
    coordinator.includes("first", "one");
    workers[0].send({ type: "ready" });
    workers[0].send({ type: "ready" });
    workers[0].send({ type: "result", id: 999, visible: true });
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    workers[0].send({ type: "result", id: 1, visible: true });
    expect(coordinator.includes("first", "one")).toBe(true);
  });

  it("fails closed when worker construction throws and does not retry the same pattern", () => {
    const createWorker = vi.fn((): ChatFilterWorker => {
      throw new Error("Workers unavailable");
    });
    const changed = vi.fn();
    const coordinator = createChatFilterCoordinator({
      createWorker,
      onChange: changed,
    });
    coordinator.setPatterns("blocked", "");
    expect(coordinator.includes("nick", "message")).toBe(false);
    expect(coordinator.includes("other", "message")).toBe(false);
    expect(createWorker).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("fails closed when posting to the worker throws", () => {
    const { coordinator, workers, changed } = setup();
    coordinator.setPatterns("blocked", "");
    coordinator.includes("nick", "message");
    workers[0].postMessage.mockImplementation(() => {
      throw new Error("clone failed");
    });
    workers[0].send({ type: "ready" });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(coordinator.includes("nick", "message")).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("fails closed when a current worker reports a deserialization error", () => {
    const { coordinator, workers, changed } = setup();
    coordinator.setPatterns("blocked", "");
    coordinator.includes("nick", "message");
    workers[0].onmessageerror?.();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(coordinator.includes("nick", "message")).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("skips a queued input after it leaves the active list", () => {
    const { coordinator, workers } = setup();
    coordinator.setPatterns("blocked", "");
    const first = { nickname: "first", message: "one", timestamp: 1 };
    const departed = { nickname: "departed", message: "two", timestamp: 2 };
    const replacement = {
      nickname: "replacement",
      message: "three",
      timestamp: 3,
    };
    coordinator.setActiveItems([first, departed]);
    coordinator.includes(first.nickname, first.message);
    coordinator.includes(departed.nickname, departed.message);
    workers[0].send({ type: "ready" });
    coordinator.setActiveItems([first, replacement]);
    coordinator.includes(replacement.nickname, replacement.message);
    workers[0].send({ type: "result", id: 1, visible: true });
    expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    expect(workers[0].postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ nickname: "replacement" }),
    );
    expect(coordinator.includes(departed.nickname, departed.message)).toBe(
      false,
    );
  });

  it("bounds queued work and cached results, and disposes the worker", () => {
    const { coordinator, workers } = setup();
    coordinator.setPatterns("blocked", "");
    for (let index = 0; index < 200; index++) {
      expect(coordinator.includes(`nick${index}`, "message")).toBe(false);
    }
    workers[0].send({ type: "ready" });
    expect(coordinator.pendingCount).toBeLessThanOrEqual(128);
    coordinator.dispose();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(coordinator.pendingCount).toBe(0);
    workers[0].send({ type: "result", id: 1, visible: true });
    expect(coordinator.includes("nick0", "message")).toBe(false);
  });

  it("clears startup timers on disposal and ignores late worker events", () => {
    vi.useFakeTimers();
    try {
      const { coordinator, workers, changed } = setup();
      coordinator.setPatterns("blocked", "");
      coordinator.includes("nick", "message");
      coordinator.dispose();
      workers[0].send({ type: "ready" });
      expect(workers[0].emitError()).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(5000);
      expect(workers[0].terminate).toHaveBeenCalledOnce();
      expect(changed).not.toHaveBeenCalled();
      expect(coordinator.includes("nick", "message")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores timeout callbacks from replaced workers", () => {
    vi.useFakeTimers();
    const scheduled: Array<() => void> = [];
    const fakeSetTimeout = globalThis.setTimeout;
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      delay?: number,
    ) => {
      scheduled.push(callback);
      return fakeSetTimeout(callback, delay);
    }) as typeof setTimeout);
    try {
      const { coordinator, workers } = setup();
      coordinator.setPatterns("first", "");
      coordinator.includes("nick", "message");
      const firstStartupTimeout = scheduled.at(-1)!;

      coordinator.setPatterns("second", "");
      coordinator.includes("nick", "message");
      firstStartupTimeout();
      expect(workers[1].terminate).not.toHaveBeenCalled();

      workers[1].send({ type: "ready" });
      const secondEvaluationTimeout = scheduled.at(-1)!;
      coordinator.setPatterns("third", "");
      coordinator.includes("nick", "message");
      secondEvaluationTimeout();
      expect(workers[2].terminate).not.toHaveBeenCalled();
      workers[2].send({ type: "ready" });
      workers[2].send({ type: "result", id: 3, visible: true });
      expect(coordinator.includes("nick", "message")).toBe(true);
    } finally {
      timeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("eventually evaluates inputs beyond the queue limit", async () => {
    const { coordinator, workers, changed } = setup();
    coordinator.setPatterns("blocked", "");
    const items = Array.from({ length: 130 }, (_, index) => ({
      nickname: `nick${index}`,
      message: "message",
      timestamp: index,
    }));
    coordinator.setActiveItems(items);
    const readAll = () =>
      items.map((item) => coordinator.includes(item.nickname, item.message));
    changed.mockImplementation(readAll);
    expect(readAll().every((visible) => !visible)).toBe(true);
    workers[0].postMessage.mockImplementation((request: ChatFilterRequest) => {
      queueMicrotask(() =>
        workers[0].send({ type: "result", id: request.id, visible: true }),
      );
    });
    workers[0].send({ type: "ready" });
    await vi.waitFor(() => expect(readAll().every(Boolean)).toBe(true));
    expect(workers[0].postMessage).toHaveBeenCalledTimes(items.length);
  });

  it("prunes departed inputs without reevaluating an unchanged oversized list", () => {
    const { coordinator, workers } = setup();
    coordinator.setPatterns("blocked", "");
    const items = Array.from({ length: 4100 }, (_, index) => ({
      nickname: `nick${index}`,
      message: "message",
      timestamp: index,
    }));
    coordinator.setActiveItems(items);
    const readAll = () =>
      items.map((item) => coordinator.includes(item.nickname, item.message));
    readAll();
    const count = coordinator.cacheCount;
    expect(count).toBeLessThanOrEqual(4096);
    expect(coordinator.pendingCount).toBeLessThanOrEqual(128);
    readAll();
    expect(coordinator.cacheCount).toBe(count);
    expect(workers).toHaveLength(1);

    const replacement = [
      ...items.slice(1),
      { nickname: "new", message: "message", timestamp: 4101 },
    ];
    coordinator.setActiveItems(replacement);
    expect(coordinator.cacheCount).toBeLessThan(count);
  });

  it("settles an oversized roster and admits new inputs after old ones leave", async () => {
    const { coordinator, workers, changed } = setup(2);
    coordinator.setPatterns("blocked", "");
    let items = [
      { nickname: "old", message: "a", timestamp: 1 },
      { nickname: "middle", message: "b", timestamp: 2 },
      { nickname: "new", message: "c", timestamp: 3 },
    ];
    const readAll = () => {
      coordinator.setActiveItems(items);
      return items.map((item) =>
        coordinator.includes(item.nickname, item.message),
      );
    };
    changed.mockImplementation(readAll);
    expect(readAll()).toEqual([false, false, false]);
    workers[0].postMessage.mockImplementation((request: ChatFilterRequest) => {
      queueMicrotask(() =>
        workers[0].send({ type: "result", id: request.id, visible: true }),
      );
    });
    workers[0].send({ type: "ready" });
    await vi.waitFor(() => expect(readAll()).toEqual([false, true, true]));
    const jobs = workers[0].postMessage.mock.calls.length;
    readAll();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(jobs);

    items = [
      { nickname: "middle", message: "b", timestamp: 2 },
      { nickname: "new", message: "c", timestamp: 3 },
      { nickname: "latest", message: "d", timestamp: 4 },
    ];
    expect(readAll()).toEqual([false, true, false]);
    await vi.waitFor(() => expect(readAll()).toEqual([false, true, true]));
    expect(coordinator.cacheCount).toBe(2);
  });

  it("stops after a worker error and stays hidden until patterns change", () => {
    const { coordinator, workers } = setup();
    coordinator.setPatterns("blocked", "");
    coordinator.includes("nick", "message");
    expect(workers[0].emitError()).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(coordinator.includes("nick", "message")).toBe(false);
    expect(workers).toHaveLength(1);
    coordinator.setPatterns("different", "");
    coordinator.includes("nick", "message");
    expect(workers).toHaveLength(2);
  });

  it("preserves JavaScript lookaround and backreference semantics", () => {
    expect(evaluateChatFilter("(?<=foo)bar", "", "foobar", "hello")).toBe(
      false,
    );
    expect(evaluateChatFilter("", "^(.)\\1$", "nick", "aa")).toBe(false);
    expect(evaluateChatFilter("", "^(.)\\1$", "nick", "ab")).toBe(true);
  });
});
