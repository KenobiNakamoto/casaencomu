# CasaEnComú web image — SCAFFOLD.md § 7. Built on the Pro for linux/arm64, loaded on the Air by deploy.sh.
FROM node:24-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim
# sqlite3 CLI is for the backup's VACUUM INTO (same lock domain as the app).
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# db.ts mkdirs DATA_DIR at import; without this the app dies on boot when no volume is mounted
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
