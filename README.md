# budgetappweb

The backend for the [Weekly Budget](https://play.google.com/store/apps/details?id=com.andrewovens.weeklybudget2)
Android app, plus the web app that iPhone users get instead.

Node 22 and Express on Postgres 17, in Docker behind Caddy. It replaced an
ASP.NET MVC5 / EF6 / SQL Server application in August 2026; the C# is gone from
the working tree but remains in history at `2b89278` if it is ever needed.

    server/src/routes/api.js    the JSON API the Android app calls
    server/src/routes/web.js    the web app's pages
    server/src/serialize.js     wire formats — see CONTRACT.md before touching
    server/migrations/          schema, and the one-time move off SQL Server
    deploy/deploy.sh            build and release to the Docker host

## The contract is load-bearing

`CONTRACT.md` was captured from the running ASP.NET server rather than inferred
from its source. Android releases going back years read these responses and
cannot be updated in step, so the shapes recorded there outrank whatever looks
tidy: PascalCase keys, case-insensitive routes, `PUT` answering 204 with an
empty body, an unknown budget answering 404.

The change feeds are the sharp edge. A client syncs by asking for everything
changed since a watermark, stores the `X-Watermark` header it gets back, and
compares watermarks *as strings* — so the header is padded to a fixed 28
characters. Shorten it and sync breaks silently while every page still renders
correctly. `server/test/contract.test.js` pins all of this:

    cd server && npm install
    PGHOST=… PGPASSWORD=… npm test              # against a local server
    TEST_BASE_URL=https://budget.andrewovens.com node --test test/contract.test.js

## Running it

    cd deploy
    cp .env.example .env        # set POSTGRES_PASSWORD
    docker compose up -d
    psql … -f ../server/migrations/001_initial.sql

## Deploying

    export BUDGETAPP_SSH_PASSWORD='…'
    ./deploy/deploy.sh --push

The host builds from its own checkout of this repo, so only committed and
pushed work ships. The script rebuilds one service, recreates it, and checks
the live site four ways before finishing; anything failing rolls back to the
previous image. `--dry-run` shows the plan, `--rollback` undoes the last
release. Schema changes are *not* applied automatically — the script notices
when `server/migrations/` has changed and tells you to run them yourself.
