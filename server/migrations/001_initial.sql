-- Weekly Budget schema for Postgres.
--
-- Shaped to match what twelve years of EF migrations actually produced in SQL
-- Server, because the data is copied across and the API contract is fixed.
-- Column names keep their PascalCase so the mapping stays obvious; Postgres
-- folds unquoted identifiers to lower case, so every reference is quoted.

BEGIN;

CREATE TABLE IF NOT EXISTS "Budgets" (
    -- Client-generated UUID, kept as text: existing rows are not all
    -- well-formed UUIDs and a uuid column would reject them on import.
    "UniqueId"    varchar(128) PRIMARY KEY,
    "Name"        text,
    "StartDay"    integer      NOT NULL,
    "Amount"      double precision NOT NULL,
    "DateCreated" timestamptz  NOT NULL,
    "DateUpdated" timestamptz  NOT NULL
);

CREATE TABLE IF NOT EXISTS "Categories" (
    "Id"          bigserial PRIMARY KEY,
    "Name"        varchar(255) NOT NULL,
    "BudgetId"    varchar(128) NOT NULL
                  REFERENCES "Budgets" ("UniqueId") ON DELETE CASCADE,
    "DateCreated" timestamptz  NOT NULL,
    "DateUpdated" timestamptz  NOT NULL,
    "IsDeleted"   boolean      NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "Expenses" (
    "Id"          bigserial PRIMARY KEY,
    "Date"        date         NOT NULL,
    "Description" varchar(255) NOT NULL,
    "Amount"      double precision NOT NULL,
    "BudgetId"    varchar(128) NOT NULL
                  REFERENCES "Budgets" ("UniqueId") ON DELETE CASCADE,
    "CategoryId"  bigint       REFERENCES "Categories" ("Id") ON DELETE SET NULL,
    "DateCreated" timestamptz  NOT NULL,
    "DateUpdated" timestamptz  NOT NULL,
    "IsDeleted"   boolean      NOT NULL DEFAULT false,
    "IsSystem"    boolean      NOT NULL DEFAULT false
);

-- The change feeds filter on (BudgetId, DateUpdated) and the week and month
-- views filter on (BudgetId, Date); these are the only queries that run.
CREATE INDEX IF NOT EXISTS "IX_Expenses_Budget_Updated"
    ON "Expenses" ("BudgetId", "DateUpdated");
CREATE INDEX IF NOT EXISTS "IX_Expenses_Budget_Date"
    ON "Expenses" ("BudgetId", "Date");
CREATE INDEX IF NOT EXISTS "IX_Categories_Budget_Updated"
    ON "Categories" ("BudgetId", "DateUpdated");

COMMIT;

-- Notes on the deliberate differences from SQL Server:
--
-- "Date" becomes a real date rather than a datetime. It always held midnight,
-- and the client parses it as a calendar day; storing a timestamp invited the
-- timezone shifts the app already works around in two places.
--
-- Timestamps become timestamptz. SQL Server's datetime is offset-naive and the
-- app compensated by constructing every value as DateTimeKind.Utc by hand. The
-- sync watermark is a UTC instant compared across devices, so making the
-- column carry its zone removes a class of bug rather than preserving it.
--
-- ON DELETE CASCADE on BudgetId: deleting a budget currently returns HTTP 500
-- whenever it has any children, because EF issued a hard delete with no
-- cascade. The constraint now does what the endpoint always claimed to.
--
-- IsDeleted and IsSystem are NOT NULL here. They are nullable bool? in the C#
-- model but the wire format never carries null, and the import coalesces.
