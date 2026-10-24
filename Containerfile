# syntax=docker/dockerfile:1
# Multi-stage build for the Yes2SDK MCP remote HTTP server (mcp.yes2games.com).
# Build stage compiles TS -> dist/; runtime stage ships prod deps + dist/ + docs/.

FROM node:26.12.1-alpine AS build
WORKDIR /app
# Install all deps (incl. dev). --ignore-scripts skips the `prepare` tsc, which
# would run before sources are copied; the explicit build below compiles TS.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:26.12.1-alpine AS runtime
# MCP_ALLOWED_ORIGINS admits browser-based MCP clients through the Origin check
# in src/http.ts. CLI hosts and server-side fetch send no Origin and never
# needed it; a claude.ai / claude.com connector running in the page does. Both
# are Anthropic's own origins. The docs tools stay unauthenticated and the
# upload tools act only with the caller's own dashboard key, passed through per
# request and never stored (the container holds no secrets), so admitting them
# grants no capability a plain curl did not already have.
# Override at the unit level to change the list.
# MCP_OAUTH_ENABLED turns on lazy OAuth sign-in for the dashboard tools
# (src/lib/oauth.ts): a 401 challenge on a dashboard tools/call without a usable
# credential, plus the protected resource metadata routes. It is config, not a
# secret. Off ships phase 1 unchanged; flip it to 1 only once the dashboard's
# authorization server is live (dashboard OAUTH_ENABLED=1).
ENV NODE_ENV=production \
    PORT=8091 \
    MCP_ALLOWED_ORIGINS=https://claude.ai,https://claude.com \
    MCP_OAUTH_ENABLED=0
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
