import { TwitchBadgesResponse, ApiError, TwitchBadge } from "~/lib/interfaces";

export default defineEventHandler(
  async (event): Promise<TwitchBadgesResponse | ApiError> => {
    const query = getQuery(event);
    const runtimeConfig = useRuntimeConfig(event);
    const twitchClientId = runtimeConfig.twitchClientId;
    const twitchClientSecret = runtimeConfig.twitchClientSecret;

    const channelId = query.twitchChannelId;
    if (!channelId || typeof channelId !== "string") {
      return {
        status: "ERROR",
        error: "channelId param should be a string",
      };
    }

    const badgeData: TwitchBadge = {};

    // get app access token
    const appAccessToken = await $fetch<{
      access_token: string;
      expires_in: number;
      token_type: string;
    }>(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`,
      {
        method: "POST",
      }
    );

    // get global badges
    const globalBadges = await $fetch<{
      data: {
        set_id: string;
        versions: {
          id: string;
          image_url_4x: string;
        }[];
      }[];
    }>(`https://api.twitch.tv/helix/chat/badges/global`, {
      headers: {
        "Client-ID": twitchClientId,
        Authorization: `Bearer ${appAccessToken.access_token}`,
      },
    });
    if (globalBadges) {
      for (const badge of globalBadges.data) {
        for (const version of badge.versions) {
          badgeData[`${badge.set_id}/${version.id}`] = version.image_url_4x;
        }
      }
    }

    // get broadcaster id from username
    const broadcaster = await $fetch<{
      data: {
        id: string;
      }[];
    }>(`https://api.twitch.tv/helix/users?login=${channelId}`, {
      headers: {
        "Client-ID": twitchClientId,
        Authorization: `Bearer ${appAccessToken.access_token}`,
      },
    });

    if (broadcaster.data.length !== 0) {
      // get channel badges
      const channelBadges = await $fetch<{
        data: {
          set_id: string;
          versions: {
            id: string;
            image_url_4x: string;
          }[];
        }[];
      }>(
        `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcaster.data[0].id}`,
        {
          headers: {
            "Client-ID": twitchClientId,
            Authorization: `Bearer ${appAccessToken.access_token}`,
          },
        }
      );
      if (channelBadges) {
        for (const badge of channelBadges.data) {
          for (const version of badge.versions) {
            badgeData[`${badge.set_id}/${version.id}`] = version.image_url_4x;
          }
        }
      }
    }

    return {
      status: "OK",
      badge: badgeData,
    };
  }
);
