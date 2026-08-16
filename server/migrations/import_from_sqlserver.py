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
        reset_sequences(pg)

    got = target_counts(pg)
    print("\n  verification")
    ok = True
    for t in ORDER:
        match = src[t] == got[t]
        ok &= match
        print(f"    {t:<12} source {src[t]:>9,}  target {got[t]:>9,}  {'ok' if match else 'MISMATCH'}")
    ms.close()
    pg.close()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
