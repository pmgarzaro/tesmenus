FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
# No VOLUME instruction: Railway rejects it. Mount a volume on /app/data
# (docker-compose) or attach a Railway volume (its path is picked up via
# RAILWAY_VOLUME_MOUNT_PATH).
RUN mkdir -p /app/data
EXPOSE 3000
# HOSTNAME is forced here because platforms set it to the container name.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
