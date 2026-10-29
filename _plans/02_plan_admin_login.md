# Plan 02: Admin Login and Admin Dashboard

Implements `_specs/02_spec_admin_login.md` (approved).

Decisions carried into this plan: default admin `admin@admin.com` with password `123456789` (stored only as a bcrypt hash); the dashboard lists sales users only; `requireAdmin` re-queries the database on every request; admins live in `app_user` with `role = 'admin'`; the user list is not paginated.

## Step 0: Pre-implementation gate

Per `CLAUDE.md`, the branch must be committed before implementation. `_specs/02_spec_admin_login.md` and this plan are untracked.

- Create a feature branch `feature/admin-login` from `main`.
- Commit the spec and plan there, then verify `git status` is clean before touching any code.

## Step 1: Database migration

Create `backend/sql/002_admin.sql`, idempotent:

```sql
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check CHECK (role IN ('sales','admin'));

INSERT INTO app_user (name, email, password_hash, role)
VALUES ('Administrator', 'admin@admin.com', '<bcrypt hash of 123456789>', 'admin')
ON CONFLICT (lower(email)) DO NOTHING;
```

- Generate the hash once with `node -e "console.log(require('bcryptjs').hashSync('123456789', 10))"` (run in `backend/`) and paste it into the file. The plain password never appears in the SQL.
- `ON CONFLICT (lower(email))` relies on the existing unique index `app_user_email_key` from `001_auth.sql`. If Postgres rejects the expression target, use `ON CONFLICT DO NOTHING` (no target), which also matches the unique index.
- Run it locally with `psql "$DATABASE_URL" -f backend/sql/002_admin.sql`, and against the hosted database before deploying.

## Step 2: Backend data layer

New `backend/src/adminService.js` (kept separate from `customerService.js`, whose rule is that every query filters by `sales_user_id`):

- `listSalesUsers({ q })`:

  ```sql
  SELECT u.user_id, u.name, u.email, u.role, u.created_at,
         COUNT(c.customer_id)::int AS customer_count
  FROM app_user u
  LEFT JOIN customer c ON c.sales_user_id = u.user_id
  WHERE u.role = 'sales'
    AND ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)
  GROUP BY u.user_id
  ORDER BY u.created_at ASC
  ```

  `q` is wrapped as `%q%` (with `%`, `_` and `\` escaped) before binding. `::int` is needed because `pg` returns `COUNT` as a string.
- The query only counts customers; it never selects customer columns.

`backend/src/userService.js`:

- `findByEmail` already returns `role`. No change is needed there.
- `getById` already returns `role` and is reused by `requireAdmin` and `/api/auth/me`.

## Step 3: Auth middleware

Update `backend/src/auth.js`:

- Keep `requireAuth` as the shared token check.
- Add `requireSales`: runs after `requireAuth` and returns `403 { error: 'Sales access required' }` if `req.user.role !== 'sales'`.
- Add `requireAdmin`: runs after `requireAuth`. It returns `403 { error: 'Admin access required' }` if the token role is not `admin`. It then calls `users.getById(req.user.user_id)` and returns `401 { error: 'User no longer exists' }` if the row is missing or its database role is no longer `admin`.
- Both are async-safe: errors from the lookup go to `next(err)`.
- `auth.js` requiring `userService.js` must not create a circular import. `userService.js` imports only `db.js` and `bcryptjs`, so it is safe.
- Export `requireSales` and `requireAdmin`.

## Step 4: Routes

In `backend/src/app.js`:

- Import `adminService`, `requireSales` and `requireAdmin`.
- Sales login `POST /api/auth/login`: after finding the user, treat `u.role !== 'sales'` the same as a bad password, returning the identical `401 'Invalid email or password'`. Do the bcrypt compare first (or on a dummy hash) so timing does not reveal which case it was.
- New `POST /api/admin/login`: same validation and response shape, but it succeeds only when `u.role === 'admin'`. Otherwise it returns the same generic `401`.
- New `GET /api/admin/users` with `requireAdmin`: calls `adminService.listSalesUsers({ q: req.query.q })` and returns the array.
- `GET /api/auth/me` stays on `requireAuth` and works for both roles.
- Change line `app.use(['/api/customers', '/api/agent'], requireAuth)` to `app.use([...], requireAuth, requireSales)`.
- To avoid sharing code by copy and paste, factor the credential check into a helper `login(role)` used by both login routes.

## Step 5: Swagger

Update `backend/src/swagger.js`:

- Add an `Admin` tag.
- Add `AdminUserSummary` (`user_id`, `name`, `email`, `role`, `created_at`, `customer_count`).
- Document `POST /api/admin/login` (`200/400/401`, reusing `LoginInput` and `AuthResponse`) and `GET /api/admin/users` (`security: bearerAuth`, optional `q` query, `200/401/403`).
- Add `403` responses ("Sales access required") to every `/api/customers*` operation and `/api/agent`.
- Mention in the `/api/auth/login` description that it is for sales users only.

## Step 6: Frontend

- `frontend/src/api.js`:
  - Add `adminLogin(u)` (`POST /api/admin/login`) and `adminUsers(q)` (`GET /api/admin/users?q=...`).
  - The 401 exemption currently checks `path !== '/api/auth/login'`. Extend it to also exempt `/api/admin/login`, so a bad admin password shows an error instead of a logout loop.
  - A `403` on an admin route is surfaced as an error message (the existing `!res.ok` branch is enough).
- New `frontend/src/AdminLogin.jsx`: email and password only, with no register option, reusing the form classes from `Auth.jsx` and `App.css`. On success it calls `setToken`, then `onAuthed(user)`.
- `frontend/src/Auth.jsx`: add an "Admin sign in" link/button that switches to `AdminLogin`. Keep the sales behavior unchanged.
- New `frontend/src/AdminDashboard.jsx`:
  - Fetches `api.adminUsers()` on mount. It has loading, empty and error (with Retry) states.
  - Summary cards: total sales users and total customers (sum of `customer_count`).
  - Table with Name, Email, Registered (formatted date) and Customers. The default sort is customers descending. Clickable headers toggle sort on the client.
  - Search box. It filters on the client over the loaded list (the list is not paginated). The `?q=` API parameter exists for Swagger and direct use.
- `frontend/src/App.jsx`:
  - After login or `api.me()`, branch on `user.role`: `admin` renders the topbar plus `<AdminDashboard />`; `sales` renders the current Customers + Chat layout.
  - The topbar is shared (brand, user name, API docs link, Log out). Hide nothing from the sales view.
  - A `403` on admin routes shows "Access denied" with the Log out button.
- Add minimal styles for the cards and sortable table in `App.css`, using existing variables and classes where possible.

## Step 7: Docs

- Update `README.md`: the `002_admin.sql` command, the default admin email and password (with the note to replace the hash on any shared deployment), the admin endpoints, and how to test them in Swagger.
- Update `CLAUDE.md`: the auth bullet (roles `sales` and `admin`, `requireSales` / `requireAdmin`, `adminService.js`, `backend/sql/002_admin.sql`), and replace "There is only the `sales` role".

## Step 8: Verification

Run against the local server with at least two sales users (A with customers, B with none) and the seeded admin. These map to the spec's acceptance criteria.

1. Run `002_admin.sql` twice. One `admin@admin.com` row, role `admin`. Changing its hash and re-running does not overwrite it.
2. `POST /api/admin/login` with `admin@admin.com` / `123456789`: token with role `admin`. Wrong password, unknown email and a sales user's credentials: the identical `401`.
3. `POST /api/auth/login` with the admin credentials: `401`.
4. `POST /api/auth/register` with `role: "admin"`: the user is `sales`.
5. `GET /api/admin/users`: no token gives `401`, a sales token gives `403`, and the admin token returns only sales users. A's count matches the database and B shows `0`. No `password_hash` and no admin rows. `?q=` filters by name and email.
6. After A adds or deletes a customer, A's count changes by one on the next request.
7. Delete the admin row (or change its role) in a scratch database and confirm the previously issued admin token now gets `401`. Restore the row.
8. An admin token on `/api/customers*` and `/api/agent`: `403`, with no customer data returned. A sales token still works as before.
9. Swagger UI: the `Admin` tag is present. Log in as admin, Authorize, and call `/api/admin/users`.
10. Frontend, using the `run` skill: admin sign-in shows the dashboard with the cards, counts, search and sorting. Reload stays on the dashboard. A sales login still shows Customers and Chat. A bad admin password shows an error without a logout loop. A `401` returns to login. Run `npm run lint` and `npm run build` in `frontend`.

## Step 9: Commit and deploy notes

- Commit in logical chunks (migration + data layer, middleware + routes, swagger, frontend, docs).
- Before deploying: run `002_admin.sql` on the hosted database, then redeploy the backend and frontend projects. No new env vars are needed.
- Replace the default admin hash on any shared or production database.

## Risks

- A route that forgets `requireSales` would let an admin token reach customer data. Applying it once on the `app.use` line (Step 4) and testing in Step 8 item 8 covers this.
- The default password `123456789` is weak and public in the spec/README. Accepted for this lab, with the note to replace it.
- The extra database lookup in `requireAdmin` adds one query per admin request. This is acceptable at admin traffic volumes, with the pool at `max: 3`.
- The client-side route guard is only a convenience. Authorization is enforced by the backend.
