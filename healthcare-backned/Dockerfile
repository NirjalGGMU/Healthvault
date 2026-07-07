# ---------- Stage 1: install deps and compile TypeScript ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: slim runtime image ----------
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Uploaded avatars and log files should survive container restarts
RUN mkdir -p uploads logs

EXPOSE 5001

CMD ["node", "dist/server.js"]
