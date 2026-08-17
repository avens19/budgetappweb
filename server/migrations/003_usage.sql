-- Usage analytics, as aggregates rather than events.
--
-- The obvious design is a row per request, and it is the wrong one here. At this
-- traffic that is millions of rows a month needing pruning and partitioning, and
-- it is a per-person activity trail nobody asked for. The questions actually
-- being asked — is this growing, which clients are people on, is anything
-- failing, how slow is it — all answer from counts, and counts keep forever in
-- a table small enough to ignore.
--
-- Routes are stored as templates ("/api/budget/:id/Expenses"), never as the
-- concrete path. A concrete path contains the budget id, which is the only
-- credential protecting that budget; a log full of credentials is a breach
-- waiting for somewhere to leak.
--
--   psql -h ... -U budgetapp -d budgetapp -f 003_usage.sql

create table if not exists "UsageDaily" (
    "Day"         date    not null,
    "Route"       text    not null,
    "Client"      text    not null,          -- android | ios | web | other | unknown
    "StatusClass" text    not null,          -- 2xx | 3xx | 4xx | 5xx
    "Requests"    bigint  not null default 0,
    -- Total rather than an average, so intervals can be summed without drifting.
    -- Mean latency is TotalMs / Requests at read time.
    "TotalMs"     bigint  not null default 0,
    "MaxMs"       integer not null default 0,
    primary key ("Day", "Route", "Client", "StatusClass")
);

comment on table "UsageDaily" is
    'Request counts per day, route template, client and status class. No request '
    'bodies, no responses, no per-request rows, no concrete paths.';

-- "How many budgets were in use that day" cannot come from a counter, because
-- counts across flush intervals would double-count the same budget. This is the
-- least that answers it: which budgets were active on which day, and nothing
-- about what they did or when.
create table if not exists "UsageBudgetDay" (
    "Day"      date not null,
    "BudgetId" text not null,
    primary key ("Day", "BudgetId")
);

comment on table "UsageBudgetDay" is
    'One row per budget per day it was used, so active-budget counts are a '
    'count(*). No times, no routes, no ordering.';

-- What the numbers actually look like, so answering a question is a select
-- rather than remembering how the columns fit together.
create or replace view "UsageSummary" as
select
    d."Day",
    sum(d."Requests")                                              as "Requests",
    sum(d."Requests") filter (where d."StatusClass" = '5xx')       as "ServerErrors",
    sum(d."Requests") filter (where d."StatusClass" = '4xx')       as "ClientErrors",
    round(sum(d."TotalMs")::numeric / greatest(sum(d."Requests"), 1), 1) as "MeanMs",
    max(d."MaxMs")                                                 as "SlowestMs",
    (select count(*) from "UsageBudgetDay" b where b."Day" = d."Day") as "ActiveBudgets",
    sum(d."Requests") filter (where d."Client" = 'android')        as "Android",
    sum(d."Requests") filter (where d."Client" = 'ios')            as "iOS",
    sum(d."Requests") filter (where d."Client" = 'web')            as "Web"
from "UsageDaily" d
group by d."Day"
order by d."Day" desc;

comment on view "UsageSummary" is
    'One row per day: traffic, error counts, mean and worst latency, active '
    'budgets, and the split by client. Start here.';
