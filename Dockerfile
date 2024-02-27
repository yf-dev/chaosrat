FROM node:18-alpine as builder

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /home/node/app
COPY app /home/node/app
RUN npm ci --include=dev && npm run build

FROM node:18-alpine

COPY --from=builder /home/node/app/.output /home/node/app
WORKDIR /home/node/app

ENV NITRO_PORT 80

CMD ["node", "server/index.mjs"]

EXPOSE 80
