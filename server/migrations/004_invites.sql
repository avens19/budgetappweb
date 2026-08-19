-- Invites: a short-lived, single-use token that can be exchanged for a budget id.
--
-- Sharing a budget has always meant handing over the budget id itself, and that
-- id is the whole credential — anyone holding it can read and change the budget,
-- for as long as the budget exists. That is tolerable while it travels by
-- copy-paste, because the friction keeps it out of places it should not be. It
-- stops being tolerable the moment it becomes a tappable link: links get
-- forwarded, quoted in group chats, expanded by preview bots, and written into
-- every proxy log on the way. One careless forward would hand over the budget
-- permanently, with nothing to revoke.
--
-- So the link carries one of these instead. It expires, it can be used once, it
-- can be revoked, and it is worthless afterwards. The durable credential is
-- handed back over TLS at redemption and never appears in a URL.
--
-- Tokens are stored as they are, not hashed, and that is deliberate rather than
-- an oversight: "UniqueId" above is itself a plaintext credential and has to be,
-- since it is the addressing key. Anyone who can read this table can already
-- read every budget id in it, so hashing the weaker, expiring secret next to the
-- permanent one in the clear would buy nothing.
--
-- Redemption is a POST, and only a POST. A GET of the join page must stay safe:
-- iMessage, WhatsApp, Slack and every other client fetches a URL to build a
-- preview, and if that fetch redeemed the token the invite would be dead before
-- the person it was sent to ever tapped it.
--
--   psql -h ... -U budgetapp -d budgetapp -f 004_invites.sql

begin;

create table if not exists "Invites" (
    -- 22 characters of base64url, from 16 random bytes.
    "Token"      varchar(64)  primary key,
    -- varchar(128) to match "Budgets"."UniqueId", which is not a uuid column:
    -- some imported ids are not well-formed UUIDs.
    "BudgetId"   varchar(128) not null references "Budgets"("UniqueId") on delete cascade,
    "CreatedAt"  timestamptz  not null default now(),
    "ExpiresAt"  timestamptz  not null,
    -- Kept as a count rather than a boolean so a "link for the family group
    -- chat" is a config change and not a schema change.
    "MaxUses"    integer      not null default 1,
    "Uses"       integer       not null default 0,
    "LastUsedAt" timestamptz,
    "RevokedAt"  timestamptz
);

-- Listing and revoking are both per budget.
create index if not exists "Invites_BudgetId_idx" on "Invites" ("BudgetId");

commit;
