# Next Level notes

A digital storefront for handwritten study notes, e-books, and revision guides, with protected UPI checkout and downloads.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/next-level-notes/` — storefront preview and production frontend build
- `e-com-main/backend/` — Express + MongoDB API and admin routes
- `e-com-main/public/` — static storefront output, admin page, and public product images
- `render.yaml` — Render Blueprint
- `e-com-main/RENDER_SETUP.md` — Render setup, environment variables, and storage requirements

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Customers can browse and buy digital study resources, submit UPI payment details, track orders, and download approved purchases. Admins manage notes, orders, UPI, and support settings through `/admin`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
