FROM oven/bun:1-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json bun.lock ./
COPY packages ./packages
COPY services/games/package.json ./services/games/package.json
COPY services/wallets/package.json ./services/wallets/package.json
COPY frontend/package.json ./frontend/package.json
RUN bun install --frozen-lockfile

COPY services/games ./services/games

WORKDIR /app/services/games

EXPOSE 4001

CMD ["bun", "run", "src/main.ts"]
