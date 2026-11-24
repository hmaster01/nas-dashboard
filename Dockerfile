# --- Build-Stage -----------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# --- Runtime-Stage -----------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Der Agent (Docker-Erkennung, Host-Messwerte) steckt im selben Image und braucht keine Pakete.
# Er startet nur mit docker-compose.discovery.yml (Befehl: node agent/server.mjs).
COPY --from=builder --chown=nextjs:nodejs /app/agent ./agent

# Gemeinsames Volume für den Agent-Socket: Ein neues Volume übernimmt den Besitzer dieses Ordners,
# damit Dashboard und Agent (beide als "nextjs") ohne Root-Rechte darauf zugreifen können.
RUN mkdir -p /run/agent && chown nextjs:nodejs /run/agent

USER nextjs
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
