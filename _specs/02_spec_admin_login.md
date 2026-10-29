# Spec 02: Admin Login and Admin Dashboard

Status: Draft (awaiting approval; the plan goes in `_plans/` only after approval)

## 1. Background

Spec 01 added registration and login for `sales` users. Every user of the application is a sales user, and each sees only their own customers. There is no way for anyone to see who uses the application or how much each user has stored.

This feature adds an `admin` role with a login that is separate from the sales login. The admin gets a dashboard listing all users of the application and the number of customers associated with each user. A default admin account, `admin@admin.com`, exists out of the box.

## 2. Goals

- A separate admin login (own endpoint and own frontend view), distinct from the sales login.
- A default admin user `admin@admin.com` that is created by the database script.
- An admin dashboard listing all users with the number of customers each owns.
- Admin-only API endpoints, protected so a sales token cannot call them and an admin token cannot be obtained through the sales login.
- Swagger documents the admin endpoints and can be used to test them.

## 3. Non-goals

- Admin registration through the UI or API. Admin accounts are created only by the SQL script (or manually in the database).
- Admin viewing or editing individual customers, or creating, editing, disabling or deleting users. The dashboard is read-only and shows counts only.
- Admin use of the AI agent. `/api/agent` stays sales-only.
- Password reset, admin password change UI, multiple admin tiers, audit logging.

## 4. Data model

### 4.1 `app_user`

No new columns. The existing `role` column now accepts `'sales'` and `'admin'`.

- Add a `CHECK (role IN ('sales','admin'))` constraint (if not already present).
- Public registration (`POST /api/auth/register`) still forces `role = 'sales'`. It can never create an admin.

### 4.2 Default admin seed

A new SQL file `backend/sql/002_admin.sql` (run manually, like `001_auth.sql`) inserts the default admin:

| Field | Value |
|---|---|
| `name` | `Administrator` |
| `email` | `admin@admin.com` |
| `role` | `admin` |
| `password_hash` | bcrypt hash of the default password |

- The insert is idempotent: `ON CONFLICT (lower(email)) DO NOTHING`, so re-running it does not overwrite a changed password.
- The default password is `123456789` (decided). It is not stored in plain text in the SQL file, which contains only the bcrypt hash. The plain default password is stated in the README. It is a weak, well-known value, so any shared or production deployment should replace the hash manually (there is no change-password feature in this spec).
- Admin users own no customers. The `customer.sales_user_id` of every customer still points to a sales user.

## 5. Authentication

- Admin login returns the same kind of JWT as spec 01, with `role: 'admin'` in the payload. Same `JWT_SECRET` and `JWT_EXPIRES_IN`.
- Separation of the two logins:
  - `POST /api/auth/login` (sales) rejects admin accounts with the same generic `401` used for bad credentials.
  - `POST /api/admin/login` (admin) rejects sales accounts with the same generic `401`.
  - Neither response reveals which side an email belongs to.
- New middleware `requireAdmin` (in `src/auth.js`): runs `requireAuth`, then returns `403 { error: 'Admin access required' }` if `req.user.role !== 'admin'`.
- Existing `requireAuth` on `/api/customers` and `/api/agent` is extended with a role check for `sales`. An admin token on those routes returns `403`. This keeps the data layer rule from CLAUDE.md intact: admins never reach `customerService` functions that filter by `sales_user_id`.
- After the signature check, `requireAdmin` re-queries `app_user` by `user_id` (decided) and confirms the user still exists and still has the `admin` role in the database. Otherwise it returns `401`. A deleted or demoted user's token therefore stops working immediately.

## 6. API changes

### 6.1 New endpoints

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| POST | `/api/admin/login` | public | `200` `{ token, user: { user_id, name, email, role } }` | `400` missing fields, `401` invalid credentials (also for non-admin accounts) |
| GET | `/api/admin/users` | admin | `200` array of users with customer counts (see 6.2) | `401` no or invalid token, `403` not an admin |

### 6.2 `GET /api/admin/users`

Returns every **sales** user in `app_user` (`WHERE role = 'sales'`), ordered by `created_at` ascending (the sort order can also be applied on the client). Admin accounts are never returned:

```json
[
  {
    "user_id": 3,
    "name": "Asha Rao",
    "email": "asha@example.com",
    "role": "sales",
    "created_at": "2026-10-01T09:12:44.000Z",
    "customer_count": 12
  }
]
```

- `customer_count` is computed with a single query: `LEFT JOIN customer ON customer.sales_user_id = app_user.user_id` and `COUNT(customer.customer_id)`, grouped by user, so users with zero customers show `0`.
- Never returns `password_hash`.
- Optional query `?q=` to search by name or email (case-insensitive substring). There is no role filter, since only sales users are listed.
- The aggregate query lives in a new `backend/src/adminService.js`, separate from `customerService.js`. `customerService.js` keeps its rule that every query filters by `sales_user_id`, and the admin query touches `customer` only through `COUNT`, never returning customer rows.

### 6.3 Existing endpoints

- `/api/customers*` and `/api/agent`: now return `403 { error: 'Sales access required' }` for admin tokens (see section 5). Behavior for sales users is unchanged.
- `GET /api/auth/me` works for both roles and returns the current user including `role`, so the frontend can route correctly after a page reload.

## 7. Frontend

- A separate admin login view, reachable at a distinct URL or a clearly separate link from the sales login (for example `/admin` or a "Admin sign in" link on the login page). It has email and password only, and no register option.
- The sales login view, `Auth.jsx`, is unchanged apart from the link to the admin login.
- After an admin login the token is stored with the existing `api.js` mechanism, and the app renders the **Admin Dashboard** instead of the Customers and Chat views. After a sales login the behavior is unchanged. The view is chosen from `user.role` (from login or `/api/auth/me`).
- **Admin Dashboard** content:
  - Header with the admin's name and a Logout button.
  - Summary cards: total sales users, total customers (sum of `customer_count`).
  - A table of sales users with columns Name, Email, Registered (date), Customers. Default sort is by customer count descending; headers are clickable to sort.
  - A search box that filters by name or email.
  - Loading, empty and error states (an error that is not 401 shows a message and a Retry button).
- A `401` clears the token and returns to the login view, as for sales. A `403` on an admin route shows an "Access denied" message and a logout.
- `api.js` gains `api.adminLogin(email, password)` and `api.adminUsers(params)`. All HTTP still goes through `api.js`.
- The frontend route guard is a convenience only. Authorization is enforced by the backend.

## 8. Swagger / OpenAPI

Update `backend/src/swagger.js`:

- Document `POST /api/admin/login` (public) and `GET /api/admin/users` (`security: [{ bearerAuth: [] }]`) with request and response schemas and the `400/401/403` responses.
- Add an `AdminUserSummary` schema (user fields plus `customer_count`).
- Tag these operations `Admin`.
- Add `403` responses to `/api/customers*` and `/api/agent`, noting they are sales-only.
- A tester can log in as admin through Swagger, use the token with Authorize, and call `/api/admin/users`.

## 9. Environment and docs

- No new required env vars. Optionally `ADMIN_EMAIL` is not needed because the email is fixed in the SQL seed.
- Update `CLAUDE.md` (auth section: roles are now `sales` and `admin`), `backend/.env.example` if anything is added, and the README with the default admin email, the default password and the need to run `002_admin.sql`.

## 10. Open questions and assumptions

Decided:

1. **Default password:** `123456789`, stored only as a bcrypt hash in `002_admin.sql`.
2. **Admin rows in the dashboard:** not shown. Only sales users are listed.
3. **Stale tokens:** `requireAdmin` re-queries the database on every admin request.
4. **Table:** admins share `app_user` with `role = 'admin'`. The separation is at the endpoint level.

Still open:

5. **Pagination:** the user list is returned in full. Assumed acceptable for the expected number of users. Pagination can be added if the list is expected to be large.

## 11. Acceptance criteria

1. After running `002_admin.sql`, `admin@admin.com` exists with role `admin` and can log in with the default password `123456789`. Running it twice does not create a duplicate or change the password.
2. `POST /api/admin/login` with the correct admin credentials returns a token whose payload role is `admin`. A wrong password, an unknown email and a sales user's credentials all return the same `401`.
3. `POST /api/auth/login` with the admin credentials returns `401`.
4. `POST /api/auth/register` with `role: "admin"` still creates a `sales` user.
5. `GET /api/admin/users` without a token returns `401`, with a sales token returns `403`, and with an admin token returns all sales users (and no admin accounts), each with a correct `customer_count`. A user with no customers shows `0`. The response contains no `password_hash`. An admin token whose user was deleted from `app_user` returns `401`.
6. Counts match the database: after sales user A adds or deletes a customer, A's `customer_count` changes by one on the next request.
7. An admin token calling `/api/customers*` or `/api/agent` returns `403`, and no customer rows are returned.
8. The frontend admin login shows the dashboard with summary cards, the user table with customer counts, search and sort. Logging in as a sales user through the normal form still shows the Customers and Chat views.
9. A page reload keeps the admin on the dashboard, and the sales user on the customer view. A `401` returns to login.
10. Swagger lists the admin endpoints under `Admin`, and a tester can log in as admin, authorize, and call `/api/admin/users`.
