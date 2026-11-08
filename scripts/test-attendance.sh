#!/usr/bin/env bash
# Runs the admin, the public website and face check-in on this computer, with throwaway data
# in backend/data and Telegram turned off. For a member sign-in link, run scripts/member-link.mjs.
# Works from any folder. Press Ctrl+C to stop everything.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASSWORD=local-test-password
PIDS=()

stop() { [[ ${#PIDS[@]} -gt 0 ]] && kill "${PIDS[@]}" 2>/dev/null; }
trap stop EXIT
trap 'exit 0' INT TERM

for port in 3100 3200 5174 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Close whatever is running there, or the terminal tab you started earlier, then try again."
    exit 1
  fi
done
[[ -x "$ROOT/backend/face-service/.venv/bin/python" && -f "$ROOT/backend/face-service/models/face_recognition_sface_2021dec.onnx" ]] || "$ROOT/backend/face-service/setup.sh" || exit 1
[[ -d "$ROOT/backend/node_modules" ]] || (cd "$ROOT/backend" && npm install) || exit 1
[[ -d "$ROOT/admin/node_modules" ]] || (cd "$ROOT/admin" && npm install) || exit 1
[[ -d "$ROOT/frontend/node_modules" ]] || (cd "$ROOT/frontend" && npm install) || exit 1

DATA="$ROOT/backend/data"
mkdir -p "$DATA/uploads"

(cd "$ROOT/backend/face-service" && exec .venv/bin/python app.py) &
PIDS+=($!)
(cd "$ROOT/backend" && DATA_FILE="$DATA/site-data.json" UPLOAD_DIR="$DATA/uploads" LOG_FILE="$DATA/logs.json" \
  REQUESTS_FILE="$DATA/game-requests.json" TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_CHAT_IDS= \
  TELEGRAM_INTERNAL_SECRET=local-test MEMBER_SITE_ORIGIN=http://localhost:5173 PUBLIC_SITE_ORIGIN=http://localhost:5173 \
  NODE_ENV=development ADMIN_PASSWORD="$PASSWORD" exec node server.js) &
PIDS+=($!)
(cd "$ROOT/admin" && exec node_modules/.bin/vite --port 5174 --strictPort) &
PIDS+=($!)
(cd "$ROOT/frontend" && TCR_LOCAL_API=http://127.0.0.1:3100 exec node_modules/.bin/vite --port 5173 --strictPort) &
PIDS+=($!)

echo "Starting. The face service can take about 15 seconds..."
for _ in $(seq 1 60); do
  curl -s --max-time 1 http://127.0.0.1:3200/health >/dev/null && curl -s --max-time 1 http://127.0.0.1:3100/api/health >/dev/null && curl -s --max-time 1 http://localhost:5174/login >/dev/null && curl -s --max-time 1 http://localhost:5173/ >/dev/null && {
    echo
    echo "Ready."
    echo "  Admin:    http://localhost:5174/login   (admin / $PASSWORD)"
    echo "  Website:  http://localhost:5173"
    echo "  Member sign-in link: in another terminal, run"
    echo "    node \"$ROOT/scripts/member-link.mjs\" \"part of a member's name\""
    echo "Press Ctrl+C here to stop."
    wait
    exit 0
  }
  sleep 1
done
echo "Something didn't start. Send Claude the messages above."
exit 1
