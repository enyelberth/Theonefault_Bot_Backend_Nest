# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KAIZEN** — a NestJS backend for automated cryptocurrency trading. It manages multi-account trading on Binance, runs configurable strategies (spot & margin), monitors risk in real time via WebSocket, and surfaces alerts and AI insights through two Telegram bots.

## Commands

```bash
# Development
npm run start:dev          # Watch mode (recommended for dev)
npm run start:debug        # Watch mode with debugger

# Build & Production
npm run build
npm run start:prod

# Code Quality
npm run lint               # ESLint with auto-fix
npm run format             # Prettier

# Testing
npm test                   # All unit tests
npm run test:watch         # Unit tests in watch mode
npm run test:cov           # Coverage report
npm run test:e2e           # End-to-end tests
npx jest src/path/to/file.spec.ts  # Single test file

# Database
npx prisma migrate dev     # Apply migrations
npx prisma generate        # Regenerate Prisma client
npx prisma studio          # Visual DB browser
npm run seed               # Seed the database
```

## Environment Setup

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | PostgreSQL connection (canonical + direct for migrations) |
| `BASE_URL` | Binance base URL (`testnet.binance.vision` in dev, `api.binance.com` in prod) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Auth token signing |
| `GEMINI_API_KEY` | Google Generative AI |
| `BOOT` | Primary Telegram bot token |
| `SOFIA_BOT` | Sofia AI Telegram bot token |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram user IDs with admin access |
| `ENABLE_MARGIN_IN_DEV` | Enable margin trading features outside production |

Docker Compose provides a local PostgreSQL instance: `docker compose up db`.

## Architecture

### Module Structure

NestJS monolith with ~35 feature modules. Key layers:

**Authentication & Security** (`src/authA/`, `src/security/`)
- `AuthGuard` — global JWT guard; use `@Public()` to bypass
- `RolesGuard` — enforces `@Roles(Role.ADMIN, ...)` decorator
- `RateLimitGuard` — applied via `@RateLimit({limit, windowMs})` decorator
- Roles enum: `ADMIN > OPERATOR > TRADER > VIEWER`

**Observability** (`src/observability/`)
- `@Global()` module loaded in `AppModule`
- `CorrelationIdMiddleware` — stamps every request with a correlation ID
- `StructuredLoggingInterceptor` — JSON logs for all HTTP requests/responses with duration and correlation ID

**Database** (`prisma/`)
- ORM: Prisma v6 with PostgreSQL
- 23 models covering users, accounts, orders, strategies, analytics, and accounting
- Schema: `prisma/schema.prisma`; seeds: `prisma/seeds/`

**Trading Core**
- `BinanceModule` — all Binance REST API calls (orders, balances, margin summary, sync logging)
- `TradingModule` / `TradingExecutionModule` — order lifecycle and fill tracking
- `StrategiesTradingModule` + `StrategyMonitoringModule` — strategy config, execution, risk controls
- `StrategyModule` — concrete spot & margin strategy implementations
- `IndicatorsModule` — technical indicators (RSI, MACD, Bollinger Bands via `technicalindicators`)

**Market Data**
- `CryptoPriceWatcherModule` — real-time price polling, feeds alerts
- `AlertModule` — price alert definitions and trigger logic
- `CryptoPairModule` — trading pair registry

**Telegram Bots**
- `TelegramBotModule` (token: `BOOT`) — primary bot; handles trading commands, price alerts, risk notifications, admin panic/liquidation commands; uses long polling via `OnModuleInit`
- `TelegramSofiaModule` (token: `SOFIA_BOT`) — AI-powered bot backed by Google Gemini; provides market insights

**AI Integration** (`src/geminis/`)
- `GeminiService` wraps `@google/generative-ai` for market analysis and signal generation

**Real-time WebSocket** (`src/crypto-guard/`)
- `CryptoGuardGateway` — Socket.io gateway for live margin balance, PNL, and risk level updates to connected clients

**Accounting** (`src/transaction/`)
- Double-entry bookkeeping: `JournalEntry` → `JournalEntryLine`
- `TransactionModule` covers inter-account transfers and journal entries

### Key Patterns

- Each module typically has `*.module.ts`, `*.service.ts`, `*.controller.ts`, and `*.dto.ts` files
- Shared TypeScript interfaces live in `src/interfaces/`
- Utility functions and env helpers in `src/utils/`
- Test factories and fixtures under `test/factories/` and `test/fixtures/`

### CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push: Prisma validation, build, and unit tests (`--runInBand`). Docker and docker-compose are used for local development and production deployment.
