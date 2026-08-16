#!/usr/bin/env python3
"""Repair the rows the cutover import missed. Run once, on 2026-08-16.

Kept as the record of a change made directly to production data.

What went wrong: the final import ran while the old server was still taking
writes. A streaming copy is not a snapshot, so eleven expenses committed after
the cursor passed the end of dbo.Expenses were never copied, and one expense
edited at 14:59 kept its pre-edit amount. None of it was visible in the import's
own verification, which compared a row count taken *before* the copy against the
target afterwards — the totals agreed while the tail was missing. Comparing id
sets, as this script does, found all twelve immediately.

Two details that matter more than they look:

  * DateUpdated is restamped to now() on every repaired row. It is a sync marker,
    not user data. The change feed returns DateUpdated > watermark, so a row
    restored with its original 14:34 timestamp would be invisible forever to any
    device that had already synced past it — the data would be in the database
    and yet still lost to the user.

  * Verification runs on a fresh connection. The first run of this script wrote
    inside `pg.transaction()` on a connection whose earlier SELECTs had already
    opened a transaction, so the block released a savepoint instead of
    committing, and close() discarded the work. Reading back through the same
    connection showed the rows present and reported success. Nothing had been
    written.

    python3 reconcile_cutover.py --password-file pw            # report only
    python3 reconcile_cutover.py --password-file pw --apply
"""

import argparse
import sys

try:
    import psycopg
    import pymssql
except ImportError:
    sys.exit('missing deps: pip install "psycopg[binary]" pymssql')

# Anything the old server wrote after this is suspect; the copy passed the end of
# dbo.Expenses at about 14:34:06 UTC.
COPY_PASSED = "2026-08-16 14:30:00"
CUTOVER = "2026-08-16 15:06:00+00"

COLS = ["Id", "Date", "Description", "Amount", "BudgetId", "CategoryId",
        "DateCreated", "IsDeleted", "IsSystem"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mssql-host", default="OVENS-DESKTOP.local")
    ap.add_argument("--pg-host", default="192.168.219.100")
    ap.add_argument("--password-file", required=True)
    ap.add_argument("--apply", action="store_true", help="write; otherwise report only")
    args = ap.parse_args()
    pw = open(args.password_file).read().strip()

    ms = pymssql.connect(server=args.mssql_host, user="budgetapp", password=pw,
                         database="budgetapp", timeout=600, login_timeout=15)
    # autocommit, so `transaction()` is the outermost block and really commits.
    pg = psycopg.connect(f"host={args.pg_host} dbname=budgetapp user=budgetapp "
                         f"password={pw}", autocommit=True)
    mc, pc = ms.cursor(), pg.cursor()

    # ------------------------------------------------------------ absent rows
    pc.execute('select "Id" from "Expenses"')
    have = {r[0] for r in pc.fetchall()}
    mc.execute(f'select {", ".join("[" + c + "]" for c in COLS)} from dbo.Expenses')
    missing = [r for r in mc.fetchall() if r[0] not in have]

    print(f"  {len(missing)} expense(s) in SQL Server and not in Postgres")
    for r in sorted(missing):
        print(f"    id={r[0]} {r[2]!r} {r[3]} on {r[1].date()}")

    # ------------------------------------------------------------ stale edits
    mc.execute("select Id, Amount, Description, cast([Date] as date), CategoryId, "
               "IsDeleted, coalesce(IsSystem, 0), DateUpdated from dbo.Expenses "
               f"where DateUpdated > '{COPY_PASSED}'")
    recent = {r[0]: r for r in mc.fetchall()}

    stale = []
    if recent:
        pc.execute('select "Id", "Amount", "Description", "Date", "CategoryId", '
                   '"IsDeleted", "IsSystem", "DateUpdated" from "Expenses" '
                   'where "Id" = any(%s)', [list(recent)])
        for p in pc.fetchall():
            s = recent[p[0]]
            if (round(float(s[1]), 2) == round(float(p[1]), 2) and s[2] == p[2]
                    and str(s[3]) == str(p[3]) and s[4] == p[4]
                    and bool(s[5]) == bool(p[5]) and bool(s[6]) == bool(p[6])):
                continue
            # A row edited on the new server is the newer truth; leave it be.
            if p[7].replace(tzinfo=None) > s[7]:
                print(f"    id={p[0]} differs but Postgres is newer — left alone")
                continue
            stale.append(s)

    print(f"  {len(stale)} expense(s) edited on SQL Server after the copy passed them")
    for s in stale:
        print(f"    id={s[0]} {s[2]!r}: amount -> {s[1]}")

    if not args.apply:
        print("\n  report only; pass --apply to write")
        return 0

    # ------------------------------------------------------------------ write
    if stale:
        with pg.transaction(), pg.cursor() as cur:
            for s in stale:
                cur.execute('update "Expenses" set "Amount" = %s, "Description" = %s, '
                            '"Date" = %s, "CategoryId" = %s, "IsDeleted" = %s, '
                            '"IsSystem" = %s, "DateUpdated" = now() where "Id" = %s',
                            (s[1], s[2], s[3], s[4], bool(s[5]), bool(s[6]), s[0]))
        print(f"  updated {len(stale)} row(s)")

    if missing:
        # The foreign key is real in this schema, unlike the old one.
        pc.execute('select "Id" from "Categories"')
        known = {r[0] for r in pc.fetchall()}
        for r in missing:
            if r[5] is not None and r[5] not in known:
                sys.exit(f"  ABORT: expense {r[0]} references missing category {r[5]}")

        with pg.transaction(), pg.cursor() as cur:
            for r in missing:
                cur.execute(
                    'insert into "Expenses" ("Id","Date","Description","Amount",'
                    '"BudgetId","CategoryId","DateCreated","IsDeleted","IsSystem",'
                    '"DateUpdated") values (%s,%s,%s,%s,%s,%s,%s,%s,%s, now())', r[:9])
            cur.execute("""select setval(pg_get_serial_sequence('"Expenses"','Id'),
                             greatest((select max("Id") from "Expenses") + 1,
                                      (select last_value from pg_sequences
                                        where schemaname = 'public'
                                          and sequencename like 'Expenses%')), false)""")
            print(f"    sequence -> {cur.fetchone()[0]:,}")
        print(f"  inserted {len(missing)} row(s)")

    # -------------------------------------------------------------- verify
    pg.close()
    pg = psycopg.connect(f"host={args.pg_host} dbname=budgetapp user=budgetapp "
                         f"password={pw}")
    pc = pg.cursor()

    print("\n  verification (fresh connection)")
    ok = True
    for table, key in (("Budgets", "UniqueId"), ("Categories", "Id"), ("Expenses", "Id")):
        mc.execute(f"select {key} from dbo.{table}")
        a = {r[0] for r in mc.fetchall()}
        pc.execute(f'select "{key}" from "{table}"')
        b = {r[0] for r in pc.fetchall()}
        ok &= not (a - b)
        print(f"    {table:<11} absent {len(a - b):>3}  "
              f"written since cutover {len(b - a):>3}  {'ok' if not (a - b) else 'INCOMPLETE'}")

    ms.close()
    pg.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
