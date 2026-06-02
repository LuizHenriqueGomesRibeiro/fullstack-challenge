FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages
COPY services/games/package.json ./services/games/package.json
COPY services/wallets/package.json ./services/wallets/package.json
COPY frontend/package.json ./frontend/package.json
RUN bun install --frozen-lockfile

COPY frontend ./frontend

WORKDIR /app/frontend

ENV VITE_API_BASE_URL=http://localhost:8000
RUN /app/frontend/node_modules/.bin/vite build

FROM oven/bun:1-alpine

WORKDIR /app

COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/frontend/package.json ./frontend/package.json
COPY --from=build /app/frontend/node_modules ./frontend/node_modules
COPY --from=build /app/frontend/dist ./frontend/dist

WORKDIR /app/frontend

EXPOSE 3000

CMD ["/app/frontend/node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
