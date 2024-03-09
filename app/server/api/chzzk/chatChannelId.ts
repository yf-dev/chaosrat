import { ChzzkChatChannelIdResponse, ApiError } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<ChzzkChatChannelIdResponse | ApiError> => {
    try {
      const query = getQuery(event);
      const channelId = query.channelId;
      if (!channelId || typeof channelId !== "string") {
        return {
          status: "ERROR",
          error: "channelId param should be a string",
        };
      }
      const response = await $fetch<{
        content?: {
          chatChannelId?: string;
        };
      }>(
        `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`
      );
      if (response?.content?.chatChannelId === undefined) {
        return {
          status: "ERROR",
          error: "No chatChannelId in response",
        };
      }
      const chatChannelId = response.content.chatChannelId;
      return {
        status: "OK",
        chatChannelId: chatChannelId,
      };
    } catch (error) {
      console.log("Chzzk chatChannelId Api Error");
      console.error(error);
      return {
        status: "ERROR",
        error: "Internal Server Error",
      };
    }
  }
);
