#!/usr/bin/env bash
# Starts the admin on this laptop. Every change you save is published: it goes to GitHub, and
# Vercel updates the website about a minute later. Keep this window open while you work.
# Your data lives in ~/TCR-data. Only public information is ever published.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$HOME/TCR-data"
SETTINGS="$DATA/admin-settings.env"
PIDS=()
stop() { [[ ${#PIDS[@]} -gt 0 ]] && kill "${PIDS[@]}" 2>/dev/null; }
trap stop EXIT
trap 'exit 0' INT TERM HUP

cd "$ROOT" || exit 1
for port in 3100 3200; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "The admin seems to be running already (port $port is in use). Open http://localhost:3100"
    exit 1
  fi
done

mkdir -p "$DATA/uploads" && chmod 700 "$DATA"

# First run: choose the admin password. It's kept only on this laptop.
if [[ ! -f "$SETTINGS" ]]; then
  echo "First time setup. Choose an admin password (at least 12 characters)."
  while :; do
    read -r -s -p "Password: " pw1; echo
    read -r -s -p "Again: " pw2; echo
    [[ "$pw1" == "$pw2" && ${#pw1} -ge 12 ]] && break
    echo "They didn't match or were too short. Try again."
  done
  umask 077
  printf 'ADMIN_PASSWORD=%q\nSESSION_SECRET=%s\n' "$pw1" "$(openssl rand -hex 32)" > "$SETTINGS"
  unset pw1 pw2
fi
set -a; source "$SETTINGS"; set +a

# A new laptop starts from what the website already shows, rather than an empty roster.
if [[ ! -f "$DATA/site-data.json" && -f "$ROOT/frontend/public/data/site-data.json" ]]; then
  node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1]));delete d.history;delete d.publishedAt;fs.writeFileSync(process.argv[2],JSON.stringify(d,null,2))' \
    "$ROOT/frontend/public/data/site-data.json" "$DATA/site-data.json"
fi

echo "Getting the latest code…"
git pull --ff-only --quiet || echo "Couldn't update from GitHub. Carrying on with what's here."
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || echo "Note: switch to the main branch, or your changes won't reach the website."

[[ -d backend/node_modules ]] || (cd backend && npm ci) || exit 1
[[ -d admin/node_modules ]] || (cd admin && npm ci) || exit 1
(cd admin && npm run build --silent >/dev/null) || { echo "The admin didn't build."; exit 1; }

# Face check-in is optional. Without it, attendance can still be marked by hand.
if [[ -x backend/face-service/.venv/bin/python ]] || backend/face-service/setup.sh >/dev/null 2>&1; then
  (cd backend/face-service && exec .venv/bin/python app.py >/dev/null 2>&1) &
  PIDS+=($!)
else
  echo "Face check-in isn't set up on this laptop. Everything else works."
fi

(cd backend && NODE_ENV=development HOST=127.0.0.1 PORT=3100 \
  DATA_FILE="$DATA/site-data.json" UPLOAD_DIR="$DATA/uploads" LOG_FILE="$DATA/logs.json" REQUESTS_FILE="$DATA/game-requests.json" \
  TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_CHAT_IDS= TELEGRAM_INTERNAL_SECRET= PUBLIC_SITE_ORIGIN= \
  PUBLISH_TO_GIT=1 exec node server.js) &
PIDS+=($!)

for _ in $(seq 1 30); do
  if curl -s --max-time 1 http://127.0.0.1:3100/api/health >/dev/null; then
    echo
    echo "Admin is ready: http://localhost:3100"
    echo "Changes you save go to the website about a minute later."
    echo "Leave this window open. Press Ctrl+C or close it to stop."
    open "http://localhost:3100/login" 2>/dev/null
    wait
    exit 0
  fi
  sleep 1
done
echo "The admin didn't start. Send the messages above to Claude."
exit 1
