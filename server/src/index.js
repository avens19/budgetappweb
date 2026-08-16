import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { api } from './routes/api.js';
import { web } from './routes/web.js';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// The Android client calls /api/budget, /api/expense, /api/categories; the web
// app calls /api/Budget, /api/Expense. ASP.NET routed both, and Express is
// case-insensitive by default — but this is load-bearing, so it is explicit.
app.set('case sensitive routing', false);
app.set('strict routing', false);
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(here, 'views'));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(here, 'public'), { maxAge: '1h' }));

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.use('/api', api);
app.use('/', web);

app.use((_req, res) => res.status(404).send('Not found'));

// Never leak internals to the client: the old server shipped with
// customErrors off and handed the public full stack traces, build-machine
// paths included. Detail goes to the log, the caller gets a shape it can read.
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ Message: 'An error has occurred.' });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`budgetapp listening on :${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`${signal} received, closing`);
    server.close(() => pool.end().then(() => process.exit(0)));
    // Docker sends SIGKILL after its grace period anyway; do not hang on it.
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

export { app };
