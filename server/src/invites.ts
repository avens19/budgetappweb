/**
 * Reading and spending invites.
 *
 * Both the API and the web join page need this, and it is the one piece of the
 * feature where a second, slightly-different copy would be dangerous — so there
 * is exactly one implementation of "spend a use" and one of "look without
 * spending". The reasoning behind invites at all is in
 * migrations/004_invites.sql.
 */

import { query } from './db.js';

export type Unusable = 'unusable' | 'missing';

export interface Inspection {
  /** `unusable` covers expired, revoked and spent, on purpose — see below. */
  status: 'ok' | Unusable;
  budgetName?: string;
}

/**
 * What an invite looks like without touching it.
 *
 * Strictly read-only, and that is the whole point rather than a nicety: this is
 * what a GET of the join page calls, and every messaging client fetches a shared
 * URL to build its preview. If looking spent a use, an invite would routinely be
 * dead before the person it was sent to ever tapped it.
 *
 * Expired, revoked and already-used collapse into one status. They lead the
 * recipient to the same action — ask for another — and keeping them apart would
 * turn the page into a report on which tokens exist.
 */
export async function inspect(token: string): Promise<Inspection> {
  const { rows } = await query<{ Usable: boolean; Name: string | null }>(
    `select ("RevokedAt" is null and "ExpiresAt" > now() and "Uses" < "MaxUses") as "Usable",
            b."Name"
       from "Invites" i join "Budgets" b on b."UniqueId" = i."BudgetId"
      where i."Token" = $1`,
    [token]);

  const row = rows[0];
  if (!row) return { status: 'missing' };
  if (!row.Usable) return { status: 'unusable' };
  return { status: 'ok', budgetName: row.Name ?? '' };
}

/**
 * Spends one use and returns the budget id it was standing in for.
 *
 * The test and the increment are one statement so that two devices redeeming the
 * last use at the same instant cannot both succeed: they contend for the same
 * row lock. Checking and then updating would be a race, and what is being raced
 * for is access to someone's budget.
 */
export async function redeem(token: string): Promise<{ budgetId: string } | { failed: Unusable }> {
  const { rows } = await query<{ BudgetId: string }>(
    `update "Invites"
        set "Uses" = "Uses" + 1, "LastUsedAt" = now()
      where "Token" = $1
        and "RevokedAt" is null
        and "ExpiresAt" > now()
        and "Uses" < "MaxUses"
      returning "BudgetId"`,
    [token]);

  const row = rows[0];
  if (row) return { budgetId: row.BudgetId };

  const { rows: known } = await query('select 1 from "Invites" where "Token" = $1', [token]);
  return { failed: known.length ? 'unusable' : 'missing' };
}
