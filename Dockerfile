FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./

RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejsuser

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

COPY --chown=nodejsuser:nodejs . .

USER nodejsuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/ || exit 1

CMD ["node", "server.js"]
