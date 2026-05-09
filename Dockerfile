# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so dependency layer is cached separately from source
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --ignore-scripts

# Generate Prisma client for the target platform
RUN npx prisma generate

COPY . .

RUN npm run build && test -f dist/main.js

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Non-root user for principle of least privilege
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nestjs

# Install production deps only
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts \
 && npx prisma generate \
 && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

USER nestjs

EXPOSE 8000

# /v1/health/ready checks both DB and Redis — ideal for container readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8000/v1/health/ready || exit 1

CMD ["node", "dist/main"]
