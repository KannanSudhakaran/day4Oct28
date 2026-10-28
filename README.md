# Customer Hub

- `backend/`  Express + Swagger + PostgreSQL + Anthropic agent (port 4000)
- `frontend/` React + Vite UI (port 5173)

## Run locally
```
cd backend  && npm install && cp .env.example .env   # set DATABASE_URL and ANTHROPIC_API_KEY
npm start        # http://localhost:4000/swagger
cd frontend && npm install && npm run dev            # http://localhost:5173
```
Endpoints: `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`, `POST /api/agent {message, history}`.

## Deploy to Vercel (two projects, same repo)
1. **Backend**: import repo, Root Directory `backend`. Env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`.
   `vercel.json` rewrites every route to `api/index.js` (the Express app). Swagger UI: `https://<backend>.vercel.app/swagger`
   (UI assets load from jsDelivr; the spec is served at `/swagger/openapi.json`).
2. **Frontend**: import repo, Root Directory `frontend`, framework Vite. Env var: `VITE_API_URL=https://<backend>.vercel.app`
   (set it before building; redeploy after changing it).
