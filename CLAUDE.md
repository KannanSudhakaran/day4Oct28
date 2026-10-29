# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

Two independent npm projects (no root package.json), deployed as two separate Vercel projects from the same repo:

- `backend/`: Express 5 + PostgreSQL (`pg`) + Anthropic agent, CommonJS, port 4000
- `frontend/`: React 19 + Vite, ESM, port 5173

## Commands

Backend (`cd backend`; copy `.env.example` to `.env` and set `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, optional `ANTHROPIC_MODEL`; apply `backend/sql/001_auth.sql` once to the database):
- `npm start`: run the API; `npm run dev`: same with `node --watch`
- Swagger UI at `http://localhost:4000/swagger`
- No tests are configured (`npm test` is a placeholder)

Frontend (`cd frontend`; `VITE_API_URL` defaults to `http://localhost:4000`):
- `npm run dev`, `npm run build`, `npm run lint` (oxlint), `npm run preview`

## Architecture

- `backend/src/app.js` defines the whole Express app and exports it without listening. `src/server.js` calls `listen` for local use; `api/index.js` re-exports the app as the Vercel serverless entry (`vercel.json` rewrites every route to it). Add routes in `app.js`.
- Auth: `src/auth.js` (JWT sign + `requireAuth`, which sets `req.user`) and `src/userService.js` (`app_user` table, bcrypt). `app.js` applies `requireAuth` to `/api/customers` and `/api/agent`. There is only the `sales` role.
- Data access lives only in `src/customerService.js` (raw SQL against a `customer` table: `customer_id, name, email, phone, created_at, sales_user_id`). Every function takes `userId` first and filters on `sales_user_id`; never add a query without that filter. Foreign ids behave like missing rows (404). `update` uses `COALESCE`, so passing a field as null/undefined leaves it unchanged. The table must already exist; there are no migrations.
- `src/db.js`: pg Pool with SSL (`rejectUnauthorized: false`) and `max: 3` for serverless.
- `src/agent.js` is the AI agent behind `POST /api/agent {message, history}`. It runs a manual tool-use loop (max 8 steps) over tools that wrap `customerService` (the user id comes from the token via `runTool(name, input, userId)`, never from the model), and returns `{reply, toolCalls, dataChanged}`. When adding a customer capability, add both the tool definition in `tools` and a case in `runTool`. Tools that write must also be listed in `WRITE_TOOLS` so the frontend knows to refresh. The history is supplied by the client; the server is stateless.
- Swagger UI is served as an HTML page that loads assets from jsDelivr, not `swagger-ui-express`, because node_modules assets don't bundle into Vercel functions. The OpenAPI spec comes from `src/swagger.js` at `/swagger/openapi.json`. Update it when changing endpoints.
- Frontend: all HTTP goes through `src/api.js` (adds the bearer token from localStorage; a 401 logs out, and `Auth.jsx` is the login/register view) (`api.list/create/update/remove/ask`). `Customers.jsx` and `CustomerForm.jsx` handle CRUD, and `Chat.jsx` talks to the agent.
- `VITE_API_URL` is baked in at build time, so changing it requires a frontend redeploy.

## Workflow: spec-driven development

- Specs are stored in the `_specs/` folder.
- Once a spec is approved, the implementation plan is written to the `_plans/` folder.
- Before starting implementation, make sure the current branch is committed (no uncommitted changes).
