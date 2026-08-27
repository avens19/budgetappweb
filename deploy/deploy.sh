#!/usr/bin/env bash
#
# Deploy the Node server to the Docker host.
#
#   ./deploy/deploy.sh                 # deploy local HEAD
#   ./deploy/deploy.sh --push          # push it to origin first
#   ./deploy/deploy.sh --ref abc1234   # deploy a specific commit
#   ./deploy/deploy.sh --force         # recreate even if nothing changed
#   ./deploy/deploy.sh --rollback      # go back to the previous image
#   ./deploy/deploy.sh --test          # also run the contract suite afterwards
#   ./deploy/deploy.sh --dry-run
#
# The host pulls from origin, so what ships is whatever is on GitHub — not your
# working tree. Uncommitted changes are reported and left behind.
#
# Authentication is worked out rather than configured; see the auth section
# below. Given an SSH key and a login user in the host's docker group, a deploy
# needs no password at all. Without that, BUDGETAPP_SSH_PASSWORD answers both
# SSH and sudo.
#
# Only the one service is ever named in a compose command. The host's
# docker-compose.yml also runs Caddy and a pile of media containers, and a bare
# `docker compose up -d` there would recreate all of them.

set -euo pipefail

SSH_HOST="${BUDGETAPP_SSH_HOST:-192.168.219.100}"
SSH_USER="${BUDGETAPP_SSH_USER:-andrew}"
REMOTE_REPO="${BUDGETAPP_REMOTE_REPO:-/home/andrew/git/budgetappweb}"
COMPOSE_DIR="${BUDGETAPP_COMPOSE_DIR:-/home/andrew/docker}"
SERVICE="${BUDGETAPP_SERVICE:-budget-app}"
DB_CONTAINER="${BUDGETAPP_DB_CONTAINER:-budget-db}"
IMAGE="${BUDGETAPP_IMAGE:-docker-budget-app}"
PUBLIC_URL="${BUDGETAPP_URL:-https://budget.andrewovens.com}"
HEALTH_TIMEOUT="${BUDGETAPP_HEALTH_TIMEOUT:-90}"

REF="HEAD"
DO_PUSH=0
DO_ROLLBACK=0
DO_TEST=0
DRY_RUN=0
DO_FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push)     DO_PUSH=1 ;;
    --rollback) DO_ROLLBACK=1 ;;
    --test)     DO_TEST=1 ;;
    --dry-run)  DRY_RUN=1 ;;
    --force)    DO_FORCE=1 ;;
    --ref)      REF="${2:?--ref needs a git ref}"; shift ;;
    -h|--help)  awk 'NR>2 && /^#/ { sub(/^# ?/, ""); print; next } NR>2 { exit }' "$0"; exit 0 ;;
    *)          echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die()  { printf '\n\033[31mfailed:\033[0m %s\n' "$*" >&2; exit 1; }

# ----------------------------------------------------------------------- auth
#
# Two ways onto the host, and the script works out which one it has.
#
# The quiet one: an SSH key, with the login user in the host's docker group.
# No password is involved anywhere. It is worth setting up once:
#
#     ssh andrew@host 'sudo usermod -aG docker andrew'
#
# The fallback: BUDGETAPP_SSH_PASSWORD, answering both SSH and sudo. It needs
# no extra tooling, because OpenSSH 8.4+ will take a password from an askpass
# helper when SSH_ASKPASS_REQUIRE=force -- so there is no sshpass dependency,
# and the password never reaches a command line where any user on the machine
# could read it out of `ps`.

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=10
  -o LogLevel=ERROR
)

if [[ -n "${BUDGETAPP_SSH_PASSWORD:-}" ]]; then
  ASKPASS="$(mktemp "${TMPDIR:-/tmp}/budgetapp-askpass.XXXXXX")"
  chmod 700 "$ASKPASS"
  # The helper reads the password from the environment it inherits, so it is
  # never written to this file.
  cat > "$ASKPASS" <<'ASK'
#!/bin/sh
printf '%s\n' "$BUDGETAPP_SSH_PASSWORD"
ASK
  trap 'rm -f "$ASKPASS"' EXIT
  export BUDGETAPP_SSH_PASSWORD
  SSH_OPTS+=( -o BatchMode=no
              -o NumberOfPasswordPrompts=1
              -o PreferredAuthentications=password,publickey )
else
  # Nothing here can answer a prompt, so refuse to sit at one. A deploy that
  # hangs on an invisible question is worse than one that stops and says why.
  ASKPASS=/dev/null
  SSH_OPTS+=( -o BatchMode=yes
              -o PreferredAuthentications=publickey )
fi

ssh_base() {
  SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}" \
    ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" "$@"
}

# Remote script on stdin, run as the login user. Git lives here: running it as
# root would leave root-owned objects in the checkout and break the next pull.
rsh() {
  local script; script="$(cat)"
  printf '%s' "$script" | ssh_base "bash -euo pipefail -s"
}

ssh_base true 2>/dev/null || die "cannot ssh to $SSH_USER@$SSH_HOST -- add a key for this machine, or set BUDGETAPP_SSH_PASSWORD"

# Ask the host whether docker needs sudo, rather than assuming it does. Group
# membership is invisible from this end, and assuming the worst would demand a
# password on a host deliberately set up not to need one.
if ssh_base 'docker info' >/dev/null 2>&1; then
  DOCKER_SUDO=0
else
  DOCKER_SUDO=1
  [[ -n "${BUDGETAPP_SSH_PASSWORD:-}" ]] || die "$SSH_USER cannot reach the docker socket on $SSH_HOST, so every docker
    command has to go through sudo, which wants a password. Either set
    BUDGETAPP_SSH_PASSWORD, or grant the access once and be done with it:

        ssh $SSH_USER@$SSH_HOST 'sudo usermod -aG docker $SSH_USER'

    That takes effect on the next login, so it will not rescue this run."
fi

# Docker commands, run with whatever this host turns out to need. `sudo -S`
# consumes exactly the first line of stdin as the password and leaves the rest
# for the shell.
rsudo() {
  local script; script="$(cat)"
  if [[ "$DOCKER_SUDO" == 0 ]]; then
    printf '%s' "$script" | ssh_base "bash -euo pipefail -s"
  else
    { printf '%s\n' "$BUDGETAPP_SSH_PASSWORD"; printf '%s' "$script"; } \
      | ssh_base "sudo -S -p '' bash -euo pipefail -s"
  fi
}

# --------------------------------------------------------------------- rollback

if [[ "$DO_ROLLBACK" == 1 ]]; then
  step "Rolling back to the previous image"
  [[ "$DRY_RUN" == 1 ]] && { info "dry run: would retag $IMAGE:previous and recreate $SERVICE"; exit 0; }

  rsudo <<EOF || die "no previous image to roll back to"
docker image inspect "$IMAGE:previous" >/dev/null 2>&1
docker image tag "$IMAGE:previous" "$IMAGE:latest"
cd "$COMPOSE_DIR"
docker compose up -d --no-deps --force-recreate "$SERVICE"
EOF
  info "recreated from $IMAGE:previous"
  info "the checkout at $REMOTE_REPO still points at the newer commit;"
  info "re-run with --ref <older-sha> if the code needs to go back too"
  exit 0
fi

# ------------------------------------------------------------- local preflight

step "Local checks"

cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f server/Dockerfile ]] || die "run this from the budgetappweb repo (no server/Dockerfile here)"

COMMIT="$(git rev-parse "$REF")" || die "cannot resolve ref: $REF"
SUBJECT="$(git log -1 --format=%s "$COMMIT")"
info "deploying $(git rev-parse --short "$COMMIT")  $SUBJECT"

if [[ -n "$(git status --porcelain)" ]]; then
  info "note: working tree is dirty; only committed work is deployed"
  git status --short | sed 's/^/      /'
fi

if [[ "$DO_PUSH" == 1 ]]; then
  info "pushing to origin"
  [[ "$DRY_RUN" == 1 ]] && info "dry run: would git push" || git push origin "HEAD:$(git rev-parse --abbrev-ref HEAD)"
fi

# The host can only deploy what origin has.
if ! git branch -r --contains "$COMMIT" 2>/dev/null | grep -q .; then
  die "$(git rev-parse --short "$COMMIT") is not on origin — run with --push"
fi

# ------------------------------------------------------------ remote preflight

step "Host checks"

STATE="$(rsudo <<EOF
cd "$COMPOSE_DIR"
[[ -f docker-compose.yml ]] || { echo "MISSING_COMPOSE"; exit 1; }
echo "db=\$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo absent)"
echo "app=\$(docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo absent)"
echo "image=\$(docker image inspect --format '{{.Id}}' "$IMAGE:latest" 2>/dev/null || echo none)"
EOF
)" || die "cannot reach the host, or $COMPOSE_DIR/docker-compose.yml is missing"

info "$(echo "$STATE" | tr '\n' ' ')"
echo "$STATE" | grep -q 'db=healthy' || die "$DB_CONTAINER is not healthy — fix the database first"

# Only tracked modifications block: `git reset --hard` overwrites those, but it
# leaves untracked files alone, so they are worth mentioning and nothing more.
# Treating them as fatal wedges the deploy after any commit that stops ignoring
# a build directory — deleting the C# project did exactly that, leaving 22MB of
# formerly-ignored output sitting in the checkout.
REMOTE_STATE="$(rsh <<EOF
cd "$REMOTE_REPO"
echo "head=\$(git rev-parse HEAD)"
echo "dirty=\$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
echo "untracked=\$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')"
EOF
)" || die "cannot read the checkout at $REMOTE_REPO"

PREVIOUS_COMMIT="$(echo "$REMOTE_STATE" | sed -n 's/^head=//p')"
REMOTE_DIRTY="$(echo "$REMOTE_STATE" | sed -n 's/^dirty=//p')"
REMOTE_UNTRACKED="$(echo "$REMOTE_STATE" | sed -n 's/^untracked=//p')"
info "host is on $(printf '%.7s' "$PREVIOUS_COMMIT")"
[[ "$REMOTE_DIRTY" == 0 ]] || die "the checkout at $REMOTE_REPO has $REMOTE_DIRTY modified tracked file(s); deploying would discard them"
[[ "${REMOTE_UNTRACKED:-0}" == 0 ]] || info "note: $REMOTE_UNTRACKED untracked file(s) on the host, left as they are"

if [[ "$PREVIOUS_COMMIT" == "$COMMIT" ]]; then
  info "host already has this commit; rebuilding anyway"
fi

# A code change that needs a schema change is worth knowing about before the new
# code is live, since nothing here applies migrations.
PENDING="$(git diff --name-only "$PREVIOUS_COMMIT" "$COMMIT" -- server/migrations 2>/dev/null || true)"
if [[ -n "$PENDING" ]]; then
  step "Migrations changed between these commits"
  echo "$PENDING" | sed 's/^/    /'
  info "nothing here runs them — apply them yourself, then re-run"
fi

if [[ "$DRY_RUN" == 1 ]]; then
  step "Dry run, stopping here"
  info "would: fetch $(git rev-parse --short "$COMMIT") on the host, rebuild $SERVICE, recreate it, health-check"
  exit 0
fi

# ------------------------------------------------------------------- deploy

step "Updating the checkout"
rsh <<EOF
cd "$REMOTE_REPO"
git fetch --quiet origin
git reset --hard --quiet "$COMMIT"
git --no-pager log -1 --format='    now at %h %s'
EOF

step "Building"
# Keep the running image reachable under a stable tag so a failure has somewhere
# to fall back to.
rsudo <<EOF
cd "$COMPOSE_DIR"
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker image tag "$IMAGE:latest" "$IMAGE:previous"
  echo "    tagged the running image $IMAGE:previous"
fi
docker compose build "$SERVICE"
EOF

step "Recreating $SERVICE"
# Without --force, compose leaves the container alone when the image and config
# are unchanged, which is the right default: redeploying the same commit should
# not cost an interruption.
FORCE_FLAG=""
[[ "$DO_FORCE" == 1 ]] && FORCE_FLAG="--force-recreate"
rsudo <<EOF
cd "$COMPOSE_DIR"
docker compose up -d --no-deps $FORCE_FLAG "$SERVICE"
EOF

# ------------------------------------------------------------------- verify

rollback() {
  step "Rolling back"
  rsudo <<EOF || info "rollback failed too — the host needs a look"
cd "$COMPOSE_DIR"
if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then
  docker image tag "$IMAGE:previous" "$IMAGE:latest"
fi
cd "$REMOTE_REPO" 2>/dev/null && git reset --hard --quiet "$PREVIOUS_COMMIT" || true
cd "$COMPOSE_DIR"
docker compose up -d --no-deps --force-recreate "$SERVICE"
EOF
  info "restored $(printf '%.7s' "$PREVIOUS_COMMIT")"
  die "deploy rolled back; the site should be back on the previous build"
}

step "Waiting for the container to report healthy"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
health=""
while [[ $(date +%s) -lt $deadline ]]; do
  health="$(rsudo <<EOF
docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo absent
EOF
)"
  health="$(echo "$health" | tail -1 | tr -d '[:space:]')"
  [[ "$health" == "healthy" ]] && break
  if [[ "$health" == "unhealthy" ]]; then
    info "container is unhealthy; recent log:"
    rsudo <<EOF | sed 's/^/      /'
docker logs --tail 30 "$SERVICE" 2>&1
EOF
    rollback
  fi
  sleep 3
done
[[ "$health" == "healthy" ]] || { info "still '$health' after ${HEALTH_TIMEOUT}s"; rollback; }
info "container healthy"

step "Checking the site through $PUBLIC_URL"

probe() {  # description, url, grep pattern
  local body
  body="$(curl -fsS --max-time 20 "$2" 2>/dev/null)" || { info "FAIL  $1 (request failed)"; return 1; }
  if grep -q "$3" <<<"$body"; then info "ok    $1"; else info "FAIL  $1 (unexpected body)"; return 1; fi
}

failed=0
probe "healthz reports the database reachable" "$PUBLIC_URL/healthz" '"ok":true' || failed=1
probe "landing page renders"                   "$PUBLIC_URL/"        'New Budget'  || failed=1

# A feed for a budget that does not exist still stamps the header, so the
# watermark format can be checked without writing anything. Fixed width matters:
# the client compares watermarks as strings.
probe_uuid="00000000-0000-4000-8000-000000000000"
mark="$(curl -fsS -D - -o /dev/null --max-time 20 \
        "$PUBLIC_URL/api/budget/$probe_uuid/Expenses?watermark=" 2>/dev/null \
        | tr -d '\r' | sed -n 's/^[Xx]-[Ww]atermark: //p')"
if [[ "$mark" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{7}Z$ ]]; then
  info "ok    X-Watermark is well formed ($mark)"
else
  info "FAIL  X-Watermark was '${mark:-absent}'"
  failed=1
fi

code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 20 \
        "$PUBLIC_URL/api/budget/$probe_uuid" 2>/dev/null || true)"
if [[ "$code" == "404" ]]; then
  info "ok    unknown budget is 404"
else
  # A 200 or 500 here means the app is answering but the database query path is
  # wrong, which the health check alone would not catch.
  info "FAIL  unknown budget returned $code, expected 404"
  failed=1
fi

[[ "$failed" == 0 ]] || rollback

if [[ "$DO_TEST" == 1 ]]; then
  step "Contract suite against production"
  info "this writes and deletes its own budgets on the live database"
  if command -v node >/dev/null 2>&1 && [[ -d server/node_modules ]]; then
    ( cd server && TEST_BASE_URL="$PUBLIC_URL" node --test test/contract.test.js ) \
      || { info "contract tests failed"; rollback; }
  else
    info "skipped: needs node and server/node_modules (npm install in server/)"
  fi
fi

step "Deployed"
info "$(git rev-parse --short "$COMMIT")  $SUBJECT"
info "previous build is still on the host as $IMAGE:previous"
info "roll back with: $0 --rollback"
