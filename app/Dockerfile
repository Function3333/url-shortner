# syntax=docker/dockerfile:1
#
# Multi-stage build:
#   builder — installs all deps, compiles TS -> dist/, generates openapi.json
#   runner  — production deps only, copies the build, runs as a non-root user
#
# Build:  docker build -t cicd-rollback-demo:dev --build-arg BUILD_SHA=$(git rev-parse --short HEAD) app/

# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app and emit the committed-shape OpenAPI document.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm run openapi

# ---- runner ----
FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built artifacts.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openapi.json ./openapi.json

# BUILD_SHA flows ARG -> ENV so GET /version reports the image identity.
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
ENV PORT=3000
EXPOSE 3000

# Drop privileges (the node image ships a non-root "node" user).
USER node

# Liveness from the container's own perspective.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
