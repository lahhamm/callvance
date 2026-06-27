# Callvance

AI-powered outbound calling platform. An admin dashboard for managing clients, contacts, and AI voice call campaigns powered by Bland AI and Claude.

## Stack

- **API**: Express 5, Node.js 24, TypeScript
- **Frontend**: React 19, Vite, Tailwind CSS, Tanstack Query
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Anthropic Claude (summaries, lead scoring) + Bland AI (voice calls)

## Local setup from scratch

### 1. Prerequisites

- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- PostgreSQL running locally (`psql --version`)

Install Node.js from [nodejs.org](https://nodejs.org) or via Homebrew:
```bash
brew install node
```

Install PostgreSQL via Homebrew:
```bash
brew install postgresql@16
brew services start postgresql@16
```

### 2. Clone and install dependencies

```bash
git clone <repo-url>
cd callvance
npm install
```

### 3. Create the local database

```bash
psql -c "CREATE DATABASE callvance;"
```

If your Postgres requires a username:
```bash
psql -U your_username -c "CREATE DATABASE callvance;"
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://YOUR_USERNAME@localhost:5432/callvance` |
| `SESSION_SECRET` | Yes | Random string for signing admin tokens |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (for Claude) |
| `BLAND_AI_API_KEY` | Yes | Bland AI API key (for voice calls) |
| `ADMIN_PASSWORD` | No | Admin dashboard password (default: `nexus2024`) |
| `SERVER_URL` | No | Public URL for Bland AI webhooks (see note below) |
| `PORT` | No | API server port (default: `3001`) |

> **Webhooks note:** `SERVER_URL` is only needed if you want Bland AI to push call results back in real time. Without it, the server polls Bland AI every 30 seconds to sync completed calls — this is fine for development. To enable webhooks locally, use [ngrok](https://ngrok.com): run `ngrok http 3001` and set `SERVER_URL=https://<your-subdomain>.ngrok.io`.

### 5. Push the database schema

```bash
npm run db:push
```

This creates all tables in your local PostgreSQL database using the Drizzle schema.

### 6. Run the app

```bash
npm run dev
```

This starts both servers concurrently:

| Server | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| API | http://localhost:3001 |

The frontend dev server automatically proxies `/api/*` requests to the API server, so everything works from a single browser URL: **http://localhost:5173**

### 7. Log in

Open http://localhost:5173 and log in with:
- **Password**: the value of `ADMIN_PASSWORD` in your `.env` (default: `nexus2024`)

## Running servers separately

```bash
# API only
npm run dev:api

# Frontend only
npm run dev:web
```

## Database commands

```bash
# Push schema changes to the database (no migrations, dev-only destructive sync)
npm run db:push
```

## Project layout

```
artifacts/
  api-server/     Express API — all routes, webhook handler, BlandAI integration
  voice-agent/    React frontend — admin dashboard, client portal
lib/
  db/             Drizzle schema + database client
  api-zod/        Zod schemas generated from OpenAPI spec
  api-client-react/  React Query hooks for the API
  api-spec/       OpenAPI spec (source of truth for API contracts)
scripts/          Utility scripts
```

## Key environment variables in production

In addition to the variables above, set:

- `NODE_ENV=production`
- `SERVER_URL=https://your-public-domain.com` — required for BlandAI webhooks in production
- Use a strong, unique `SESSION_SECRET` and `ADMIN_PASSWORD`
