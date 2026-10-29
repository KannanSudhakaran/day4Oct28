# Spec 03: Export Customers to Excel

Status: Draft (awaiting approval; the plan goes in `_plans/` only after approval)

## 1. Background

Sales users can view and manage their customers in the web app, through the REST API and through the AI agent. There is no way to take that data out of the application. This feature lets a logged-in sales user download their customers as an Excel (`.xlsx`) file.

Per spec 01, a sales user sees only their own customers. The export must follow the same rule: it contains only the customers owned by the logged-in user, and never anyone else's.

## 2. Goals

- A logged-in sales user can export their customers to an `.xlsx` file with one click in the frontend.
- The file contains only customers where `sales_user_id` equals the logged-in user's id.
- The export is available through a documented REST endpoint, usable from Swagger.
- Export respects the customer search currently applied in the list (see section 6).

## 3. Non-goals

- Export for admins. Admin tokens cannot export customers (they get `403`, as on the other customer endpoints). The admin dashboard shows counts only.
- Importing customers from Excel, CSV export, PDF export, scheduled or emailed exports.
- Exporting through the AI agent (no new agent tool).
- Multiple sheets, formulas, charts or custom column selection.
- Server-side storage of generated files. The file is generated per request and streamed back.

## 4. Data model

No database changes and no migrations.

## 5. Export file

One workbook with one sheet named `Customers`.

| Column | Source | Notes |
|---|---|---|
| Customer ID | `customer_id` | number |
| Name | `name` | text |
| Email | `email` | text, empty cell when `NULL` |
| Phone | `phone` | text (so leading zeros and `+` are preserved), empty cell when `NULL` |
| Created At | `created_at` | date-time cell, formatted `yyyy-mm-dd hh:mm` (UTC) |

- `sales_user_id` is not exported, since it is always the user's own id.
- The first row is a bold header row with frozen panes and an auto-filter. Column widths are set to fit the content.
- Rows are ordered by `customer_id` ascending, matching the list view.
- A user with no customers receives a valid workbook containing only the header row.
- **Spreadsheet formula injection:** any text cell whose value starts with `=`, `+`, `-` or `@` is written as plain text (string-typed cell, with a leading apostrophe-equivalent handling) so a customer named `=HYPERLINK(...)` cannot execute when the file is opened.
- Download file name: `customers-YYYY-MM-DD.xlsx` (server date, UTC).

## 6. API changes

### 6.1 New endpoint (protected, sales only)

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/api/customers/export` | `200` binary `.xlsx` | `401` no or invalid token, `403` admin token |

- Response headers: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="customers-YYYY-MM-DD.xlsx"`.
- Optional query `?name=` applies the same case-insensitive name search as `GET /api/customers?name=`, so the user can export just the filtered list. Without it, all of the user's customers are exported.
- The route is registered before `/api/customers/:id` so `export` is not parsed as an id.
- It sits behind the existing `requireAuth` + `requireSales` middleware on `/api/customers`.

### 6.2 Data access

- The endpoint reuses `customerService.getAll(userId)` and `customerService.searchByName(userId, name)`. No new query is added, so the `sales_user_id` filter in the data layer is what scopes the export. The user id comes from `req.user.user_id`, never from the query string or body. Any `user_id` or `sales_user_id` query parameter is ignored.
- The workbook is built in a new `backend/src/exportService.js` (rows in, `.xlsx` buffer out), keeping `app.js` thin.
- New dependency: `exceljs` (decided in section 10).
- The workbook is generated in memory and sent in a single response. This suits Vercel serverless, with no writes to the filesystem.

## 7. Frontend

- Add an **Export to Excel** button to the Customers panel header, next to the search box and the "Add customer" button.
- Clicking it calls a new `api.exportCustomers(name)` in `src/api.js`, passing the current search text if there is one. Because the endpoint needs the bearer token, the download is a `fetch` that reads the response as a blob and triggers the browser download (the token is not placed in a URL).
- The file name is taken from the `Content-Disposition` header, with `customers.xlsx` as a fallback.
- While the request runs, the button is disabled and shows "Exporting…". On failure, an inline error message is shown. A `401` follows the existing behavior and returns to login.
- The button is shown only in the sales view. The admin dashboard is unchanged.
- `api.js` `request()` currently parses JSON, so the export uses its own fetch path that still adds the token and handles `401`.

## 8. Swagger / OpenAPI

Update `backend/src/swagger.js`:

- Document `GET /api/customers/export` under the `Customers` tag, with `security: [{ bearerAuth: [] }]`, the optional `name` query parameter, a `200` response with the `.xlsx` content type (`type: string, format: binary`), and `401` and `403` responses.
- The description states that only the logged-in user's customers are exported.
- A tester can log in, Authorize, and download the file from Swagger UI.

## 9. Environment and docs

- No new environment variables.
- Update `README.md` (the export feature and endpoint) and `CLAUDE.md` (the new `exportService.js`, the route order note and the new dependency).

## 10. Decisions

1. **Search scope:** the export honours the list's current name search (filtered customers). Without a search it exports all of the user's customers.
2. **Library:** `exceljs`.
3. **Time zone:** `Created At` is written in UTC.
4. **Size:** no row limit or pagination, since this is a demo with small per-user data.

## 11. Acceptance criteria

1. As user A with several customers, clicking **Export to Excel** downloads `customers-YYYY-MM-DD.xlsx`, which opens in Excel with one `Customers` sheet and the header row `Customer ID, Name, Email, Phone, Created At`.
2. The file contains exactly A's customers, and the row count matches the customer list on screen.
3. User B's export contains none of A's customers, and A's export contains none of B's. The database is unchanged by exporting.
4. A `user_id` or `sales_user_id` parameter added to the export URL has no effect on the result.
5. A user with no customers gets a valid workbook with only the header row.
6. With a name search entered, the export contains only the matching customers of the logged-in user.
7. Phone numbers keep leading zeros and `+`. Empty email or phone shows an empty cell, not `null`.
8. A customer named `=1+1` appears in the file as the literal text `=1+1`, not as a formula result.
9. Calling the endpoint without a token returns `401`, and with an admin token returns `403`.
10. `GET /api/customers/export` is not treated as `/api/customers/:id` (no `Invalid id` error).
11. Swagger documents the endpoint and a tester can download the file after authorizing.
12. The button shows its busy state while exporting and an error message if the request fails. A `401` returns to login.
