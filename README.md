# Crash Game

Monorepo fullstack de um crash game com carteira, autenticação OIDC, tempo real e contratos compartilhados entre frontend e backends.

## Visão Geral

O sistema é dividido em quatro partes principais:

- `frontend`: interface React com Vite, TanStack Router, TanStack Query, Zustand e Socket.IO.
- `services/games`: motor do jogo, lifecycle das rodadas, apostas, cashout, histórico e eventos em tempo real.
- `services/wallets`: carteira do jogador, ledger idempotente e processamento de comandos financeiros.
- `packages/contracts`: contratos compartilhados de DTOs, eventos, constantes e helpers de dinheiro.

O projeto também inclui infraestrutura local com PostgreSQL, RabbitMQ, Keycloak e Kong.

## Principais Features

- Login com Keycloak via OIDC Authorization Code + PKCE.
- Criação automática de wallet para o jogador autenticado.
- Rodadas com fases `betting`, `running` e `crashed`.
- Apostas com validação de valor, regra de uma aposta por rodada por jogador e cashout em tempo real.
- Carteira com saldo em centavos, histórico de ledger e idempotência por chave de comando.
- Atualização em tempo real por Socket.IO, com replay de eventos para reconexão.
- Verificação `provably fair` das rodadas passadas.
- API documentada com Swagger em cada serviço.
- Contratos compartilhados para evitar divergência entre frontend e backends.
- Stack local via Docker Compose para subir toda a plataforma com um único comando.

## Stack

- Bun
- TypeScript
- React
- Vite
- TanStack Router
- TanStack Query
- Zustand
- NestJS
- Socket.IO
- PostgreSQL
- RabbitMQ
- Keycloak
- Kong
- Husky
- Commitizen

## Estrutura Do Repositório

- `frontend/`
- `services/games/`
- `services/wallets/`
- `packages/contracts/`
- `docker/`
- `scripts/`
- `.husky/`

## Requisitos

- Bun 1.x
- Docker e Docker Compose
- Node.js, porque o wrapper de commit ainda chama `node scripts/run-commit.cjs`

## Instalação

```sh
bun install
```

## Configuração De Ambiente

Cada serviço possui um arquivo de exemplo de variáveis de ambiente:

- `services/games/.env.example`
- `services/wallets/.env.example`

Para rodar localmente sem Docker, copie os arquivos de exemplo para `.env` e ajuste os valores conforme o seu ambiente.

Variáveis importantes:

- `OIDC_ISSUER`: emissor do Keycloak.
- `OIDC_JWKS_URL`: endpoint de chaves públicas do Keycloak.
- `DATABASE_URL`: conexão com o PostgreSQL.
- `RABBITMQ_URL`: conexão com o RabbitMQ.
- `VITE_API_BASE_URL`: base URL usada pelo frontend para acessar o gateway.
- `VITE_OIDC_CLIENT_ID`: client OIDC do frontend.
- `VITE_OIDC_ISSUER`: issuer OIDC usado no browser.

## Como Rodar

### Stack completa com Docker

```sh
bun run docker:up
```

Isso sobe:

- PostgreSQL em `localhost:5432`
- RabbitMQ em `localhost:5672` e painel em `localhost:15672`
- Keycloak em `localhost:8080`
- Kong em `localhost:8000` e `localhost:8001`
- Games em `localhost:4001`
- Wallets em `localhost:4002`
- Frontend em `localhost:3000`

### Rodando fora do Docker

1. Suba a infraestrutura de suporte.

```sh
docker compose up -d postgres rabbitmq keycloak
```

2. Inicie os serviços que você quiser em terminais separados.

```sh
cd services/games
bun run dev
```

```sh
cd services/wallets
bun run dev
```

```sh
cd frontend
bun run dev
```

3. Acesse o frontend em `http://localhost:5173`.

## Scripts Raiz

- `bun run docker:up`: sobe os containers
- `bun run docker:down`: derruba os containers
- `bun run docker:prune`: remove volumes e imagens do stack
- `bun run test:games:unit`: testes unitários de `services/games`
- `bun run test:games:e2e`: testes e2e de `services/games`
- `bun run test:wallets:unit`: testes unitários de `services/wallets`
- `bun run test:wallets:e2e`: testes e2e de `services/wallets`
- `bun run test:frontend`: testes do frontend
- `bun run test:all`: executa todas as suítes em paralelo
- `bun run commit`: roda a suíte completa de testes e abre o fluxo guiado de commit

## APIs E Interfaces

- Games service: `http://localhost:4001/docs`
- Wallets service: `http://localhost:4002/docs`
- Gateway do Kong: `http://localhost:8000`
- Admin do Kong: `http://localhost:8001`
- Keycloak: `http://localhost:8080`
- RabbitMQ Management: `http://localhost:15672`

Rotas expostas pelo gateway:

- `/games`
- `/wallets`

## Login De Teste

O realm local já vem com usuários de exemplo:

- `player` / `player123`
- `ranger` / `ranger123`

## Fluxo De Commit

Este repositório usa `Husky` + `Commitizen` para padronizar commits.

Use sempre:

```sh
bun run commit
```

Esse comando faz o seguinte:

- roda `bun run test:all`
- adiciona os arquivos alterados
- abre o prompt interativo do Commitizen

Formato esperado para a mensagem:

```text
type(scope): subject
```

Exemplos:

```text
feat(games): add round replay
fix(wallets): handle idempotent debit
chore: update dependencies
```

Tipos aceitos:

- `feat`
- `fix`
- `docs`
- `chore`
- `docker`

Scopes aceitos:

- `games`
- `wallets`
- `frontend`
- `contracts`
- `none`

Regras importantes:

- `git commit` direto é bloqueado pelos hooks.
- Merge, squash e template commits continuam permitidos.
- O subject deve estar no imperativo e sem ponto final.
- O header inteiro é validado para caber no limite definido pelo fluxo.

## Observações

- O frontend usa autenticação persistida no browser e sincronização em tempo real por socket.
- O domínio de jogos trabalha com `provably fair` e histórico verificável de rodadas.
- O domínio de wallets usa ledger e comandos idempotentes para evitar saldo inconsistente.
