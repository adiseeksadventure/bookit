# syntax=docker/dockerfile:1
# Backend (Express) image. The ONLY service that talks to Postgres. Build context
# is ./server, so this image is fully independent of the Next.js frontend.

# ---- builder: install deps, generate the Prisma client, compile TS -> dist ----
FROM node:20-alpine AS builder
WORKDIR /app
# prisma.config.ts + schema must be present before `npm ci` because the
# postinstall hook runs `prisma generate`.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runner: run the compiled server ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S express -G nodejs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts /app/package.json ./
USER express
EXPOSE 4000
# Apply any pending migrations, then boot. (Seeding stays a manual one-off:
# `docker compose exec backend npm run seed`.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
