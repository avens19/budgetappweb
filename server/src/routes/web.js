import express from 'express';
import { query } from '../db.js';
import * as wire from '../serialize.js';

export const web = express.Router();

const asyncRoute = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function findBudget(id) {
  const { rows } = await query('select * from "Budgets" where "UniqueId" = $1', [id]);
  return rows.length ? wire.budget(rows[0]) : null;
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
  const budget = await findBudget(req.params.id);
  if (!budget) return res.sendStatus(404);

  // The old page showed a "bookmark this" alert on the first view after
  // creating a budget, tracked in session state. A query flag does the same
  // job without the app needing a session store at all.
  res.render('week', { title: 'Weekly Budget', budget, first: req.query.new === '1' });
}));

web.get('/Budget/:id/Month', asyncRoute(async (req, res) => {
  const budget = await findBudget(req.params.id);
  if (!budget) return res.sendStatus(404);
  res.render('month', { title: 'Month', budget });
}));

web.get('/Budget/:id/Add', asyncRoute(async (req, res) => {
  const budget = await findBudget(req.params.id);
  if (!budget) return res.sendStatus(404);
  res.render('addExpense', { title: 'Add Expense', budget });
}));

web.get('/Budget/:id/Edit', asyncRoute(async (req, res) => {
  const budget = await findBudget(req.params.id);
  if (!budget) return res.sendStatus(404);
  res.render('editBudget', { title: 'Edit Budget', budget });
}));

web.get('/Budget/:id/Edit/:expenseId', asyncRoute(async (req, res) => {
  const budget = await findBudget(req.params.id);
  if (!budget) return res.sendStatus(404);

  const { rows } = await query('select * from "Expenses" where "Id" = $1', [req.params.expenseId]);
  if (!rows.length) return res.sendStatus(404);

  res.render('editExpense', {
    title: 'Edit Expense',
    budget,
    expense: wire.expense(rows[0]),
  });
}));
