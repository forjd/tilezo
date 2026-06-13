# syntax=docker/dockerfile:1

FROM oven/bun:1.3.13 AS base
WORKDIR /app

COPY package.json bun.lock tsconfig.base.json biome.json ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/engine/package.json ./packages/engine/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json

RUN bun install --frozen-lockfile

COPY . .

FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000 3001
CMD ["bun", "run", "dev"]

FROM base AS client-build
ARG PUBLIC_API_URL=http://localhost:3000
ARG PUBLIC_WS_URL=ws://localhost:3000/ws
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
RUN bun run --filter '@tilezo/client' build

FROM caddy:2-alpine AS client
COPY --from=client-build /app/apps/client/dist /usr/share/caddy
EXPOSE 80

FROM base AS server-build
RUN bun build apps/server/src/index.ts --target bun --outfile dist/server.js

FROM base AS server-migrate
ENV NODE_ENV=production
# Drop root: the oven/bun image ships a non-root `bun` user.
USER bun
CMD ["bun", "run", "--cwd", "apps/server", "db:migrate"]

FROM oven/bun:1.3.13 AS server
WORKDIR /app
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=server-build /app/dist/server.js ./server.js
COPY --from=server-build /app/assets ./assets
EXPOSE 3000
# Run the internet-facing WebSocket server as the non-root `bun` user so a process
# compromise does not start out with root inside the container.
USER bun
CMD ["bun", "server.js"]
