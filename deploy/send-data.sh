#!/usr/bin/env bash
# Run this on the Mac. Copies the admin's data to the server: registered faces, check-in photos,
# the roster, attendance, Telegram links and uploaded photos.
#
#   deploy/send-data.sh                         sends to root@178.238.227.109
#   deploy/send-data.sh root@other.server       sends somewhere else
#
# The current data is in ~/TCR-data (made by scripts/start-admin.sh). Faces, Telegram links and
# training sessions that only exist in the older backend/data folder are merged in, so nobody
# who was scanned has to scan again. Where both have the same person, the newer scan wins.
#
# Nothing on the Mac is changed or deleted. On the server it writes to /var/lib/tcr, and it
# refuses to run if faces are already there, so it can never overwrite scans made on the server.
set -euo pipefail

SERVER="${1:-root@178.238.227.109}"
KEY="${SSH_KEY:-$HOME/Documents/id_Ed25519.pem}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURRENT="$HOME/TCR-data"
OLDER="$ROOT/backend/data"
REMOTE=/var/lib/tcr
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes)

[[ -f "$CURRENT/face-embeddings.json" ]] || { echo "No faces found in $CURRENT."; exit 1; }

if "${SSH[@]}" "$SERVER" "test -s $REMOTE/face-embeddings.json && [ \"\$(cat $REMOTE/face-embeddings.json)\" != '[]' ]"; then
  echo "The server already has faces in $REMOTE. Stopping so they aren't overwritten."
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
chmod 700 "$STAGE"

# admin-settings.env holds the laptop's password. The server has its own in backend/.env.
rsync -a --exclude admin-settings.env --exclude '*.tmp' "$CURRENT/" "$STAGE/"

if [[ -d "$OLDER" ]]; then
  [[ -d "$OLDER/checkin-photos" ]] && rsync -a --ignore-existing "$OLDER/checkin-photos/" "$STAGE/checkin-photos/"
  python3 -I - "$STAGE" "$OLDER" <<'PY'
import json, os, sys
stage, older = sys.argv[1], sys.argv[2]

def load(folder, name):
    try:
        with open(os.path.join(folder, name)) as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def merge(name, key, newer_field=None):
    current, old = load(stage, name), load(older, name)
    by_key = {str(item[key]): item for item in current}
    added = 0
    for item in old:
        k = str(item[key])
        if k not in by_key:
            by_key[k] = item
            added += 1
        elif newer_field and item.get(newer_field, "") > by_key[k].get(newer_field, ""):
            by_key[k] = item
    path = os.path.join(stage, name)
    with open(path, "w") as f:
        json.dump(list(by_key.values()), f, indent=2)
    os.chmod(path, 0o600)
    print(f"{name}: {len(by_key)} total, {added} added from the older folder")

merge("face-embeddings.json", "memberId", "updatedAt")
merge("member-accounts.json", "telegramId", "verifiedAt")
merge("training-sessions.json", "id")
merge("training-attendance.json", "id")
PY
fi

echo "Sending to $SERVER:$REMOTE"
"${SSH[@]}" "$SERVER" "mkdir -p $REMOTE && chmod 700 $REMOTE"
rsync -a -e "${SSH[*]}" "$STAGE/" "$SERVER:$REMOTE/"
"${SSH[@]}" "$SERVER" "chown -R root:root $REMOTE && chmod 700 $REMOTE"
echo "Done. Restart the admin on the server to load it: pm2 restart tcr-backend"
