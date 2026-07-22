# ---------- Stage 1: install deps and compile TypeScript ----------
# node:20-alpine
FROM node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: slim runtime image ----------
# node:20-alpine
FROM node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Uploaded avatars and log files should survive container restarts.
# Owned by the unprivileged 'node' user (built into node:20-alpine) since the
# app writes here at runtime and USER switches away from root below.
RUN mkdir -p uploads logs && chown -R node:node /app

USER node

EXPOSE 5001

CMD ["node", "dist/server.js"]
