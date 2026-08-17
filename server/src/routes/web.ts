import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { query } from '../db.js';
import * as wire from '../serialize.js';

/** A path parameter of a matched route is always present. */
const param = (req: Request, name: string): string => String(req.params[name]);

export const web = express.Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncRoute = (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => { void fn(req, res, next).catch(next); };

async function findBudget(id: string): Promise<unknown> {
  const { rows } = await query('select * from "Budgets" where "UniqueId" = $1', [id]);
  return rows.length ? wire.budget(rows[0] as never) : null;
}

/** A fresh, unsaved budget for the landing page to bind its form to. */
web.get('/', (req, res) => {
  res.render('newBudget', {
    title: 'New Budget',
    budget: { UniqueId: crypto.randomUUID(), Name: '', StartDay: 0, Amount: 0,
              StartDayOfWeek: 'Sunday' },
  });
});

web.get('/Budget/:id', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);

  // The old page showed a "bookmark this" alert on the first view after
  // creating a budget, tracked in session state. A query flag does the same
  // job without the app needing a session store at all.
  res.render('week', { title: 'Weekly Budget', budget, first: req.query.new === '1' });
}));

web.get('/Budget/:id/Month', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('month', { title: 'Month', budget });
}));

web.get('/Budget/:id/Categories', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('categories', { title: 'Categories', budget });
}));

// Required by the App Store, and linked from the landing page. No budget
// context: the reviewer opens it cold, and so does anyone curious.
web.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy' });
});

// Reachable with or without a budget: the landing page links here before one
// exists, and the app bar has to know where "Done" goes back to.
web.get('/HowItWorks', (req, res) => {
  res.render('howItWorks', { title: 'How this works', budget: null });
});

web.get('/Budget/:id/HowItWorks', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('howItWorks', { title: 'How this works', budget });
}));

web.get('/Budget/:id/Add', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('addExpense', { title: 'Add Expense', budget });
}));

web.get('/Budget/:id/Edit', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);
  res.render('editBudget', { title: 'Edit Budget', budget });
}));

web.get('/Budget/:id/Edit/:expenseId', asyncRoute(async (req, res) => {
  const budget = await findBudget(param(req, 'id'));
  if (!budget) return res.sendStatus(404);

  const { rows } = await query('select * from "Expenses" where "Id" = $1', [param(req, 'expenseId')]);
  if (!rows.length) return res.sendStatus(404);

  res.render('editExpense', {
    title: 'Edit Expense',
    budget,
    expense: wire.expense(rows[0] as never),
  });
}));
