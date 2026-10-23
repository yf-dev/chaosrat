export interface ChatFilterRequest {
  type: "evaluate";
  id: number;
  nickname: string;
  message: string;
  usernamePattern: string;
  messagePattern: string;
}

export type ChatFilterResponse =
  { type: "ready" } | { type: "result"; id: number; visible: boolean };

export function evaluateChatFilter(
  usernamePattern: string,
  messagePattern: string,
  nickname: string,
  message: string,
): boolean {
  if (usernamePattern && new RegExp(usernamePattern).test(nickname)) {
    return false;
  }
  if (messagePattern && new RegExp(messagePattern).test(message)) {
    return false;
  }
  return true;
}
