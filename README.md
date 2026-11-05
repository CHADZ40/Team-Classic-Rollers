# Team Classic Rollers v0.1.3

## Visual refresh
- Updated the public site to the existing navy, white and yellow brand theme.
- Simplified the homepage hero copy and added responsive team highlight counters.
- Added lightweight scroll-reveal effects, gentle hero motion, team card hover effects, and a mobile-friendly photo gallery with an accessible lightbox.
- Added a compact latest-updates section populated from the existing public API.
- Updated all public page footers to show the logo, `Copyright © Team Classic Rollers 2025`, and social links without footer navigation.
- Preserved the existing member roster, admin dashboard/backend features, API endpoints, and persistent data configuration.

## Deploy note
Back up `/var/lib/tcr/site-data.json`, `/var/lib/tcr/logs.json` if present, and your current website folder before deployment. Keep the existing backend `.env` and persistent data files.

# Team Classic Rollers v0.0.8

## Project structure
- Public website: `frontend/`, a React app built with Vite. Source is in `frontend/src/`, static files in `frontend/public/`.
  - Run locally: `cd frontend && npm install && npm run dev`. Reads real stats from the live API; writes are blocked locally.
  - Test the scoring logic: `npm test`.
  - Build for release: `npm run build`, then serve `frontend/dist/` (see `deploy/teamclassicrollers.club.nginx.conf`).
  - Keep `frontend/public/assets/members/*.png` and their filenames. Member records point to them. Smaller copies are in `assets/members/thumbs/` and `assets/opt/`.
- Admin dashboard: `admin/`, a React app built with Vite.
  - Build for release: `cd admin && npm install && npm run build`. It builds into `backend/admin-dist/`, which the backend serves. It isn't in Git, so build before uploading `backend/`.
  - Run locally: start the backend on port 3100, then `npm run dev` in `admin/`.
- VPS backend: `backend/` (initial data in `backend/seed/`).
- Member sign-in: `/login` on the public site. A member is linked once with an admin's verification link, then sends `/login` to the Telegram bot for a new sign-in link whenever they need one. Set `TELEGRAM_BOT_USERNAME` in `backend/.env` so the page can link to the bot.
- Deployment examples: `deploy/`.

## Telegram score alerts
New score requests are sent to the chats in `TELEGRAM_ADMIN_CHAT_IDS` with Approve and Reject buttons.
1. In the chat you want alerts in, add the bot if it's a group, then send `/chatid`.
2. Add that number to `TELEGRAM_ADMIN_CHAT_IDS` in `backend/.env`. Separate several with commas. `TELEGRAM_BOT_TOKEN` must also be set there.
3. Restart the backend, then use **Send a test message** on the admin home page.

Anyone in a listed group can approve, so only list chats you trust. Public form names aren't verified, so check the proof first.

## Admin dashboard
- Admin domain: `https://admin.teamclassicrollers.club`
- Login page: `/login.html`
- Dashboard: `/dashboard.html`
- Set `ADMIN_USER`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `backend/.env`.
- The backend exits on startup if the password or session secret is missing or too short.
- Admin can adjust each member's game and score totals with +1, +3, +5, and -1.
- Admin can edit member name, team, games, and total scores, upload a photo, add a member, and remove a member from the public roster.
- Content editor controls the Home and About page text fields.
- Team A, B, and C remain separated and ordered in the same sequence as the public site.
- Member data is stored on the VPS in `backend/data/site-data.json`, and uploads in `backend/uploads/`.

## Deploy to an Ubuntu VPS
1. Upload the project to `/var/www/teamclassicrollers`.
2. Install Node.js 20 or newer and Nginx.
3. `cd /var/www/teamclassicrollers/backend && npm install`
4. `cp .env.example .env && nano .env`
5. Set a long unique `ADMIN_PASSWORD`, a random `SESSION_SECRET` with at least 32 characters, and `PUBLIC_SITE_ORIGIN` to your public website URL. The default example is `https://teamclassicrollers.club,https://www.teamclassicrollers.club`. If your public site is still hosted on Netlify, add its exact origin to this comma-separated value.
6. Make persistent folders writable by the Node service user:
   `sudo mkdir -p /var/lib/tcr/uploads /var/lib/tcr`
   `sudo chown -R $USER:$USER /var/lib/tcr`
7. Copy the seed data:
   `sudo mkdir -p /var/lib/tcr`
   `cp seed/site-data.json /var/lib/tcr/site-data.json`
8. Start backend:
   `pm2 start ecosystem.config.cjs`
   `pm2 save`
9. Copy `deploy/admin.teamclassicrollers.club.nginx.conf` to `/etc/nginx/sites-available/admin.teamclassicrollers.club`, enable it with a symlink in `sites-enabled`, then run `sudo nginx -t && sudo systemctl reload nginx`.
10. Point the DNS A record for `admin.teamclassicrollers.club` to the VPS public IP.
11. Run Certbot for HTTPS:
    `sudo certbot --nginx -d admin.teamclassicrollers.club`

## Public website API connection
The public website reads member stats and editable content from `https://admin.teamclassicrollers.club/api/public/site-data`. Set `PUBLIC_SITE_ORIGIN` to the exact public website origin or comma-separated list of origins in `backend/.env`. Keep the backend domain HTTPS.


## v0.1.0 additions
- Team breakdown and dashboard activity/news counts.
- Score adjustment reason field in audit logs and confirmation for changes of 100+ points.
- Admin news, event, tournament and results publishing.
- Member biography and achievements editor; public profile details and recent score history.
- News updates are served from the public site-data API and displayed on public pages.


## v0.1.3 · Game score requests
- New public submission form at `https://games.teamclassicrollers.club` with name, games to add, total score to add, and up to six optional image proofs.
- Requests are stored separately in `/var/lib/tcr/game-requests.json`.
- Admin review queue at `https://admin.teamclassicrollers.club/request` supports approve/reject. Approval requires choosing an active roster member and adds the submitted games and scores to their totals.
- Proof uploads are stored in the existing persistent upload directory.
- Add `https://games.teamclassicrollers.club` to `PUBLIC_SITE_ORIGIN` in the existing backend `.env`. Do not replace your existing `.env` or persistent data when deploying.
- Nginx example for the new `games` subdomain is in `deploy/games.teamclassicrollers.club.nginx.conf`.


## v0.1.3 changes
- Improved readable text colors and member profile contrast.
- Replaced homepage Team Moments gallery with live Top 3 average-score rankings for Teams A, B, and C.
- Member score history endpoint returns all matching recorded score changes.
- Average-score goal advances in 25-point steps when the current goal is reached.
- Compact request status badges and red pending-request navigation counter.


## v0.1.3 updates
- Removed browser prompt dialogs from quick game adjustments and score add/remove actions.
- Removed the Quick Adjust column; added per-member statistics reset.
- Added admin menu for small screens, larger admin/public logos, and responsive layouts.
- Added admin controls to reset all member games/scores and clear activity logs.
- Added protected admin API endpoints for the reset actions and audit records for member/global statistics resets.
