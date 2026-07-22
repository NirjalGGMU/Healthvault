# ---------- Stage 1: build the React app ----------
# node:20-alpine
FROM node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

# API URL is baked into the bundle at build time (Vite)
ARG VITE_API_URL=http://localhost:5001
ENV VITE_API_URL=${VITE_API_URL}

# Install dependencies (cached layer)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: serve with nginx (non-root) ----------
# nginxinc/nginx-unprivileged:alpine
FROM nginxinc/nginx-unprivileged@sha256:18d67281256ded39ff65e010ae4f831be18f19356f83c60bc546492c7eb6dd23

# SPA-aware nginx config (React Router deep links work on refresh)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
