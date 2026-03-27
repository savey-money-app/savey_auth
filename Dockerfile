FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3002

CMD ["bun", "run", "src/index.ts"]
