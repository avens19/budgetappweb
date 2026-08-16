import pg from 'pg';

// node-postgres hands back a JS Date for timestamptz, which then has to be
// re-formatted for the wire. The contract needs exact control over the string,
// so DATE and TIMESTAMPTZ come back as text and are formatted deliberately.
// 1082 = date, 1114 = timestamp, 1184 = timestamptz.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(1184, (v) => v);

// int8 arrives as a string so large values survive; every bigint here is an
// id that comfortably fits a JS number, and the clients expect JSON numbers.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'budgetapp',
  user: process.env.PGUSER ?? 'budgetapp',
  password: process.env.PGPASSWORD,
  max: Number(process.env.PGPOOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle client erroring must not take the process down.
  console.error('[db] idle client error', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn` inside a transaction.
 *
 * The change feeds rely on this for more than atomicity: now() is fixed at
 * transaction start, so the upper bound used to filter rows and the watermark
 * handed back to the client are guaranteed to be the same instant.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
