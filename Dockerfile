FROM node:22-alpine AS builder
WORKDIR /app

# Install all dependencies (including devDeps for build), exactly as pinned in yarn.lock
COPY package.json yarn.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN yarn install --frozen-lockfile

# Build client static assets
COPY . .
RUN yarn build

# Production image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# SQLite database lives here; mount a persistent volume at /data
ENV DATA_DIR=/data
# Release version, shown by /api/version. Baked in at build time so the image is the
# only source of truth; the manifest no longer sets it.
ARG VERSION=dev
ENV VERSION=$VERSION

# Copy built client, server source, and all node_modules (tsx needed at runtime)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server

RUN mkdir -p /data
VOLUME /data

EXPOSE 3000
# Uses root "start" script: yarn workspace activity-logger-server start
# Which runs: cross-env NODE_ENV=production tsx index.ts
CMD ["yarn", "start"]
