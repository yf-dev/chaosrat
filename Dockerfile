FROM node:18-alpine as builder

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ARG NUXT_TWITCH_CLIENT_ID
ENV NUXT_TWITCH_CLIENT_ID=${NUXT_TWITCH_CLIENT_ID}
ARG NUXT_TWITCH_CLIENT_SECRET
ENV NUXT_TWITCH_CLIENT_SECRET=${NUXT_TWITCH_CLIENT_SECRET}
ARG NUXT_PUBLIC_GTAG_ID
ENV NUXT_PUBLIC_GTAG_ID=${NUXT_PUBLIC_GTAG_ID}

WORKDIR /home/node/app
COPY app /home/node/app
RUN npm ci --include=dev && npm run build

FROM node:18-alpine

COPY --from=builder /home/node/app/.output /home/node/app
WORKDIR /home/node/app

ENV NITRO_PORT 80
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ARG NUXT_TWITCH_CLIENT_ID
ENV NUXT_TWITCH_CLIENT_ID=${NUXT_TWITCH_CLIENT_ID}
ARG NUXT_TWITCH_CLIENT_SECRET
ENV NUXT_TWITCH_CLIENT_SECRET=${NUXT_TWITCH_CLIENT_SECRET}
ARG NUXT_PUBLIC_GTAG_ID
ENV NUXT_PUBLIC_GTAG_ID=${NUXT_PUBLIC_GTAG_ID}

CMD ["node", "server/index.mjs"]

EXPOSE 80
