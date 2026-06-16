# syntax=docker/dockerfile:1
# Multi-stage build for the Yes2SDK MCP remote HTTP server (mcp.yes2games.com).
# Build stage compiles TS -> dist/; runtime stage ships prod deps + dist/ + docs/.

FROM node:24-alpine AS build
WORKDIR /app
# Install all deps (incl. dev). --ignore-scripts skips the `prepare` tsc, which
# would run before sources are copied; the explicit build below compiles TS.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8091
WORKDIR /app
# curl is used by the Quadlet healthcheck (HealthCmd hits /health).
RUN apk add --no-cache curl
# Prod-only deps; --ignore-scripts skips the `prepare` tsc (no TS toolchain here).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Compiled output plus the bundled docs the tools read at runtime. docs/ must sit
# beside dist/ — src/lib/docs.ts resolves DOCS_DIR as <pkg root>/docs.
COPY --from=build /app/dist ./dist
COPY docs ./docs
USER node
EXPOSE 8091
CMD ["node", "dist/http.js"]
