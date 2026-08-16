# API contract

Captured from the live ASP.NET server on 2026-08-16 by creating a throwaway
budget, exercising every endpoint, and recording the responses — not inferred
from the model classes, which get several details wrong.

Android releases going back years speak this protocol and cannot be updated in
lockstep, so the Node replacement has to match it. Anything marked **must**
below is read by a shipped client.

## Serialization

- **PascalCase keys.** `Id`, `BudgetId`, `IsDeleted`. A framework defaulting to
  camelCase returns 200s while every client silently reads nulls.
- Routes are **case-insensitive**: Android calls `/api/budget`, `/api/expense`,
  `/api/categories`; the web calls `/api/Budget`, `/api/Expense`.
- `Amount` is a JSON number (`100.0`, `12.34`).
- `IsDeleted` / `IsSystem` are `bool`, never null, on the wire.

### Timestamps

| Field | Format | Example |
| --- | --- | --- |
| `Date` | ISO, midnight, `Z` | `2026-08-14T00:00:00Z` |
| `DateCreated` / `DateUpdated` | ISO, `Z`, trailing zeros trimmed | `2026-08-16T14:18:22.49Z` |
| `X-Watermark` header | ISO, fixed 7 fractional digits | `2026-08-16T14:18:52.2778042Z` |

Two quirks worth knowing:

- **Fractional precision differs by endpoint.** `POST` echoes the in-memory
  .NET value (7 digits: `…22.0836253Z`); a later `GET` returns what SQL Server
  stored in a `datetime` (3ms: `…22.083Z`). No client depends on this, so the
  replacement can be uniform — but do not be surprised by the fixtures.
- Android parses `Date` with a **lenient** `SimpleDateFormat("yyyy-MM-dd")`,
  which succeeds by reading the leading `2026-08-14` and ignoring the rest.
  Emitting a bare `2026-08-14` would also parse. Emitting a *local* time
  without `Z` would shift the day for anyone west of Greenwich.
- The web client does `new Date(data.Date)` then adds `getTimezoneOffset()`,
  which only lands on the right day because the value is UTC midnight.

### Nested navigation properties

The change feeds and `/Week/` embed the **entire Budget object inside every
expense** (`"Budget": { … }`), because EF serialises the loaded navigation
property. `POST /api/expense` returns `"Budget": null` for the same field.

No client reads `Budget` or `Category`. The replacement should emit `null` (or
omit them), which shrinks a week's payload substantially.

## Endpoints

| Method | Path | Status | Body |
| --- | --- | --- | --- |
| POST | `/api/budget` | 201 | Budget |
| GET | `/api/budget/{id}` | 200 / **404** | Budget |
| PUT | `/api/budget/{id}` | **204** | **empty — must be** |
| DELETE | `/api/budget/{id}` | 200 | Budget *(see bug below)* |
| GET | `/api/budget/{id}/Expenses?watermark=` | 200 | Expense[] + `X-Watermark` |
| GET | `/api/budget/{id}/Categories?watermark=` | 200 | Category[] + `X-Watermark` |
| GET | `/api/budget/{id}/Week/{unixMillis}` | 200 | Expense[] |
| POST | `/api/expense` | 201 | Expense |
| PUT | `/api/expense/{id}` | **204** | **empty — must be** |
| DELETE | `/api/expense/{id}` | 200 | Expense |
| POST | `/api/categories` | 201 | Category |
| PUT | `/api/categories/{id}` | **204** | **empty — must be** |
| DELETE | `/api/categories/{id}` | 200 | Category |

`PUT` returning empty is load-bearing: `API.EditBudget` and `API.EditExpense`
throw on any non-empty body.

`GET /api/budget/{id}` returning **404** for an unknown id is how the app
decides a budget is gone; a 200 with null would break joining.

### Change feeds

Window is `(watermark, now]`, where `now` is captured **before** the query and
returned in `X-Watermark`. Rows are compared with `DateUpdated`. An
unparseable or empty watermark means "everything".

The client stores one watermark for both feeds and takes the **earlier** of
the two, comparing them as strings — which is only valid because the format is
fixed width. Do not switch to a variable-width format.

### Soft deletes

`DELETE` on an expense or category sets `IsDeleted = true`, bumps
`DateUpdated`, and returns the row. It does not remove it — that is what lets
the change feed tell other devices about the deletion.

## Known bug to fix in the rewrite

`DELETE /api/budget/{id}` attempts a hard delete with no cascade, so it
returns **500** whenever the budget has any expense or category. It only ever
worked on empty budgets. The replacement should delete the children first, or
soft-delete the budget.
