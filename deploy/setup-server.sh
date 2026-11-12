#!/usr/bin/env bash
# Sets up the admin, the Telegram bot and face check-in on a new Ubuntu server. Safe to run again.
#
#   git clone https://github.com/CHADZ40/Team-Classic-Rollers.git /var/www/teamclassicrollers
#   bash /var/www/teamclassicrollers/deploy/setup-server.sh
#
# The public website stays on Vercel. Like the laptop admin, the server pushes each public change
# to GitHub and Vercel rebuilds the site. All private data (faces, check-in photos, accounts)
# lives in /var/lib/tcr, outside the code, and this script never deletes or replaces it.
# To bring the faces over from the Mac, run deploy/send-data.sh there.
set -euo pipefail

APP=/var/www/teamclassicrollers
DATA=/var/lib/tcr
ENV_FILE="$APP/backend/.env"

[[ $EUID -eq 0 ]] || { echo "Run this as root."; exit 1; }
[[ -d "$APP/.git" ]] || { echo "Clone the repo to $APP first (see the top of this file)."; exit 1; }

echo "Installing system packages…"
apt-get update -qq
apt-get install -y -qq git nginx python3-venv curl rsync ca-certificates openssl >/dev/null
if ! command -v node >/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 20 )); then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
command -v pm2 >/dev/null || npm install -g pm2 --silent

mkdir -p "$DATA/uploads"
chmod 700 "$DATA"

# First run: make backend/.env with fresh secrets, then stop so the password can be set.
if [[ ! -f "$ENV_FILE" ]]; then
  ( umask 077
    sed -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" \
        -e "s|^TELEGRAM_INTERNAL_SECRET=.*|TELEGRAM_INTERNAL_SECRET=$(openssl rand -hex 32)|" \
        "$APP/backend/.env.example" > "$ENV_FILE" )
  echo
  echo "Created $ENV_FILE. Open it (nano $ENV_FILE), set ADMIN_PASSWORD and the"
  echo "Telegram and SCORE_INBOX values, then run this script again."
  exit 0
fi
if grep -q '^ADMIN_PASSWORD=replace-with' "$ENV_FILE"; then
  echo "Set ADMIN_PASSWORD in $ENV_FILE first, then run this again."
  exit 1
fi

# Publishing pushes to GitHub, which needs a deploy key with write access.
if grep -q '^PUBLISH_TO_GIT=1' "$ENV_FILE" && [[ ! -f /root/.ssh/github ]]; then
  ssh-keygen -t ed25519 -f /root/.ssh/github -N "" -C "tcr-server" -q
  printf 'Host github.com\n  IdentityFile /root/.ssh/github\n  IdentitiesOnly yes\n' >> /root/.ssh/config
  ssh-keyscan -q github.com >> /root/.ssh/known_hosts 2>/dev/null
  git -C "$APP" remote set-url origin git@github.com:CHADZ40/Team-Classic-Rollers.git
  echo
  echo "Add this key on GitHub: the repo > Settings > Deploy keys > Add, and tick 'Allow write access'."
  cat /root/.ssh/github.pub
  echo
  read -r -p "Press Enter when it's added… " _
fi
git -C "$APP" config user.name >/dev/null || git -C "$APP" config user.name "TCR admin server"
git -C "$APP" config user.email >/dev/null || git -C "$APP" config user.email "admin@teamclassicrollers.club"

echo "Getting the latest code…"
git -C "$APP" pull --ff-only --quiet || echo "Couldn't update from GitHub. Carrying on with what's here."

echo "Building the admin…"
(cd "$APP/backend" && npm ci --silent)
(cd "$APP/admin" && npm ci --silent && npm run build --silent >/dev/null)

echo "Setting up face check-in…"
"$APP/backend/face-service/setup.sh"

# The bot needs a token. Without one, everything else still runs.
apps=tcr-backend,tcr-face
grep -q '^TELEGRAM_BOT_TOKEN=[0-9]' "$ENV_FILE" && apps="$apps,tcr-telegram-bot"
(cd "$APP/backend" && pm2 startOrReload ecosystem.config.cjs --only "$apps" --update-env)
pm2 save --force >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null

cp "$APP/deploy/admin.teamclassicrollers.club.nginx.conf" /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/admin.teamclassicrollers.club.nginx.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t -q && systemctl reload nginx

faces=$(python3 -c "import json;print(len(json.load(open('$DATA/face-embeddings.json'))))" 2>/dev/null || echo 0)
echo
echo "Running: $apps"
echo "Faces registered on this server: $faces"
[[ "$faces" == 0 ]] && echo "To bring the faces from the Mac, run deploy/send-data.sh there."
echo "Admin: https://admin.teamclassicrollers.club (once that name points at this server)"
