FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY services/ai-bot/package.json ./services/ai-bot/
COPY services/ai-bot/tsconfig.json ./services/ai-bot/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared/ ./packages/shared/
COPY services/ai-bot/ ./services/ai-bot/

RUN apk add --no-cache python3 make g++  # for webrtcvad native build
RUN pnpm --filter @futuremode/shared build
RUN pnpm --filter @futuremode/ai-bot build

FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY services/ai-bot/package.json ./services/ai-bot/
RUN apk add --no-cache python3 make g++
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/ai-bot/dist ./services/ai-bot/dist

ENV NODE_ENV=production

CMD ["sh", "-c", "cd services/ai-bot && node dist/index.js"]
