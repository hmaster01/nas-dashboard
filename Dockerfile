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

USER nextjs
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
