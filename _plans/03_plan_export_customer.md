# Plan 03: Export Customers to Excel

Implements `_specs/03_spec_export_customer.md` (approved).

Decisions carried into this plan: the export follows the current name search (all customers when empty); library `exceljs`; `Created At` in UTC; no row limit; sales-only (admin tokens get `403`); no database changes.

## Step 0: Pre-implementation gate

Per `CLAUDE.md`, the branch must be committed before implementation. `_specs/03_spec_export_customer.md` and this plan are untracked.

- Create a feature branch `feature/export-customers` from `main`.
- Commit the spec and plan there, then verify `git status` is clean before touching any code.

## Step 1: Dependency (backend)

- `cd backend && npm install exceljs`
- No env vars and no SQL.

## Step 2: Export service

New `backend/src/exportService.js` (rows in, `.xlsx` buffer out, no database access):

- `buildCustomersWorkbook(rows)` returns a `Buffer` from `ExcelJS.Workbook`:
  - One worksheet named `Customers`, columns `Customer ID` (number), `Name`, `Email`, `Phone`, `Created At`, with widths set to fit (header length vs. longest value, capped at about 40).
  - Header row bold, `views: [{ state: 'frozen', ySplit: 1 }]`, and `autoFilter` over the header range.
  - `Created At`: a JS `Date` cell with `numFmt = 'yyyy-mm-dd hh:mm'`. Excel stores dates without a zone, and `Date` values are written as their UTC components, which gives the UTC display the spec requires.
  - `Phone` is always written as a string with `numFmt = '@'` (text), so leading zeros and `+` survive.
  - `NULL` email or phone leaves the cell empty (`null`), not the text "null".
  - Formula-injection guard `safeText(v)`: for `Name`, `Email` and `Phone`, if the value is a string beginning with `=`, `+`, `-` or `@`, write it as a plain string cell (`{ richText: [{ text: v }] }`, which exceljs always stores as a string and never as a formula), and set the cell `numFmt = '@'`. Verify in Step 6 that `=1+1` reads back as text and not as a formula.
- `exportFileName(date = new Date())` returns `customers-YYYY-MM-DD.xlsx` from `date.toISOString().slice(0, 10)` (UTC).
- Rows arrive already ordered by `customer_id` from `customerService`; confirm in Step 3 and sort in the service function if the query does not guarantee it.

## Step 3: Route

In `backend/src/app.js`:

- `require('./exportService')`.
- Add `GET /api/customers/export` **before** `app.get('/api/customers/:id', ...)`, so `export` is not parsed as an id (acceptance criterion 10). It sits under the existing `app.use(['/api/customers', '/api/agent'], requireAuth, requireSales)` line, so it is protected and sales-only automatically.
- Handler:

  ```js
  app.get('/api/customers/export', wrap(async (req, res) => {
    const uid = req.user.user_id;                       // from the token only
    const rows = req.query.name ? await customers.searchByName(uid, String(req.query.name))
                                : await customers.getAll(uid);
    const buf = await exportService.buildCustomersWorkbook(rows);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportService.exportFileName()}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.send(buf);
  }));
  ```

- No new SQL: scoping comes from the existing `userId` filter in `customerService`. `user_id` / `sales_user_id` query parameters are never read (criterion 4).
- `Access-Control-Expose-Headers` is required because the frontend is on a different origin and otherwise cannot read the file name from `Content-Disposition`.
- Check `customerService.getAll` and `searchByName` order by `customer_id`. If they do not, add `ORDER BY customer_id` there (this keeps the `sales_user_id` filter untouched).

## Step 4: Swagger

Update `backend/src/swagger.js`:

- Add `/api/customers/export` under the `Customers` tag: `security: [{ bearerAuth: [] }]`, summary "Export my customers to Excel", a description saying only the logged-in user's customers are exported, and the optional `name` query parameter.
- Responses: `200` with content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and schema `{ type: 'string', format: 'binary' }`, `401: unauthorized`, `403: forbiddenSales`.
- Place the path before `/api/customers/{id}` for readability.

## Step 5: Frontend

- `frontend/src/api.js`: add `exportCustomers(name)`, which does not go through `request()` (that function parses JSON):
  - `fetch(`${BASE}/api/customers/export${name ? `?name=${encodeURIComponent(name)}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })`.
  - On `401`, run the same `clearToken(); onUnauthorized();` handling as `request()`.
  - On a non-OK response, read `{ error }` JSON if present and throw `new Error(...)`.
  - On success, return `{ blob, filename }`, where the file name is parsed from `Content-Disposition` (`/filename="?([^"]+)"?/`) with `customers.xlsx` as the fallback.
- `frontend/src/Customers.jsx`:
  - Add `exporting` state and an `exportExcel` handler: call `api.exportCustomers(query.trim())`, create an object URL, click a temporary `<a download>`, then revoke the URL. Errors go to the existing `error` state.
  - Add an **Export to Excel** button (`btn ghost`) in the `toolbar`, between the search box and "Add customer". It is disabled while `exporting` and shows "Exporting…".
- The admin dashboard and its code are untouched.
- **Search behavior to note:** the list's search box filters client-side on name, email and phone, but the export endpoint's `?name=` matches the name only (spec section 6.1). A query that matches only an email or phone would show rows on screen that the export leaves out. This follows the approved spec as written; see Risks.

## Step 6: Docs

- `README.md`: add the export endpoint and the Export button.
- `CLAUDE.md`: add `src/exportService.js` (workbook builder; no DB access), note that `/api/customers/export` must stay above `/:id`, and mention the `exceljs` dependency.

## Step 7: Verification

Run on a spare port (for example 4100) so any running dev server is not disturbed, with two sales users A (several customers) and B (a different set), plus the seeded admin. Remove test users and customers afterwards.

1. A: `GET /api/customers/export` returns `200`, the correct content type and `Content-Disposition: attachment; filename="customers-YYYY-MM-DD.xlsx"`.
2. Read the file back with `exceljs` in a Node script: one sheet `Customers`, header `Customer ID, Name, Email, Phone, Created At`, row count equals A's `GET /api/customers` count, ids ascending, and every row's id belongs to A.
3. B's export contains none of A's ids, and A's none of B's.
4. `?user_id=<B>` and `?sales_user_id=<B>` on A's request change nothing.
5. A user with no customers: a valid workbook with only the header row.
6. `?name=` returns only matching customers of the logged-in user.
7. Create customers with phone `0012345`, `+91 98765` and an empty email. Confirm the phone is stored as text with leading zeros and `+` intact, and empty email is an empty cell.
8. Create a customer named `=1+1`. In the read-back, the cell is a string `=1+1`, not a formula (`cell.type !== ExcelJS.ValueType.Formula`).
9. No token gives `401`, an admin token gives `403`, and `/api/customers/export` is not answered with `Invalid id`.
10. `Created At` is a date cell with the expected UTC value.
11. Swagger: the endpoint is listed and the download works after Authorize.
12. Frontend, using the `run` skill: log in as a sales user, click **Export to Excel** with and without a search, and confirm the file downloads with the right name and the busy state shows. Force a failure (stop the backend) and confirm the inline error. Run `npm run lint` and `npm run build` in `frontend`.

## Step 8: Commit and merge

- Commit in logical chunks (dependency + service + route + swagger, frontend, docs).
- Before deploying: nothing to run on the database and no new env vars. Redeploy both Vercel projects. Check that the `exceljs` bundle fits the serverless function size limit after the first deploy.
- Merge to `main`, push, and delete the feature branch only when you ask for it.

## Risks

- **Search mismatch:** the on-screen search covers name, email and phone, but `?name=` covers name only, so the export can contain fewer rows than the list for email/phone searches. The spec asks for the name search, so I follow it. Fixing it later would mean either an additional `q` parameter on the export route that matches the three fields, or filtering in the browser, and either is a small change.
- **Cross-user leakage:** the export adds no query of its own and reads the user id only from the token, which is covered by Step 7 items 3 and 4.
- **Spreadsheet formula injection:** covered by `safeText` and checked in item 8.
- **Serverless bundle size:** `exceljs` is a large dependency. If the Vercel function exceeds its size limit, the fallback is a lighter writer for `.xlsx`, which would need a spec update.
- **Memory:** the workbook is built fully in memory. This is acceptable for the demo-sized data decided in the spec.
