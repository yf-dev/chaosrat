import {
  evaluateChatFilter,
  type ChatFilterRequest,
  type ChatFilterResponse,
} from "./chatFilter";

self.onmessage = (event: MessageEvent<ChatFilterRequest>) => {
  const request = event.data;
  if (request.type !== "evaluate") return;

  let visible = false;
  try {
    visible = evaluateChatFilter(
      request.usernamePattern,
      request.messagePattern,
      request.nickname,
      request.message,
    );
  } catch {
    // A malformed pattern is hidden even if validation at the URL boundary fails.
  }
  self.postMessage({
    type: "result",
    id: request.id,
    visible,
  } satisfies ChatFilterResponse);
};

self.postMessage({ type: "ready" } satisfies ChatFilterResponse);
