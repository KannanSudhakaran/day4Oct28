# Customer Hub

- `backend/`  Express + Swagger + PostgreSQL + Anthropic agent (port 4000)
- `frontend/` React + Vite UI (port 5173)

## Run
```
cd backend  && npm install && cp .env.example .env   # set DATABASE_URL and ANTHROPIC_API_KEY
npm start        # http://localhost:4000/swagger
cd frontend && npm install && npm run dev            # http://localhost:5173
```
Endpoints: `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`, `POST /api/agent {message, history}`.
