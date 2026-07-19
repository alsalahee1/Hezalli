# syntax=docker/dockerfile:1

# =============================================================================
# Hezalli production image
#
# Multi-stage build:
#   deps    → install all dependencies (needs dev deps for the build)
#   builder → generate the Prisma client and compile the Next.js app.
#             This stage keeps the full toolchain and is reused (via the
#             compose `migrate` service) to run `prisma migrate deploy`.
#   runner  → tiny image that ships only the Next.js standalone server.
# =============================================================================

# Debian-based Node (not Alpine): Prisma's engines link against glibc/openssl.
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ----------------------------------------------------------------------------
# deps — install node_modules (postinstall runs `prisma generate`)
# ----------------------------------------------------------------------------
FROM base AS deps
# openssl is required by Prisma's engines at generate/runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# ----------------------------------------------------------------------------
# builder — build the app. Also used at deploy time to run DB migrations.
# ----------------------------------------------------------------------------
FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A dummy URL is fine for `next build` — pages are statically analysed and no
# database connection is opened during the build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma generate
RUN npm run build

# ----------------------------------------------------------------------------
# runner — minimal runtime image (Next.js standalone output)
# ----------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Chromium powers server-side PDF generation (invoices, packing slips, shipping
# labels). Install it plus Latin + Arabic fonts so PDFs render correctly in both
# languages. puppeteer-core drives it via CHROMIUM_PATH.
ENV CHROMIUM_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      chromium \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-hosny-amiri \
      fonts-kacst \
      fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone server + assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Generated Prisma client (imported by the app at runtime).
COPY --from=builder --chown=nextjs:nodejs /app/lib/generated ./lib/generated

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
