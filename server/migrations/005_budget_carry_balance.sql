-- A per-budget switch for carrying each week's leftover (or overspend) into the
-- next one automatically.
--
-- It belongs to the budget rather than to a device so that every phone and the
-- website agree: otherwise two people sharing a budget could each have it on,
-- and each write a carry, or have it on for one and off for the other.
--
-- Off by default. A budget that never asked for it must not start moving money
-- around because the server was upgraded.
--
--   psql -h ... -U budgetapp -d budgetapp -f 005_budget_carry_balance.sql

alter table "Budgets" add column if not exists "CarryBalance" boolean not null default false;
