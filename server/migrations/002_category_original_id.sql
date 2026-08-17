-- Remember the id a client made up for a category before this server gave it a
-- real one.
--
-- Clients invent category ids while offline, from 10^12 up, and swap them for
-- the server's ids on the next sync. Android's Sync.run reads its pending
-- expenses into memory before pushing categories, so an expense created against
-- a new category is sent carrying the local id even though the local row has
-- already been repointed. The foreign key rejected it and aborted the whole
-- sync, which then retried forever — every later change stuck behind it.
--
-- Recording the original id lets the server translate that stale reference back
-- to the right category instead of silently dropping the tag. Android already
-- keeps an OriginalId column of its own for the same reason.
--
--   psql -h ... -U budgetapp -d budgetapp -f 002_category_original_id.sql

alter table "Categories" add column if not exists "OriginalId" bigint;

-- Only ever looked up by this column, and only for ids in the client range.
create index if not exists "IX_Categories_OriginalId"
    on "Categories" ("OriginalId") where "OriginalId" is not null;

comment on column "Categories"."OriginalId" is
    'The id the creating client used before this server assigned one. Lets a '
    'stale CategoryId on an incoming expense be resolved to the real category.';
