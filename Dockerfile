FROM node:20-alpine AS builder
WORKDIR /app

# Install all dependencies (including devDeps for build)
COPY package.json yarn.lock ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# Override registry — yarn.lock was generated on a machine with a private registry
RUN yarn config set registry https://registry.npmjs.org && \
    yarn install --registry https://registry.npmjs.org

# Build client static assets
COPY . .
RUN yarn build

# Production image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy built client, server source, and all node_modules (tsx needed at runtime)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server ./server

EXPOSE 3000
# Uses root "start" script: yarn workspace activity-logger-server start
# Which runs: cross-env NODE_ENV=production tsx index.ts
CMD ["yarn", "start"]
