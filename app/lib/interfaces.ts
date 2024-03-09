export interface ChatExtra {
  emojis?: {
    // key: emoji id, value: emoji url
    [key: string]: string;
  };
  stickers?: {
    // key: sticker id, value: sticker url
    [key: string]: string;
  };
  badges?: {
    // key: badge id, value: badge url
    [key: string]: string;
  };
}

export type ChatPlatform = "chzzk" | "twitch" | "youtube-live";
export type ChatTheme =
  | "default"
  | "colorful"
  | "video-master"
  | "simple"
  | "pure";
export type SoundEffectType =
  | "none"
  | "beep"
  | "bell"
  | "pingpong-bounce"
  | "retro-acute"
  | "retro-blob"
  | "retro-coin"
  | "scifi-terminal"
  | "synth-beep"
  | "custom";

export interface ChatOptions {
  chzzkChannelId?: string;
  twitchChannel?: string;
  youtubeHandle?: string;
  theme?: ChatTheme;
  maxChatSize?: number;
  hiddenUsernameRegex?: string;
  hiddenMessageRegex?: string;
  soundEffectType?: SoundEffectType;
  soundEffectVolume?: number;
  soundEffectCustomUrl?: string;
  isUseOpenDcconSelector?: boolean;
  isHidePlatformIcon?: boolean;
}

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

export interface ApiError {
  status: "ERROR";
  error: string;
}

export interface ChzzkChatChannelIdResponse {
  status: "OK";
  chatChannelId: string;
}

export interface TwitchBadge {
  // key: badge id, value: badge url
  [key: string]: string;
}

export interface TwitchBadgesResponse {
  status: "OK";
  badge: TwitchBadge;
}
