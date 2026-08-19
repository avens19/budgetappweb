import { randomBytes } from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { query, transaction } from '../db.js';
import type { PoolClient } from 'pg';
import * as wire from '../serialize.js';
import { redeem } from '../invites.js';

export const api = express.Router();

/** A path parameter of a matched route is always present. */
const param = (req: Request, name: string): string => String(req.params[name]);

/**
 * 16 random bytes, base64url, 22 characters.
 *
 * `randomBytes` and not `Math.random`: this is the credential standing in for
 * access to someone's budget, and a predictable one would let a stranger walk
 * in. 128 bits is far past guessable, and short enough to read out loud.
 */
function inviteToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * The origin to build invite links against.
 *
 * Behind Caddy the request arrives as plain HTTP on a container port, so
 * `req.protocol` and the listening port are both wrong for a public URL. The
 * proxy's forwarded headers are the only truthful source, and the configured
 * value wins over both so a link can never come out pointing at localhost.
 */
function publicOrigin(req: Request): string {
  const configured = process.env.BUDGETAPP_PUBLIC_ORIGIN;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https')
    .split(',')[0]!.trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '')
    .split(',')[0]!.trim();
  return `${proto}://${host}`;
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncRoute = (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => { void fn(req, res, next).catch(next); };

/* ------------------------------------------------------------------ budgets */

api.post('/budget', asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const uniqueId = wire.field(b, 'UniqueId');
  if (!uniqueId) return res.status(400).json({ Message: 'UniqueId is required' });

  const created = await query(
    `insert into "Budgets" ("UniqueId","Name","StartDay","Amount","DateCreated","DateUpdated")
     values ($1,$2,$3,$4, now(), now())
     returning *`,
    [uniqueId, wire.field(b, 'Name') ?? 'My', wire.startDayFrom(b),
     Number(wire.field(b, 'Amount') ?? 0)]
  ).catch((err: { code?: string }) => {
    // 23505 unique_violation: the old server answered 409 here.
    if (err.code === '23505') return null;
    throw err;
  });

  if (created == null) return res.sendStatus(409);
  res.status(201).json(wire.budget(created.rows[0] as never));
}));

api.get('/budget/:id', asyncRoute(async (req, res) => {
  const { rows } = await query('select * from "Budgets" where "UniqueId" = $1', [req.params.id]);
  // A 404 is load-bearing: it is how the app decides a budget is gone, and
  // how joining an unknown id fails cleanly.
  if (!rows.length) return res.sendStatus(404);
  res.json(wire.budget(rows[0] as never));
}));

api.put('/budget/:id', asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const bodyId = wire.field(b, 'UniqueId');
  if (bodyId && bodyId !== req.params.id) return res.sendStatus(400);

  const { rowCount } = await query(
    `update "Budgets"
        set "Name" = $2, "StartDay" = $3, "Amount" = $4, "DateUpdated" = now()
      where "UniqueId" = $1`,
    [req.params.id, wire.field(b, 'Name') ?? 'My', wire.startDayFrom(b),
     Number(wire.field(b, 'Amount') ?? 0)]
  );
  if (!rowCount) return res.sendStatus(404);
  // Must be an empty body: API.EditBudget throws on anything else.
  res.sendStatus(204);
}));

api.delete('/budget/:id', asyncRoute(async (req, res) => {
  // The old endpoint returned 500 for any budget with children, because it
  // issued a hard delete against a schema with no cascade. The schema now
  // cascades, so this does what it always claimed to.
  const { rows } = await query(
    'delete from "Budgets" where "UniqueId" = $1 returning *', [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json(wire.budget(rows[0] as never));
}));

/* ------------------------------------------------------------- change feeds */

/**
 * Everything changed in `(watermark, now]`.
 *
 * now() is fixed at transaction start, so the bound used to select rows and
 * the watermark returned to the client are the same instant by construction —
 * nothing can be written into the gap between the query and the header.
 */
function changeFeed(table: string, serialize: (row: any) => unknown): RequestHandler {
  return asyncRoute(async (req, res) => {
    const since = parseWatermark(req.query.watermark);

    const { rows, mark } = await transaction(async (client: PoolClient) => {
      const { rows: [first] } = await client.query<{ now: string }>('select now() as now');
      const now = first!.now;
      const { rows } = await client.query(
        `select * from "${table}"
          where "BudgetId" = $1 and "DateUpdated" > $2 and "DateUpdated" <= $3
          order by "DateUpdated"`,
        [req.params.id, since, now]);
      return { rows, mark: now };
    });

    res.set('X-Watermark', wire.watermark(mark));
    res.json(rows.map(serialize));
  });
}

/** Missing, empty or unparseable means "everything", as it always did. */
function parseWatermark(value: unknown): string {
  if (!value || typeof value !== 'string') return new Date(0).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

api.get('/budget/:id/Expenses', changeFeed('Expenses', wire.expense));
api.get('/budget/:id/Categories', changeFeed('Categories', wire.category));

/**
 * The week containing a moment, as unix milliseconds.
 *
 * The original converted the value by adding ticks to a bare 1970-01-01, i.e.
 * treating it as UTC, then truncating to a date. Reproduced exactly: the web
 * client sends local midnight, so east of Greenwich this can land on the
 * previous day and show the wrong week. That is a real bug, and fixing it
 * needs a client change to send a date rather than an instant, so it is not
 * quietly altered here.
 */
api.get('/budget/:id/Week/:millis', asyncRoute(async (req, res) => {
  const millis = Number(req.params.millis);
  if (!Number.isFinite(millis)) return res.sendStatus(400);

  const { rows: budgets } = await query(
    'select "StartDay" from "Budgets" where "UniqueId" = $1', [req.params.id]);
  // The original returned null here, which ASP.NET rendered as 204.
  if (!budgets.length) return res.sendStatus(204);

  const asked = new Date(millis);
  const start = new Date(Date.UTC(asked.getUTCFullYear(), asked.getUTCMonth(), asked.getUTCDate()));
  while (start.getUTCDay() !== Number(budgets[0]!.StartDay)) {
    start.setUTCDate(start.getUTCDate() - 1);
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { rows } = await query(
    `select * from "Expenses"
      where "BudgetId" = $1 and "Date" >= $2 and "Date" < $3 and "IsDeleted" = false
      order by "Date"`,
    [req.params.id, iso(start), iso(end)]);
  res.json(rows.map((r) => wire.expense(r as never)));
}));

/* ----------------------------------------------------------------- expenses */

api.post('/expense', asyncRoute(async (req, res) => {
  const e = req.body ?? {};
  const budgetId = wire.field(e, 'BudgetId');
  if (!budgetId) return res.status(400).json({ Message: 'BudgetId is required' });

  const categoryId = await storableCategoryId(wire.field(e, 'CategoryId'));

  const { rows } = await query(
    `insert into "Expenses"
       ("Date","Description","Amount","BudgetId","CategoryId",
        "DateCreated","DateUpdated","IsDeleted","IsSystem")
     values ($1,$2,$3,$4,$5, now(), now(), false, $6)
     returning *`,
    [asDate(wire.field(e, 'Date')), wire.field(e, 'Description') ?? '',
     Number(wire.field(e, 'Amount') ?? 0), budgetId,
     categoryId, Boolean(wire.field(e, 'IsSystem'))]);
  res.status(201).json(wire.expense(rows[0] as never));
}));

api.put('/expense/:id', asyncRoute(async (req, res) => {
  const e = req.body ?? {};
  const categoryId = await storableCategoryId(wire.field(e, 'CategoryId'));

  const { rowCount } = await query(
    `update "Expenses"
        set "Date" = $2, "Description" = $3, "Amount" = $4, "CategoryId" = $5,
            "IsSystem" = $6, "IsDeleted" = false, "DateUpdated" = now()
      where "Id" = $1`,
    [req.params.id, asDate(wire.field(e, 'Date')), wire.field(e, 'Description') ?? '',
     Number(wire.field(e, 'Amount') ?? 0), categoryId,
     Boolean(wire.field(e, 'IsSystem'))]);
  if (!rowCount) return res.sendStatus(404);
  res.sendStatus(204);
}));

api.delete('/expense/:id', asyncRoute(async (req, res) => {
  // A soft delete: the row has to survive so the change feed can tell other
  // devices it went away.
  const { rows } = await query(
    `update "Expenses" set "IsDeleted" = true, "DateUpdated" = now()
      where "Id" = $1 returning *`, [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json(wire.expense(rows[0] as never));
}));

/* --------------------------------------------------------------- categories */

api.post('/categories', asyncRoute(async (req, res) => {
  const c = req.body ?? {};
  const budgetId = wire.field(c, 'BudgetId');
  if (!budgetId) return res.status(400).json({ Message: 'BudgetId is required' });

  // Keep the client's own id when it made one up, so a stale reference on an
  // expense arriving later in the same sync can still be resolved. Only ids in
  // the client range are worth recording; a 0 or a real id means nothing here.
  const claimed = nullableId(wire.field(c, 'Id'));
  const originalId = claimed != null && claimed >= 1_000_000_000_000 ? claimed : null;

  const { rows } = await query(
    `insert into "Categories" ("Name","BudgetId","DateCreated","DateUpdated","IsDeleted","OriginalId")
     values ($1,$2, now(), now(), $3, $4) returning *`,
    [wire.field(c, 'Name') ?? '', budgetId, Boolean(wire.field(c, 'IsDeleted')), originalId]);
  res.status(201).json(wire.category(rows[0] as never));
}));

api.put('/categories/:id', asyncRoute(async (req, res) => {
  const c = req.body ?? {};
  const { rowCount } = await query(
    `update "Categories"
        set "Name" = $2, "IsDeleted" = $3, "DateUpdated" = now()
      where "Id" = $1`,
    [req.params.id, wire.field(c, 'Name') ?? '', Boolean(wire.field(c, 'IsDeleted'))]);
  if (!rowCount) return res.sendStatus(404);
  res.sendStatus(204);
}));

api.delete('/categories/:id', asyncRoute(async (req, res) => {
  const { rows } = await query(
    `update "Categories" set "IsDeleted" = true, "DateUpdated" = now()
      where "Id" = $1 returning *`, [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json(wire.category(rows[0] as never));
}));

/* ------------------------------------------------------------------ invites */

/*
 * An invite is a short-lived, single-use stand-in for the budget id, so that
 * sharing a budget does not mean publishing its only credential as a URL. The
 * reasoning is in migrations/004_invites.sql.
 *
 * One rule governs the shape of all of this: redeeming is a POST and nothing
 * else. Every messaging client fetches a shared URL to build a preview, so a GET
 * that consumed the token would leave the invite dead before the person it was
 * sent to had a chance to tap it. There is deliberately no GET that mutates, and
 * no "peek" endpoint that quietly counts as a use.
 */

const INVITE_TTL_HOURS = Number(process.env.BUDGETAPP_INVITE_TTL_HOURS ?? 168);

api.post('/budget/:id/invites', asyncRoute(async (req, res) => {
  const budgetId = param(req, 'id');
  const { rows: budgets } = await query(
    'select 1 from "Budgets" where "UniqueId" = $1', [budgetId]);
  if (!budgets.length) return res.sendStatus(404);

  const maxUses = Math.min(Math.max(Number(wire.field(req.body ?? {}, 'MaxUses') ?? 1), 1), 20);

  // Opportunistic tidying: this table would otherwise only ever grow, and the
  // rows in question can never be redeemed again. Cheap, bounded, and it keeps
  // a listing honest without a scheduled job to forget about.
  await query(
    `delete from "Invites"
      where "BudgetId" = $1
        and ("ExpiresAt" < now() or "Uses" >= "MaxUses" or "RevokedAt" is not null)`,
    [budgetId]);

  const token = inviteToken();
  const { rows } = await query(
    `insert into "Invites" ("Token","BudgetId","ExpiresAt","MaxUses")
     values ($1, $2, now() + ($3 || ' hours')::interval, $4)
     returning *`,
    [token, budgetId, String(INVITE_TTL_HOURS), maxUses]);

  res.status(201).json(wire.invite(rows[0] as never, publicOrigin(req)));
}));

api.get('/budget/:id/invites', asyncRoute(async (req, res) => {
  const { rows } = await query(
    `select * from "Invites"
      where "BudgetId" = $1 and "RevokedAt" is null
        and "ExpiresAt" > now() and "Uses" < "MaxUses"
      order by "CreatedAt" desc`,
    [param(req, 'id')]);
  res.json(rows.map((row) => wire.invite(row as never, publicOrigin(req))));
}));

api.delete('/invites/:token', asyncRoute(async (req, res) => {
  const { rowCount } = await query(
    `update "Invites" set "RevokedAt" = now()
      where "Token" = $1 and "RevokedAt" is null`, [param(req, 'token')]);
  if (!rowCount) return res.sendStatus(404);
  res.sendStatus(204);
}));

/**
 * Exchanges a token for the budget it points at, and spends one use.
 *
 * A POST, and there is no GET equivalent: see invites.ts.
 */
api.post('/invites/:token/redeem', asyncRoute(async (req, res) => {
  const result = await redeem(param(req, 'token'));

  if ('failed' in result) {
    return res.status(result.failed === 'unusable' ? 410 : 404).json({
      Message: result.failed === 'unusable'
        ? 'This invite has already been used or has expired.'
        : 'That invite does not exist.',
    });
  }

  const { rows } = await query(
    'select * from "Budgets" where "UniqueId" = $1', [result.budgetId]);
  if (!rows.length) return res.sendStatus(404);

  // The budget itself, not just its id, so a client can store it and show the
  // right name and weekly amount without a second call.
  res.json(wire.budget(rows[0] as never));
}));

/* ------------------------------------------------------------------ helpers */

/** The clients send `2026-08-14` or a full ISO instant; both mean a day. */
function asDate(value: unknown): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match?.[1]) return match[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

/** The app omits CategoryId entirely, or sends -1 for "none". */
function nullableId(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A CategoryId this server can actually store, or null.
 *
 * The Android client hands out its own category ids while offline, from 10^12
 * up, and swaps them for the server's on the next sync. `Sync.run` reads its
 * pending expenses into memory *before* pushing the categories, so an expense
 * created against a brand-new category is sent carrying the local id even
 * though the row in SQLite has already been repointed. The server has never
 * seen that id, the foreign key rejects it, and the whole sync aborts — taking
 * every later change with it and retrying forever.
 *
 * The expense is what the user typed and is worth keeping; the category tag is
 * a nicety, and every client already renders an unresolvable one as
 * "Uncategorized". So an unknown id is stored as null rather than failing the
 * write. See migration 002 for recovering the tag itself.
 */
async function storableCategoryId(value: unknown): Promise<number | null> {
  const id = nullableId(value);
  if (id == null) return null;
  const { rows } = await query('select 1 from "Categories" where "Id" = $1', [id]);
  if (rows.length) return id;

  const { rows: mapped } = await query(
    'select "Id" from "Categories" where "OriginalId" = $1 order by "Id" limit 1', [id]);
  if (mapped.length) return Number(mapped[0]!.Id);

  console.warn(`[categoryId] ${id} is unknown; storing the expense uncategorised`);
  return null;
}
