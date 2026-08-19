/**
 * Wire formats.
 *
 * Every shape here is pinned by ../../CONTRACT.md, which was captured from the
 * running ASP.NET server rather than inferred. Android releases going back
 * years read these payloads and cannot be updated in step, so this file is the
 * one place where "what looks tidy" loses to "what the old server emitted".
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
              'Thursday', 'Friday', 'Saturday'] as const;

/** A row as it comes out of Postgres, before it is shaped for the wire. */
export interface BudgetRow {
  UniqueId: string; Name: string; StartDay: number; Amount: number;
  DateCreated: string | null; DateUpdated: string | null;
}

export interface ExpenseRow {
  Id: number; Date: string | null; Description: string; Amount: number;
  BudgetId: string; CategoryId: number | null;
  DateCreated: string | null; DateUpdated: string | null;
  IsDeleted: boolean; IsSystem: boolean;
}

export interface CategoryRow {
  Id: number; Name: string; BudgetId: string;
  DateCreated: string | null; DateUpdated: string | null;
  IsDeleted: boolean; OriginalId?: number | null;
}

export interface InviteRow {
  Token: string; BudgetId: string; CreatedAt: string | null; ExpiresAt: string | null;
  MaxUses: number; Uses: number; LastUsedAt: string | null; RevokedAt: string | null;
}

/** Anything the clients might send: PascalCase, camelCase, or absent. */
export type Body = Record<string, unknown>;

/** Postgres hands back `2026-08-14`; the wire carries UTC midnight. */
export function dateOnly(value: string | null): string | null {
  if (value == null) return null;
  return `${value}T00:00:00Z`;
}

/**
 * `2026-08-16 14:18:22.49+00` -> `2026-08-16T14:18:22.49Z`.
 *
 * Json.NET trimmed trailing zeros from the fraction and dropped the point
 * entirely when there was none, so `.490` was emitted as `.49`. Nothing reads
 * these, but matching keeps a diff against the old server clean.
 */
export function timestamp(value: string | null): string | null {
  if (value == null) return null;
  const [datePart, rest] = String(value).split(' ');
  if (!rest || datePart === undefined) return String(value);

  const clock: string = (rest ?? '').replace(/([+-]\d{2}(:\d{2})?|Z)$/, '');
  let [hms, fraction = ''] = clock.split('.') as [string, string?];
  fraction = fraction ?? '';
  fraction = fraction.replace(/0+$/, '');
  return `${datePart}T${hms}${fraction ? '.' + fraction : ''}Z`;
}

/**
 * The X-Watermark header: always seven fractional digits.
 *
 * The client stores one watermark for two feeds and picks the earlier by
 * comparing them as strings, which is only sound while every value is the same
 * width. Postgres gives microseconds, so the last digit is padded.
 */
export function watermark(value: string): string {
  const [datePart = '', rest = ''] = String(value).split(' ');
  const clock: string = (rest ?? '').replace(/([+-]\d{2}(:\d{2})?|Z)$/, '');
  const [hms, fraction = ''] = clock.split('.');
  return `${datePart}T${hms}.${(fraction ?? '').padEnd(7, '0').slice(0, 7)}Z`;
}

export function budget(row: BudgetRow | undefined): unknown {
  if (!row) return null;
  return {
    UniqueId: row.UniqueId,
    Name: row.Name,
    StartDay: row.StartDay,
    Amount: row.Amount,
    DateCreated: timestamp(row.DateCreated),
    DateUpdated: timestamp(row.DateUpdated),
    // Computed on the C# model and present in every payload. The web app's
    // budget form binds its weekday dropdown to this string, not to StartDay.
    StartDayOfWeek: DAYS[row.StartDay] ?? 'Sunday',
  };
}

export function expense(row: ExpenseRow | undefined): unknown {
  if (!row) return null;
  return {
    // The old server serialised EF's navigation properties, embedding a whole
    // Budget object inside every expense in the change feeds. No client reads
    // it, so it stays null here and a week's payload gets much smaller.
    Budget: null,
    Category: null,
    Id: row.Id,
    Date: dateOnly(row.Date),
    Description: row.Description,
    Amount: row.Amount,
    BudgetId: row.BudgetId,
    CategoryId: row.CategoryId,
    DateCreated: timestamp(row.DateCreated),
    DateUpdated: timestamp(row.DateUpdated),
    IsDeleted: row.IsDeleted,
    IsSystem: row.IsSystem,
  };
}

export function category(row: CategoryRow | undefined): unknown {
  if (!row) return null;
  return {
    Budget: null,
    Id: row.Id,
    Name: row.Name,
    BudgetId: row.BudgetId,
    DateCreated: timestamp(row.DateCreated),
    DateUpdated: timestamp(row.DateUpdated),
    IsDeleted: row.IsDeleted,
  };
}

/**
 * An invite, with the link already built.
 *
 * PascalCase like everything else here. Nothing legacy reads this — invites did
 * not exist on the old server — but a payload that follows a different
 * convention to its neighbours is a trap for whoever writes the next client.
 *
 * The URL is assembled here rather than in each client so that the path lives in
 * one place: it also has to match an intent filter on Android, an associated
 * domain on iOS, and a route on the web, and four copies of "/join/" would
 * eventually disagree.
 */
export function invite(row: InviteRow | undefined, origin: string): unknown {
  if (!row) return null;
  return {
    Token: row.Token,
    BudgetId: row.BudgetId,
    Url: `${origin}/join/${row.Token}`,
    CreatedAt: timestamp(row.CreatedAt),
    ExpiresAt: timestamp(row.ExpiresAt),
    MaxUses: row.MaxUses,
    Uses: row.Uses,
  };
}

/**
 * Accepts a body whatever case the caller used.
 *
 * The Android client sends PascalCase and the web app's Knockout view models
 * send camelCase to the same endpoints — `ko.toJSON({ budgetId: ... })`
 * against `POST /api/Expense`. ASP.NET bound both; this keeps that working.
 */
export function field(body: Body | null | undefined, name: string): unknown {
  if (body == null) return undefined;
  if (name in body) return body[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(body)) {
    if (key.toLowerCase() === lower) return body[key];
  }
  return undefined;
}

export function startDayFrom(body: Body): number {
  const named = field(body, 'StartDayOfWeek');
  if (typeof named === 'string') {
    const index = DAYS.findIndex((d) => d.toLowerCase() === named.toLowerCase());
    if (index >= 0) return index;
  }
  const numeric = field(body, 'StartDay');
  return Number.isFinite(Number(numeric)) ? Number(numeric) : 0;
}
