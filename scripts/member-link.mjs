#!/usr/bin/env node
// Local testing only: prints a member sign-in link, standing in for the Telegram bot.
// Needs scripts/test-attendance.sh running. Usage: node scripts/member-link.mjs "sovann"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "backend", "data");
const search = (process.argv[2] || "").trim().toLowerCase();

let members;
try { members = JSON.parse(fs.readFileSync(path.join(data, "site-data.json"), "utf8")).members.filter((m) => m.active !== false); }
catch { console.error("No local data yet. Start scripts/test-attendance.sh first."); process.exit(1); }

const found = members.filter((m) => m.name.toLowerCase().includes(search));
if (!search || found.length !== 1) {
  console.error(search && !found.length ? `No member matches "${search}".` : "Say which member, for example:");
  for (const m of (found.length ? found : members)) console.error(`  node scripts/member-link.mjs "${m.name}"   (${m.team})`);
  process.exit(1);
}
const member = found[0];

// Link a pretend Telegram account to this member, as the bot would after verifying them.
const accountsFile = path.join(data, "member-accounts.json");
const accounts = fs.existsSync(accountsFile) ? JSON.parse(fs.readFileSync(accountsFile, "utf8")) : [];
const telegramId = `local-${member.id}`;
if (!accounts.some((a) => a.telegramId === telegramId)) {
  accounts.push({ telegramId, telegramUsername: "local_test", memberId: String(member.id), verifiedAt: new Date().toISOString(), profile: {} });
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
}

let response;
try {
  response = await fetch("http://127.0.0.1:3100/api/internal/telegram/login", {
    method: "POST", headers: { "Content-Type": "application/json", "x-tcr-internal-secret": "local-test" }, body: JSON.stringify({ telegramId }),
  });
} catch { console.error("The backend isn't running. Start scripts/test-attendance.sh first."); process.exit(1); }
const json = await response.json();
if (!response.ok) { console.error(json.error || "Couldn't make a link."); process.exit(1); }
console.log(`Sign-in link for ${json.name} (${member.team}). It works once, for 5 minutes:\n\n  ${json.loginUrl}\n`);
