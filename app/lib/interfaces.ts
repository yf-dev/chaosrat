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

export type ChatPlatform = "chzzk" | "twitch" | "youtube-live" | "kick";
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
  kickChannel?: string;
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
  code: string;
  error: string;
}

export interface ApiOk {
  status: "OK";
}

export interface ChzzkChatChannelIdResponse extends ApiOk {
  chatChannelId: string;
}

export interface ChzzkAuthLoginResponse extends ApiOk {
  authUrl: string;
}

export interface ChzzkMeResponse extends ApiOk {
  channelId: string;
  channelName: string;
}

export interface ChzzkSessionOpenResponse extends ApiOk {
  url: string;
}

export interface TwitchBadge {
  // key: badge id, value: badge url
  [key: string]: string;
}

export interface TwitchBadgesResponse extends ApiOk {
  badge: TwitchBadge;
}

export interface ChatPlatformError {
  id: string;
  platform: ChatPlatform;
  message: string;
  onClick?: () => void;
}
