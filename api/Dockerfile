# Production image for the API.
#
# The sandbox runs this same source from a bind mount with `node --watch`
# (docker-compose.base44.yml), so an edit appears immediately. This image is what a
# real deployment runs: the lockfile installed exactly, the source, and no watcher.
FROM node:22-alpine

WORKDIR /app

# Dependencies first, so editing source never reinstalls them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8000

# The schema and the control-room account are created on boot (api/db.js), so a fresh
# database needs nothing but DATABASE_URL.
CMD ["node", "server.js"]
