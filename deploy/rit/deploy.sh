#!/usr/bin/env bash
# Pull main and redeploy only when origin/main has new commits.
# Run by deploy/rit/maple-deploy.timer (or cron) every minute.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/maple/app}"
CONFIG_DIR="${MAPLE_CONFIG_DIR:-$HOME/maple/config}"
BRANCH="${BRANCH:-main}"
export MAPLE_CONFIG_DIR="$CONFIG_DIR"

exec 9>"$HOME/maple/deploy.lock"
flock -n 9 || exit 0   # a deploy is already running

cd "$REPO_DIR"
git fetch --quiet origin "$BRANCH"
remote_sha=$(git rev-parse "origin/$BRANCH")
# Track the last SHA that deployed successfully (not just what is checked out),
# so a failed deploy is retried on the next tick.
STATE_FILE="$HOME/maple/deployed.sha"
deployed_sha=$(cat "$STATE_FILE" 2>/dev/null || true)
[ "$deployed_sha" = "$remote_sha" ] && exit 0

echo "$(date -u +%FT%TZ) deploying ${deployed_sha:-none} -> $remote_sha"
git checkout --quiet "$BRANCH"
git merge --ff-only "origin/$BRANCH"

COMPOSE=(docker compose --env-file "$CONFIG_DIR/compose.env" -f docker-compose.yml -f deploy/rit/compose.rit.yml)
"${COMPOSE[@]}" up -d --build --remove-orphans

# Wait for the API healthcheck; fail loudly so the journal/log shows it.
for _ in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q api)" 2>/dev/null || true)
  [ "$status" = healthy ] && { echo "$remote_sha" > "$STATE_FILE"; echo "deploy ok: $remote_sha"; docker image prune -f >/dev/null; exit 0; }
  sleep 5
done
echo "deploy FAILED: api not healthy after $remote_sha" >&2
exit 1
