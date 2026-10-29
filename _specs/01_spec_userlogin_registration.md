# Spec 01: User Registration, Login and Per-User Customer Access

Status: Draft (awaiting approval; the plan goes in `_plans/` only after approval)

## 1. Background

The initial Customer Hub has no authentication. Every caller can list, create, update and delete every customer through the REST API, the Swagger UI, the React frontend and the AI agent.

This feature adds user registration and login. Each customer is owned by one sales user, and every operation (REST and AI agent) is limited to the logged-in user's own customers.

## 2. Goals

- A new user can register. Their role is `sales` by default.
- A registered user can log in and receive a token.
- Each customer is associated with exactly one sales user.
- A logged-in user can see and manage (CRUD) only their own customers.
- The AI agent only reads or changes the logged-in user's customers.
- Any attempt to access or modify another user's customer is denied.
- Swagger documents the auth endpoints and the per-user access rules, and can be used to test them.

## 3. Non-goals

- Admin or manager roles, and sharing or reassigning customers between users. Only the default `sales` role exists.
- Password reset, email verification, refresh tokens, social login.
- Multi-tenant or organization concepts.

## 4. Data model

### 4.1 New table `app_user`

| Column | Type | Notes |
|---|---|---|
| `user_id` | serial, PK | |
| `name` | text, not null | |
| `email` | text, not null, unique (case-insensitive) | Used as the login identifier |
| `password_hash` | text, not null | bcrypt hash; the plain password is never stored or returned |
| `role` | text, not null, default `'sales'` | Only `sales` is accepted at registration |
| `created_at` | timestamptz, default now() | |

### 4.2 Change to `customer`

- Add `sales_user_id integer` with a foreign key to `app_user(user_id)`.
- New customers always get `sales_user_id` from the authenticated user. Clients cannot set it (any such field in a request body is ignored).
- Existing rows: a migration script (SQL file committed to the repo) adds the column as nullable. Legacy customers with `NULL` owner are invisible to every user until reassigned manually. After backfill the column may be made `NOT NULL`. This is an open question (see section 10).
- The `customer` response shape is unchanged. `sales_user_id` may be included in responses for transparency.

There is no migration tooling today, so the SQL is provided as a file (for example `backend/sql/001_auth.sql`) and run manually against the database.

## 5. Authentication

- Registration stores a bcrypt hash of the password.
- Login verifies the credentials and returns a signed JWT (`Authorization: Bearer <token>`). The token contains `user_id` and `role` and expires after a configurable period (default 8h).
- New env vars: `JWT_SECRET` (required; the server must fail clearly on startup or first auth use if it is missing) and optional `JWT_EXPIRES_IN`.
- An auth middleware validates the token on protected routes and sets `req.user = { user_id, role }`.
- Stateless: no server-side sessions, which suits Vercel serverless.

## 6. API changes

### 6.1 New endpoints (public)

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | `201` `{ user_id, name, email, role }` | `400` validation, `409` email already registered |
| POST | `/api/auth/login` | `{ email, password }` | `200` `{ token, user: { user_id, name, email, role } }` | `400` missing fields, `401` invalid credentials |

Validation: `name` non-empty; `email` valid format; `password` at least 8 characters. A client-supplied `role` is ignored, and the role is always `sales`. Login returns the same generic `401` message for an unknown email and a wrong password.

### 6.2 New endpoint (protected)

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/api/auth/me` | `200` current user | `401` |

### 6.3 Existing customer endpoints (now protected)

All of `GET/POST /api/customers` and `GET/PUT/DELETE /api/customers/:id`, plus `POST /api/agent`, require a valid bearer token. Without one, they return `401 { error }`.

| Endpoint | Behavior for the logged-in user |
|---|---|
| `GET /api/customers` | Returns only the user's customers. The `?name=` search is also scoped to them. |
| `GET /api/customers/:id` | Returns the customer if owned; otherwise denied. |
| `POST /api/customers` | Creates the customer owned by the user. |
| `PUT /api/customers/:id` | Updates only if owned; otherwise denied. |
| `DELETE /api/customers/:id` | Deletes only if owned; otherwise denied. |

**Denial rule:** a customer that exists but belongs to someone else returns `404 { error: 'Customer not found' }`, the same response as a nonexistent id, so ids cannot be probed. (Alternative: `403`. See section 10.)

Enforcement must happen in the data layer: every query in `customerService.js` takes the `userId` and filters with `AND sales_user_id = $n`. Ownership is never checked in the route handler or the client alone.

## 7. AI agent

- `POST /api/agent` requires authentication. The `userId` comes from the token, not from the request body or the model.
- `runTool` passes `req.user.user_id` to every `customerService` call, so all six tools (`get_all_customers`, `get_customer_by_name`, `get_customer_by_id`, `add_customer`, `update_customer`, `delete_customer`) are scoped to the user.
- Tool input schemas do not gain an owner field, so the model cannot select another user. A tool call for another user's id returns `{ error: 'Not found' }`, exactly as for a missing record.
- The system prompt says the assistant only has access to the current user's customers.
- `chat(message, history, user)` gets the user as a parameter. `dataChanged` behavior is unchanged.

## 8. Frontend

- New Login and Register views. After login the token is stored client-side (localStorage) and sent by `api.js` as `Authorization: Bearer ...` on every request.
- Unauthenticated users see only the login and register forms. A `401` response clears the token and returns to login.
- Show the signed-in user's name and a Logout button.
- The Customers list, form and Chat are unchanged otherwise, and they show only the user's data.

## 9. Swagger / OpenAPI

Update `backend/src/swagger.js`:

- Add a `bearerAuth` security scheme (`http`, `bearer`, `JWT`) under `components.securitySchemes`.
- Document `/api/auth/register`, `/api/auth/login` and `/api/auth/me` with request and response schemas, and the `400/401/409` responses.
- Mark all `/api/customers*` and `/api/agent` operations with `security: [{ bearerAuth: [] }]` and add `401` (and `404` where ownership applies) responses. Descriptions state that results are scoped to the logged-in user.
- The Swagger UI page (`app.js` `swaggerHtml`) must enable the Authorize button flow: the user calls `/api/auth/login`, pastes the token into Authorize, and then can call customer endpoints from the UI. Consider `persistAuthorization: true`.

## 10. Open questions and assumptions

1. **Denial status:** the spec assumes `404` for another user's customer to avoid leaking existence. Use `403` instead if the explicit "denied" message is preferred.
2. **Legacy customers:** the spec assumes existing rows get `NULL` owner and become invisible until assigned. Alternatively the migration could assign them all to a seed user.
3. **Token storage:** localStorage is simple, but it is exposed to XSS. An httpOnly cookie would need CORS and credentials changes across the two Vercel domains.
4. **New dependencies:** `bcryptjs` (pure JS, safe on serverless) and `jsonwebtoken`.

## 11. Acceptance criteria

1. Registering with valid data returns `201`, role `sales`, and no password or hash in the response. A duplicate email returns `409`.
2. Registering with `role: "admin"` still yields `sales`.
3. Login with correct credentials returns a token. Wrong password and unknown email both return the same `401`.
4. Every `/api/customers*` and `/api/agent` call without a valid token returns `401`.
5. User A creates customers. `GET /api/customers` as user B does not include them. A's customers appear only for A.
6. User B calling GET, PUT or DELETE on A's customer id receives the denial response, and the customer is unchanged in the database.
7. A `sales_user_id` in a POST or PUT body is ignored.
8. Asking the agent "list all customers" as B returns only B's customers. Asking it to read, update or delete one of A's customers by id fails with "not found", and the data is unchanged.
9. The Swagger UI shows the auth endpoints and the Authorize button. A tester can register, log in, authorize with the token, and exercise customer CRUD scoped to that user.
10. The frontend supports register, login, logout and a per-user customer view, and returns to login on `401`.
11. Missing `JWT_SECRET` produces a clear error rather than insecure behavior.
