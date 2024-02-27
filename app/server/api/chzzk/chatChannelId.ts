import {
  ChzzkChatChannelIdResponse,
  ChzzkChatChannelIdError,
} from "~/lib/interfaces";

export default defineEventHandler(
  async (
    event
  ): Promise<ChzzkChatChannelIdResponse | ChzzkChatChannelIdError> => {
    const query = getQuery(event);
    const channelId = query.channelId;
    if (!channelId || typeof channelId !== "string") {
      return {
        status: "ERROR",
        error: "channelId param should be a string",
      };
    }
    const response = await fetch(
      `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`
    );
    const responseJson = await response.json();
    if (responseJson?.content?.chatChannelId === undefined) {
      return {
        status: "ERROR",
        error: "No chatChannelId in response",
      };
    }
    const chatChannelId = responseJson.content.chatChannelId;
    return {
      status: "OK",
      chatChannelId: chatChannelId,
    };
  }
);
