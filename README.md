# Customer Hub

- `backend/`  Express + Swagger + PostgreSQL + Anthropic agent (port 4000)
- `frontend/` React + Vite UI (port 5173)

## Run locally
```
cd backend  && npm install && cp .env.example .env   # set DATABASE_URL, ANTHROPIC_API_KEY, JWT_SECRET
psql "$DATABASE_URL" -f sql/001_auth.sql              # one-time: users table + customer.sales_user_id
psql "$DATABASE_URL" -f sql/002_admin.sql             # one-time: admin role + default admin user
npm start        # http://localhost:4000/swagger
cd frontend && npm install && npm run dev            # http://localhost:5173
```
Auth: `POST /api/auth/register`, `POST /api/auth/login` (returns a JWT), `GET /api/auth/me`. All customer and agent endpoints require `Authorization: Bearer <token>` and only touch the logged-in user's customers (other users' ids return 404). In Swagger: log in, click Authorize, paste the token. Customer and agent endpoints are sales-only (admin tokens get 403).

Admin: `POST /api/admin/login` and `GET /api/admin/users` (sales users with their customer counts, optional `?q=`). The default admin is `admin@admin.com` / `123456789` (seeded by `002_admin.sql`); replace its password hash on any shared deployment. In the frontend use the "Admin sign in" link on the login screen to reach the dashboard.

Endpoints: `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`, `POST /api/agent {message, history}`.

## Deploy to Vercel (two projects, same repo)
1. **Backend**: import repo, Root Directory `backend`. Env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, optional `ANTHROPIC_MODEL`.
   `vercel.json` rewrites every route to `api/index.js` (the Express app). Swagger UI: `https://<backend>.vercel.app/swagger`
   (UI assets load from jsDelivr; the spec is served at `/swagger/openapi.json`).
2. **Frontend**: import repo, Root Directory `frontend`, framework Vite. Env var: `VITE_API_URL=https://<backend>.vercel.app`
   (set it before building; redeploy after changing it).

Existing customers from before auth have no owner and are hidden until assigned, e.g. `UPDATE customer SET sales_user_id = <id> WHERE sales_user_id IS NULL;`
