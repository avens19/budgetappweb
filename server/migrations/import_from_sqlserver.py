#!/usr/bin/env python3
"""Copy the live SQL Server data into Postgres.

Written to be run more than once: a rehearsal now against real data, and again
at cutover to pick up whatever changed in between. It truncates the target
first, so it is a replace rather than a merge.

    pip install "psycopg[binary]" pymssql
    python3 import_from_sqlserver.py --check      # counts only, writes nothing
    python3 import_from_sqlserver.py

Identity values are preserved. Clients store expense and category ids locally
and send them back, so renumbering would silently detach every device from its
own data; the sequences are reset past the highest id afterwards.

Take the source read-only before the final run. A streaming copy is not a
snapshot, so rows committed after the cursor passes the end of a table are
missed, and matching row counts will not reveal it — at the real cutover eleven
expenses and one edit were lost exactly this way. Verification here compares id
sets rather than counts, and a second pass inside the same transaction picks up
whatever landed mid-copy, but neither is a substitute for a quiet source.

Rows recovered after clients have begun syncing need DateUpdated restamped to
now(), otherwise the change feed — which returns DateUpdated > watermark — will
never hand them to a device that has already synced past their original time.
"""

import argparse
import sys

try:
    import psycopg
    import pymssql
except ImportError:
    sys.exit('missing deps: pip install "psycopg[binary]" pymssql')

BATCH = 20_000

TABLES = {
    "Budgets": {
        "select": """
            select UniqueId, Name, StartDay, Amount, DateCreated, DateUpdated
            from dbo.Budgets""",
        "columns": ['"UniqueId"', '"Name"', '"StartDay"', '"Amount"',
                    '"DateCreated"', '"DateUpdated"'],
    },
    "Categories": {
        "select": """
            select Id, Name, BudgetId, DateCreated, DateUpdated,
                   coalesce(IsDeleted, 0)
            from dbo.Categories""",
        "columns": ['"Id"', '"Name"', '"BudgetId"', '"DateCreated"',
                    '"DateUpdated"', '"IsDeleted"'],
    },
    "Expenses": {
        # IsSystem is null on ~163k rows; the wire format never carries null,
        # and the app has always read a null here as false.
        "select": """
            select Id, cast([Date] as date), Description, Amount, BudgetId,
                   CategoryId, DateCreated, DateUpdated,
                   coalesce(IsDeleted, 0), coalesce(IsSystem, 0)
            from dbo.Expenses""",
        "columns": ['"Id"', '"Date"', '"Description"', '"Amount"', '"BudgetId"',
                    '"CategoryId"', '"DateCreated"', '"DateUpdated"',
                    '"IsDeleted"', '"IsSystem"'],
    },
}

# Parents first: the foreign keys are enforced here, unlike in the original.
ORDER = ["Budgets", "Categories", "Expenses"]


def key_of(name):
    return "UniqueId" if name == "Budgets" else "Id"


def late_arrivals(ms, pg, name):
    """Source rows the copy did not see.

    A copy against a live source is not a snapshot: the cursor streams, and rows
    committed after it passes the end of the table are simply not there. Counts
    cannot detect this — the count taken before the copy matches the target
    afterwards while the tail is quietly absent, which is exactly what happened
    at the real cutover and cost eleven expenses. Comparing id sets does detect
    it, so that is what runs here.
    """
    key = key_of(name)
    with pg.cursor() as cur:
        cur.execute(f'select "{key}" from "{name}"')
        have = {r[0] for r in cur.fetchall()}
    cur = ms.cursor()
    cur.execute(f"select {key} from dbo.[{name}]")
    return [r[0] for r in cur.fetchall() if r[0] not in have]


def copy_specific(ms, pg, name, keys):
    """Copy a named set of rows — the tail a streaming read missed."""
    spec = TABLES[name]
    key = key_of(name)
    cols = ", ".join(spec["columns"])
    cur = ms.cursor()
    written = 0
    with pg.cursor() as pcur:
        with pcur.copy(f'copy "{name}" ({cols}) from stdin') as cp:
            # SQL Server caps a statement at 2100 parameters, so the id list is
            # chunked well inside that.
            for i in range(0, len(keys), 1000):
                chunk = keys[i:i + 1000]
                placeholders = ", ".join(["%s"] * len(chunk))
                cur.execute(f"{spec['select']} where {key} in ({placeholders})",
                            tuple(chunk))
                for row in cur.fetchall():
                    cp.write_row(row)
                    written += 1
    return written


def source_counts(ms):
    cur = ms.cursor()
    out = {}
    for t in ORDER:
        cur.execute(f"select count(*) from dbo.[{t}]")
        out[t] = cur.fetchone()[0]
    return out


def target_counts(pg):
    with pg.cursor() as cur:
        out = {}
        for t in ORDER:
            cur.execute(f'select count(*) from "{t}"')
            out[t] = cur.fetchone()[0]
        return out


def copy_table(ms, pg, name):
    spec = TABLES[name]
    cur = ms.cursor()
    cur.execute(spec["select"])

    cols = ", ".join(spec["columns"])
    copied = 0
    with pg.cursor() as pcur:
        with pcur.copy(f'copy "{name}" ({cols}) from stdin') as cp:
            while True:
                rows = cur.fetchmany(BATCH)
                if not rows:
                    break
                for row in rows:
                    cp.write_row(row)
                copied += len(rows)
                print(f"    {name}: {copied:,}", end="\r", flush=True)
    print(f"    {name}: {copied:,} rows copied      ")
    return copied


def reset_sequences(pg):
    """bigserial keeps its own counter, which knows nothing about the ids that
    were copied in. Without this the first insert collides with existing rows."""
    with pg.cursor() as cur:
        for table in ("Categories", "Expenses"):
            # setval returns the value it set, so there is no need to read the
            # sequence back — and pg_get_serial_sequence yields a name, not a
            # relation, so selecting last_value "from" it does not work.
            cur.execute(
                f"""select setval(pg_get_serial_sequence('"{table}"', 'Id'),
                                  coalesce((select max("Id") from "{table}"), 0) + 1,
                                  false)""")
            print(f"    {table}.Id sequence -> {cur.fetchone()[0]:,}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mssql-host", default="OVENS-DESKTOP.local")
    ap.add_argument("--mssql-db", default="budgetapp")
    ap.add_argument("--mssql-user", default="budgetapp")
    ap.add_argument("--pg-host", default="192.168.219.100")
    ap.add_argument("--pg-db", default="budgetapp")
    ap.add_argument("--pg-user", default="budgetapp")
    ap.add_argument("--password-file", required=True,
                    help="file holding the password; keeps it off the command line")
    ap.add_argument("--check", action="store_true", help="compare counts, write nothing")
    args = ap.parse_args()

    pw = open(args.password_file).read().strip()

    ms = pymssql.connect(server=args.mssql_host, user=args.mssql_user,
                         password=pw, database=args.mssql_db,
                         timeout=600, login_timeout=15)
    pg = psycopg.connect(f"host={args.pg_host} dbname={args.pg_db} "
                         f"user={args.pg_user} password={pw} connect_timeout=15")

    src = source_counts(ms)
    print("  source (SQL Server):", {k: f"{v:,}" for k, v in src.items()})
    print("  target (Postgres)  :", {k: f"{v:,}" for k, v in target_counts(pg).items()})

    if args.check:
        print("\n  --check: nothing written")
        return

    with pg.transaction():
        with pg.cursor() as cur:
            # One statement so the FKs never see a partially-emptied database.
            cur.execute('truncate "Expenses", "Categories", "Budgets" restart identity cascade')
        print("\n  target truncated; copying")
        for name in ORDER:
            copy_table(ms, pg, name)

        # Second pass, before the transaction closes: anything committed to the
        # source while the copy was streaming. Parents first again, so a late
        # expense can still find its budget.
        for name in ORDER:
            late = late_arrivals(ms, pg, name)
            if late:
                copied = copy_specific(ms, pg, name, late)
                print(f"    {name}: {copied:,} late arrival(s) picked up")

        reset_sequences(pg)

    ms.close()
    pg.close()

    # Verify on new connections. Reading back through the connection that did the
    # writing proves nothing about what was committed: an uncommitted change
    # passes its own audit and then vanishes on close.
    ms = pymssql.connect(server=args.mssql_host, user=args.mssql_user,
                         password=pw, database=args.mssql_db, timeout=600)
    pg = psycopg.connect(f"host={args.pg_host} dbname={args.pg_db} "
                         f"user={args.pg_user} password={pw}")

    got = target_counts(pg)
    print("\n  verification (fresh connections, by id)")
    ok = True
    for t in ORDER:
        outstanding = late_arrivals(ms, pg, t)
        ok &= not outstanding
        print(f"    {t:<12} source {src[t]:>9,}  target {got[t]:>9,}  "
              f"absent {len(outstanding):>3}  {'ok' if not outstanding else 'INCOMPLETE'}")
        for k in outstanding[:5]:
            print(f"      missing: {k}")

    if not ok:
        print("\n  Rows are still missing. The source is being written to; either\n"
              "  stop writes and re-run, or reconcile the ids listed above.")
    ms.close()
    pg.close()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
