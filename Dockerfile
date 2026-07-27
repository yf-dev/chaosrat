FROM node:24.18-alpine AS builder

# NOTE: runtimeConfig values (NUXT_TWITCH_CLIENT_ID/SECRET,
# NUXT_CHZZK_CLIENT_ID/SECRET, NUXT_PUBLIC_BASE_URL, NUXT_PUBLIC_GTAG_ID) are
# NOT build-time inputs. `nuxt build` never calls `useRuntimeConfig()` -- Nitro
# resolves runtimeConfig (public and private alike) from the process
# environment at server start / per-request, and this image runs Nitro's
# node-server preset (SSR), not `nuxt generate`, so nothing gets inlined into
# a static bundle either. Baking them in here would mean the OAuth client
# secrets travel with the image (readable via `docker inspect`/`docker
# history` by anyone who has it) for no functional benefit. Supply all of
# them as `environment:` at `docker run`/compose time instead -- see
# docker-compose.yml. Do NOT reintroduce these as ARG/ENV.
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /home/node/app
COPY app /home/node/app
RUN npm ci --include=dev && npm run build

FROM node:24.18-alpine

COPY --from=builder /home/node/app/.output /home/node/app
WORKDIR /home/node/app

ENV NITRO_PORT 80
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# See the NOTE in the builder stage above: NUXT_TWITCH_CLIENT_ID/SECRET,
# NUXT_CHZZK_CLIENT_ID/SECRET, NUXT_PUBLIC_BASE_URL and NUXT_PUBLIC_GTAG_ID
# are runtime-only. They must be provided as `environment:` (or `--env`) at
# container-start time, never as ARG/ENV here.

CMD ["node", "server/index.mjs"]

EXPOSE 80
