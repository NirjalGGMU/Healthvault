# ---------- Stage 1: build the React app ----------
FROM node:20-alpine AS builder

WORKDIR /app

# API URL is baked into the bundle at build time (Vite)
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=${VITE_API_URL}

# Install dependencies (cached layer)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.js postcss.config.js ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: serve with nginx ----------
FROM nginx:alpine

# SPA-aware nginx config (React Router deep links work on refresh)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
