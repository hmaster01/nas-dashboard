# --- Build-Stage -----------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# --- Runtime-Stage -----------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# top/free/df werden von app/api/system/route.ts aufgerufen (Live-NAS-Werte)
RUN apk add --no-cache procps

ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
