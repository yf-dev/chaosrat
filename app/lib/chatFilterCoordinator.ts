import type { ChatFilterRequest, ChatFilterResponse } from "./chatFilter";

const MAX_ENTRIES = 4096;
const MAX_PENDING = 128;
const STARTUP_TIMEOUT_MS = 5000;
const EVALUATION_TIMEOUT_MS = 200;

export interface ChatFilterWorker {
  onmessage: ((event: MessageEvent<ChatFilterResponse>) => void) | null;
  onerror: Worker["onerror"];
  onmessageerror: Worker["onmessageerror"];
  postMessage(message: ChatFilterRequest): void;
  terminate(): void;
}

interface Entry {
  request: ChatFilterRequest;
  result?: boolean;
}

export function createChatFilterCoordinator(deps: {
  createWorker: () => ChatFilterWorker;
  onChange: () => void;
  maxEntries?: number;
}) {
  const maxEntries = deps.maxEntries ?? MAX_ENTRIES;
  let usernamePattern = "";
  let messagePattern = "";
  let worker: ChatFilterWorker | null = null;
  let ready = false;
  let disabled = false;
  let disposed = false;
  let active: Entry | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 1;
  let activeKeys: Set<string> | null = null;
  const entries = new Map<string, Entry>();
  const queue: Entry[] = [];

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function stopWorker() {
    clearTimer();
    worker?.terminate();
    worker = null;
    ready = false;
    active = null;
  }

  function failClosed() {
    stopWorker();
    disabled = true;
    queue.length = 0;
    for (const entry of entries.values()) entry.result = false;
    deps.onChange();
  }

  function startWorker() {
    if (worker || disabled || disposed) return;
    try {
      const created = deps.createWorker();
      worker = created;
      created.onmessage = (event) => {
        if (worker !== created || disposed) return;
        const response = event.data;
        if (response.type === "ready") {
          if (ready) return;
          clearTimer();
          ready = true;
          pump();
          return;
        }
        if (!ready || !active || response.id !== active.request.id) return;
        clearTimer();
        const finished = active;
        active = null;
        if (
          entries.get(
            JSON.stringify([
              finished.request.nickname,
              finished.request.message,
            ]),
          ) === finished
        ) {
          finished.result = response.visible;
          deps.onChange();
        }
        pump();
      };
      created.onerror = (event) => {
        // This worker owns the error. Keep it out of Nuxt's global error UI.
        event.preventDefault();
        if (worker === created && !disposed) failClosed();
      };
      created.onmessageerror = () => {
        if (worker === created && !disposed) failClosed();
      };
      timer = setTimeout(() => {
        if (worker === created && !disposed) failClosed();
      }, STARTUP_TIMEOUT_MS);
    } catch {
      failClosed();
    }
  }

  function pump() {
    if (!worker || !ready || active || disposed) return;
    while (queue.length > 0) {
      const entry = queue.shift()!;
      const key = JSON.stringify([
        entry.request.nickname,
        entry.request.message,
      ]);
      if (entries.get(key) !== entry) continue;
      active = entry;
      const currentWorker = worker;
      try {
        currentWorker.postMessage(entry.request);
      } catch {
        failClosed();
        return;
      }
      timer = setTimeout(() => {
        if (worker !== currentWorker || active !== entry || disposed) return;
        stopWorker();
        entry.result = false;
        deps.onChange();
        if (queue.length > 0) startWorker();
      }, EVALUATION_TIMEOUT_MS);
      return;
    }
  }

  return {
    setPatterns(username: string, message: string) {
      if (usernamePattern === username && messagePattern === message) return;
      stopWorker();
      entries.clear();
      queue.length = 0;
      disabled = false;
      activeKeys = null;
      usernamePattern = username;
      messagePattern = message;
    },
    setActiveItems(
      items: ReadonlyArray<{
        nickname: string;
        message: string;
        timestamp: number;
      }>,
    ) {
      // Keep the newest inputs when the raw list exceeds the memory limit.
      const selected =
        items.length <= maxEntries
          ? items
          : [...items]
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, maxEntries);
      activeKeys = new Set(
        selected.map((item) => JSON.stringify([item.nickname, item.message])),
      );
      for (const key of entries.keys()) {
        if (!activeKeys.has(key)) entries.delete(key);
      }
    },
    includes(nickname: string, message: string): boolean {
      if (disposed) return false;
      if (!usernamePattern && !messagePattern) return true;
      if (disabled) return false;
      const key = JSON.stringify([nickname, message]);
      if (activeKeys && !activeKeys.has(key)) return false;
      let entry = entries.get(key);
      if (entry) {
        return entry.result ?? false;
      }
      if (
        entries.size >= maxEntries ||
        queue.length + Number(active !== null) >= MAX_PENDING
      ) {
        return false;
      }
      entry = {
        request: {
          type: "evaluate",
          id: nextId++,
          nickname,
          message,
          usernamePattern,
          messagePattern,
        },
      };
      entries.set(key, entry);
      queue.push(entry);
      startWorker();
      pump();
      return false;
    },
    get pendingCount() {
      return queue.length + Number(active !== null);
    },
    get cacheCount() {
      return entries.size;
    },
    dispose() {
      disposed = true;
      stopWorker();
      queue.length = 0;
      entries.clear();
    },
  };
}
