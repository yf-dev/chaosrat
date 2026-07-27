import type { ChzzkChatChannelIdResponse, ApiError } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<ChzzkChatChannelIdResponse | ApiError> => {
    try {
      const query = getQuery(event);
      const channelId = query.channelId;
      if (!channelId || typeof channelId !== "string") {
        return {
          status: "ERROR",
          code: "invalid_channel_id",
          error: "channelId param should be a string",
        };
      }
      const response = await $fetch<{
        content?: {
          status?: string;
          openDate?: string;
          chatChannelId?: string | null;
        };
      }>(
        `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`,
      );
      // This is an unofficial polling API. chatChannelId is `null` (not
      // omitted) while the channel is offline, so only the absence of
      // `content` itself counts as a failure — a present-but-null
      // chatChannelId is a normal, successful "offline" result.
      if (!response?.content) {
        return {
          status: "ERROR",
          code: "no_chat_channel_id",
          error: "No content in response",
        };
      }
      return {
        status: "OK",
        chatChannelId: response.content.chatChannelId ?? null,
        liveStatus: response.content.status ?? null,
        openDate: response.content.openDate ?? null,
      };
    } catch (error) {
      console.log("Chzzk chatChannelId Api Error");
      console.error(error);
      return {
        status: "ERROR",
        code: "internal_server_error",
        error: "Internal Server Error",
      };
    }
  },
);
