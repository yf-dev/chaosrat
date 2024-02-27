export interface ChzzkChatChannelIdResponse {
  status: "OK";
  chatChannelId: string;
}

export interface ChzzkChatChannelIdError {
  status: "ERROR";
  error: string;
}

export interface ChatExtra {
  emojis?: {
    // key: emoji id, value: emoji url
    [key: string]: string;
  };
  stickers?: {
    // key: sticker id, value: sticker url
    [key: string]: string;
  };
}

export type ChatPlatform = "chzzk" | "twitch" | "youtube-live";
export type ChatTheme = "default" | "colorful";

export interface ChatItem {
  platform: ChatPlatform;
  id: string;
  nickname: string;
  message: string;
  timestamp: number;
  extra: ChatExtra;
}

export interface StickerItem {
  id: string;
  url: string;
}

export interface DcconResponse {
  user_id: string;
  dccon_url: string;
}

export interface DcconError {
  message: string;
}

export interface DcconData {
  dccons: {
    keywords: string[];
    tags: string[];
    path: string;
  }[];
}
