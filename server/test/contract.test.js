/**
 * The wire contract, asserted.
 *
 * Every expectation here comes from ../../CONTRACT.md, which was captured from
 * the running ASP.NET server. Android releases going back years read these
 * responses and cannot be updated in step, so a failure means a client in the
 * field breaks — not that a test needs adjusting.
 *
 *   PGHOST=... PGPASSWORD=... npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3111';

const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const WATERMARK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // Status-only responses carry a plain-text body ("Not Found"), so parsing is
  // best-effort rather than assumed.
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { res, text, json };
}

/** Each test owns a budget and takes it away afterwards. */
async function withBudget(fn) {
  const id = randomUUID();
  const created = await call('POST', '/api/budget',
    { UniqueId: id, Name: 'Contract test', StartDay: 1, Amount: 250 });
  assert.equal(created.res.status, 201);
  try {
    await fn(id);
  } finally {
    await call('DELETE', `/api/budget/${id}`);
  }
}

test('budget: create returns 201 and the PascalCase shape', async () => {
  await withBudget(async (id) => {
    const { json } = await call('GET', `/api/budget/${id}`);
    assert.deepEqual(Object.keys(json).sort(), [
      'Amount', 'DateCreated', 'DateUpdated', 'Name',
      'StartDay', 'StartDayOfWeek', 'UniqueId',
    ]);
    assert.equal(json.StartDay, 1);
    assert.equal(json.StartDayOfWeek, 'Monday', 'the web form binds to this string');
    assert.equal(typeof json.Amount, 'number');
    assert.match(json.DateCreated, ISO_Z);
  });
});

test('budget: unknown id is 404, not an empty 200', async () => {
  const { res } = await call('GET', '/api/budget/definitely-not-a-budget');
  assert.equal(res.status, 404, 'the app uses 404 to decide a budget is gone');
});

test('budget: PUT returns 204 with an empty body', async () => {
  await withBudget(async (id) => {
    const { res, text } = await call('PUT', `/api/budget/${id}`,
      { UniqueId: id, Name: 'Renamed', StartDay: 4, Amount: 300 });
    assert.equal(res.status, 204);
    assert.equal(text, '', 'API.EditBudget throws on any non-empty body');

    const { json } = await call('GET', `/api/budget/${id}`);
    assert.equal(json.Name, 'Renamed');
    assert.equal(json.StartDayOfWeek, 'Thursday');
  });
});

test('budget: PUT accepts StartDayOfWeek, which is what the web app sends', async () => {
  await withBudget(async (id) => {
    await call('PUT', `/api/budget/${id}`,
      { uniqueId: id, name: 'Web edit', startDayOfWeek: 'Friday', amount: 120 });
    const { json } = await call('GET', `/api/budget/${id}`);
    assert.equal(json.StartDay, 5);
    assert.equal(json.Amount, 120, 'camelCase keys bind too');
  });
});

test('expense: create, edit and soft-delete', async () => {
  await withBudget(async (id) => {
    const created = await call('POST', '/api/expense',
      { Id: 0, Date: '2026-08-14', Description: 'probe', Amount: 12.34, BudgetId: id, IsSystem: false });
    assert.equal(created.res.status, 201);

    const e = created.json;
    assert.equal(e.Date, '2026-08-14T00:00:00Z', 'UTC midnight, or the day shifts');
    assert.equal(e.IsDeleted, false);
    assert.equal(e.IsSystem, false);
    assert.equal(e.Budget, null, 'navigation properties are not payload');
    assert.ok(Number.isInteger(e.Id));

    const put = await call('PUT', `/api/expense/${e.Id}`,
      { Id: e.Id, Date: '2026-08-15', Description: 'edited', Amount: 5, BudgetId: id });
    assert.equal(put.res.status, 204);
    assert.equal(put.text, '', 'API.EditExpense throws on any non-empty body');

    const gone = await call('DELETE', `/api/expense/${e.Id}`);
    assert.equal(gone.res.status, 200);
    assert.equal(gone.json.IsDeleted, true, 'soft delete: the feed must still carry it');
    assert.equal(gone.json.Description, 'edited');
  });
});

test('category: create and soft-delete', async () => {
  await withBudget(async (id) => {
    const created = await call('POST', '/api/categories',
      { Id: 0, Name: 'Groceries', BudgetId: id, IsDeleted: false });
    assert.equal(created.res.status, 201);
    assert.equal(created.json.Name, 'Groceries');
    assert.equal(created.json.IsDeleted, false);

    const gone = await call('DELETE', `/api/categories/${created.json.Id}`);
    assert.equal(gone.res.status, 200);
    assert.equal(gone.json.IsDeleted, true);
  });
});

test('change feed: X-Watermark is fixed width, and the window excludes it', async () => {
  await withBudget(async (id) => {
    const first = await fetch(`${BASE}/api/budget/${id}/Expenses?watermark=`);
    const mark = first.headers.get('x-watermark');
    assert.match(mark, WATERMARK, 'the client compares watermarks as strings');
    assert.equal(mark.length, 28, 'fixed width, or string ordering breaks');
    assert.equal((await first.json()).length, 0);

    await call('POST', '/api/expense',
      { Date: '2026-08-14', Description: 'after the mark', Amount: 1, BudgetId: id });

    const second = await fetch(`${BASE}/api/budget/${id}/Expenses?watermark=${encodeURIComponent(mark)}`);
    const rows = await second.json();
    assert.equal(rows.length, 1, 'a row written after the mark must come back');

    // Replaying the newer mark must return nothing: the window is exclusive at
    // the bottom, which is what stops every sync re-fetching the same rows.
    const third = await fetch(
      `${BASE}/api/budget/${id}/Expenses?watermark=${encodeURIComponent(second.headers.get('x-watermark'))}`);
    assert.equal((await third.json()).length, 0);
  });
});

test('change feed: a missing watermark means everything', async () => {
  await withBudget(async (id) => {
    await call('POST', '/api/expense',
      { Date: '2026-08-14', Description: 'x', Amount: 1, BudgetId: id });

    for (const qs of ['', '?watermark=', '?watermark=not-a-date']) {
      const res = await fetch(`${BASE}/api/budget/${id}/Expenses${qs}`);
      assert.equal((await res.json()).length, 1, `"${qs}" should return everything`);
    }
  });
});

test('change feed: deletions are carried, so other devices learn about them', async () => {
  await withBudget(async (id) => {
    const { json: e } = await call('POST', '/api/expense',
      { Date: '2026-08-14', Description: 'doomed', Amount: 1, BudgetId: id });
    const mark = (await fetch(`${BASE}/api/budget/${id}/Expenses?watermark=`)).headers.get('x-watermark');

    await call('DELETE', `/api/expense/${e.Id}`);

    const res = await fetch(`${BASE}/api/budget/${id}/Expenses?watermark=${encodeURIComponent(mark)}`);
    const rows = await res.json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].IsDeleted, true);
  });
});

test('week: returns the budget-aligned week containing the date', async () => {
  await withBudget(async (id) => {
    // Budget starts Monday. Aug 10 2026 is a Monday.
    for (const [date, desc] of [['2026-08-09', 'before'], ['2026-08-10', 'monday'],
                                ['2026-08-16', 'sunday'], ['2026-08-17', 'after']]) {
      await call('POST', '/api/expense',
        { Date: date, Description: desc, Amount: 1, BudgetId: id });
    }
    const millis = Date.UTC(2026, 7, 13);   // a Thursday inside that week
    const { json } = await call('GET', `/api/budget/${id}/Week/${millis}`);
    assert.deepEqual(json.map((e) => e.Description), ['monday', 'sunday']);
  });
});

test('week: soft-deleted expenses are excluded', async () => {
  await withBudget(async (id) => {
    const { json: e } = await call('POST', '/api/expense',
      { Date: '2026-08-12', Description: 'gone', Amount: 1, BudgetId: id });
    await call('DELETE', `/api/expense/${e.Id}`);
    const { json } = await call('GET', `/api/budget/${id}/Week/${Date.UTC(2026, 7, 13)}`);
    assert.equal(json.length, 0);
  });
});

test('routes are case-insensitive: the app and the web app disagree', async () => {
  await withBudget(async (id) => {
    for (const path of [`/api/budget/${id}`, `/api/Budget/${id}`]) {
      const { res } = await call('GET', path);
      assert.equal(res.status, 200, `${path} must route`);
    }
  });
});

test('deleting a budget with children succeeds', async () => {
  // The old endpoint returned 500 here: a hard delete against a schema with
  // no cascade, so it only ever worked on empty budgets.
  const id = randomUUID();
  await call('POST', '/api/budget', { UniqueId: id, Name: 'Doomed', StartDay: 0, Amount: 10 });
  await call('POST', '/api/expense',
    { Date: '2026-08-14', Description: 'child', Amount: 1, BudgetId: id });
  await call('POST', '/api/categories', { Name: 'child', BudgetId: id });

  const { res } = await call('DELETE', `/api/budget/${id}`);
  assert.equal(res.status, 200);
  assert.equal((await call('GET', `/api/budget/${id}`)).res.status, 404);
});
