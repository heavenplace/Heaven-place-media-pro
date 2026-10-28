# Builds the listener/admin web app and serves it from Caddy, which is also the single
# public origin: it forwards /api and /uploads to the api service, so the browser and the
# Android apps both talk to one host.
#
# Build context is the repository root — see docker-compose.prod.yml.
FROM node:22-alpine AS build

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80 443
