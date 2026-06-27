# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `npm run dev` — start both API server and frontend concurrently
- `npm run dev:api` — run the API server only (port 3001)
- `npm run dev:web` — run the frontend only (port 5173)
- `npm run db:push` — push DB schema changes to Postgres (dev only)
- `npm run typecheck` — full typecheck across all packages
- `npm run build` — build all packages
- `npm run codegen -w @workspace/api-spec` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Postgres connection string (see `.env.example`)

## Stack

- npm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See `README.md` for workspace structure, setup instructions, and package details
