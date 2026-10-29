# Plan 01: User Registration, Login and Per-User Customer Access

Implements `_specs/01_spec_userlogin_registration.md` (approved).

Spec assumptions carried into this plan: other users' customers return `404`; legacy customers keep a `NULL` owner and are invisible; the token is kept in localStorage; the schema change is a manual SQL file.

## Step 0: Pre-implementation gate

Per `CLAUDE.md`, the branch must be committed before implementation. `CLAUDE.md`, `_specs/` and `_plans/` are currently untracked.

- Commit them on `main`, or better, create a feature branch (e.g. `feature/user-auth`) and commit there.
- Verify `git status` is clean before touching any code.

## Step 1: Dependencies and config (backend)

- `cd backend && npm install bcryptjs jsonwebtoken`
- Add `JWT_SECRET=` and `JWT_EXPIRES_IN=8h` to `backend/.env.example`. Add `JWT_SECRET` to the local `.env`, and to the Vercel backend project env vars at deploy time.

## Step 2: Database migration

Create `backend/sql/001_auth.sql`, idempotent:

```sql
CREATE TABLE IF NOT EXISTS app_user (
  user_id       SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'sales',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_key ON app_user (lower(email));

ALTER TABLE customer ADD COLUMN IF NOT EXISTS sales_user_id INTEGER REFERENCES app_user(user_id);
CREATE INDEX IF NOT EXISTS customer_sales_user_id_idx ON customer (sales_user_id);
```

Run it manually against the local database (`psql "$DATABASE_URL" -f backend/sql/001_auth.sql`), then against the hosted database before deploying. Describe the command in the README.

## Step 3: Backend data layer

New `backend/src/userService.js`:
- `create({ name, email, password })`: hashes with bcryptjs, inserts with role `sales`, returns the user without the hash. Maps the unique-violation (`23505`) to an error with `status = 409`.
- `findByEmail(email)`: returns the row including `password_hash` (login only).
- `getById(id)`: returns the public user fields.

Update `backend/src/customerService.js`. Every function takes `userId` as its first argument and adds `AND sales_user_id = $n` (or inserts it):
- `getAll(userId)`, `getById(userId, id)`, `searchByName(userId, name)`
- `create(userId, {name,email,phone})` sets `sales_user_id = userId`. The body is destructured, so any `sales_user_id` the client sends is ignored.
- `update(userId, id, fields)` and `remove(userId, id)` include the owner in the `WHERE` clause, so a foreign id affects 0 rows and returns `null`.
- Add `sales_user_id` to `COLUMNS`.

## Step 4: Auth middleware and routes

New `backend/src/auth.js`:
- `signToken(user)` signs `{ user_id, role }` with `JWT_SECRET` and `JWT_EXPIRES_IN`. It throws a clear error if `JWT_SECRET` is missing (acceptance criterion 11).
- `requireAuth` middleware reads `Authorization: Bearer <token>`, verifies it and sets `req.user = { user_id, role }`. Otherwise it responds `401 { error }`.

In `backend/src/app.js`:
- Public: `POST /api/auth/register` and `POST /api/auth/login`.
  - Register validates the name, email format and a password of at least 8 characters, ignores any `role`, returns `201` with the public user, and gives `409` on a duplicate email.
  - Login returns the same generic `401` for an unknown email and a wrong password, otherwise `200 { token, user }`.
- Protected: `GET /api/auth/me`.
- Add `requireAuth` to all `/api/customers*` routes and `/api/agent`. Pass `req.user.user_id` into every `customers.*` call. Not-found responses stay `404 'Customer not found'`.
- Pass `req.user` to `agent.chat`.

## Step 5: AI agent scoping

Update `backend/src/agent.js`:
- `chat(message, history, user)` and `runTool(name, input, userId)`; every `customers.*` call receives `userId`.
- Tool schemas are unchanged, so the model has no way to name an owner.
- Append to `SYSTEM`: the assistant only has access to the current user's customers.

## Step 6: Swagger

Update `backend/src/swagger.js`:
- Add `components.securitySchemes.bearerAuth` (`http`, `bearer`, `JWT`) and the schemas `RegisterInput`, `LoginInput`, `User`, `AuthResponse`.
- Add a new `Auth` tag and paths `/api/auth/register`, `/api/auth/login` and `/api/auth/me`, with `201/200`, `400`, `401` and `409` responses as in the spec.
- Add `security: [{ bearerAuth: [] }]` and a `401` response to all customer and agent operations. Update the descriptions to say results are scoped to the logged-in user, and keep `404` on the id routes.
- Add `sales_user_id` to the `Customer` schema.
- In `swaggerHtml` in `app.js`, add `persistAuthorization: true` to `SwaggerUIBundle` so the Authorize token survives refreshes.

## Step 7: Frontend

- `frontend/src/api.js`: token helpers (`getToken/setToken/clearToken` in localStorage, wrapped in try/catch), and `request()` adds the `Authorization` header. A `401` clears the token and fires an `onUnauthorized` callback. Add `register`, `login` and `me`.
- New `frontend/src/Auth.jsx`: a combined login and register form that reuses existing form and button classes from `App.css`.
- `frontend/src/App.jsx`: hold `user` state. On load, if a token exists, call `api.me()`. If there is no user, render `<Auth>`; otherwise render the current layout. Add the user's name and a Logout button to the topbar.
- `Customers.jsx`, `CustomerForm.jsx` and `Chat.jsx` need no logic changes, since the backend scopes the data.

## Step 8: Docs

- Update `README.md`: the new env vars, the migration command, the auth endpoints and how to test them in Swagger.
- Update `CLAUDE.md` architecture notes: the auth middleware, owner-scoped `customerService` signatures, `userService.js`, and the `backend/sql/` migration.

## Step 9: Verification

Run these against the local server with two registered users, A and B (curl or Swagger UI). They map to the spec's acceptance criteria.

1. Register A: `201`, role `sales`, no hash. Register again with the same email: `409`. Register with `role:"admin"`: the result is `sales`.
2. Login with a wrong password and with an unknown email: the same `401`. Correct login returns a token.
3. Call `/api/customers` and `/api/agent` without a token: `401`.
4. A creates customers. B's list is empty. A's list shows them.
5. B calls GET, PUT and DELETE on A's customer id: `404`. Confirm in the database that the row is unchanged.
6. Send `sales_user_id` in a POST or PUT body: ignored.
7. Agent as B: "list all customers" returns only B's. Asking it to update or delete A's customer by id gives "not found" and the data is unchanged.
8. Swagger UI: the Authorize button works and the customer CRUD calls succeed when authorized.
9. Frontend, using the `run` skill: register, log in, create, edit and delete a customer, chat, log out, and confirm a `401` returns to the login view. Run `npm run lint` and `npm run build` in `frontend`.
10. Start the backend without `JWT_SECRET` and confirm the clear error.

## Step 10: Commit and deploy notes

- Commit in logical chunks (migration + data layer, routes + agent, swagger, frontend, docs).
- Before deploying: run the SQL on the hosted database, set `JWT_SECRET` in the Vercel backend project, and redeploy both projects.
- Existing customers will not be visible to anyone until assigned. The assignment is a one-off manual SQL, e.g. `UPDATE customer SET sales_user_id = <id> WHERE sales_user_id IS NULL;`.

## Risks

- A missed `userId` filter in any query would leak data. The data-layer signatures make the argument mandatory, and Step 9 covers each operation.
- localStorage is exposed to XSS. This is accepted in the spec and kept in mind for the frontend.
- `rejectUnauthorized: false` in `db.js` is unchanged and out of scope.
