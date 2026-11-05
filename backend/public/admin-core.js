// Shared by every admin page: sign-in check, API calls, navigation, toasts, dialogs.
const NAV = [
  ["home", "/dashboard.html", "Home", "M3 11.5 12 4l9 7.5M5.5 10v10h13V10"],
  ["requests", "/request", "Score requests", "M4 5h16v14H4zM8 10l3 3 5-5"],
  ["players", "/players.html", "Players", "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2"],
  ["news", "/news.html", "News", "M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7"],
  ["content", "/content.html", "Website text", "M4 6h16M4 12h16M4 18h10"],
  ["accounts", "/member-accounts.html", "Member accounts", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6 8-6s7.200 2 8 6"],
  ["logs", "/logs", "Activity", "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
];
const DOCK = ["home", "requests", "players", "news"];

const token = () => sessionStorage.getItem("tcrAdminToken") || "";
if (!token()) location.replace("/login.html");

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const niceName = (name) => String(name || "").toLowerCase();
const number = (value) => Number(value || 0).toLocaleString("en-US");
const average = (m) => (Number(m.games) > 0 ? Number(m.scores) / Number(m.games) : 0);
const thumb = (path) => String(path || "").replace(/assets\/members\/([^/]+)\.png$/, "assets/members/thumbs/$1.webp");
const photoSrc = (path) => { const p = thumb(path); return p.startsWith("/") ? p : `/${p}`; };

async function api(url, options = {}) {
  const opts = { ...options, credentials: "include", headers: { ...(options.headers || {}), Authorization: `Bearer ${token()}` } };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const response = await fetch(url, opts);
  if (response.status === 401) {
    sessionStorage.removeItem("tcrAdminToken");
    location.href = "/login.html";
    throw new Error("Please sign in again.");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "That didn't work. Please try again.");
  return json;
}

function toast(message, isError = false) {
  $(".toast")?.remove();
  const el = document.createElement("div");
  el.className = `toast${isError ? " is-error" : ""}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3500);
}

// Runs an action and reports the outcome, so every button behaves the same way.
async function run(button, action, success) {
  if (button) button.disabled = true;
  try {
    const result = await action();
    if (success) toast(typeof success === "function" ? success(result) : success);
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  } finally {
    if (button) button.disabled = false;
  }
}

function openDialog(html, { sheet = false } = {}) {
  const dialog = document.createElement("dialog");
  if (sheet) dialog.className = "sheet";
  dialog.innerHTML = html;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  $$("[data-close]", dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.showModal();
  return dialog;
}

// Says exactly what will happen. `typed` makes the admin type a word for the riskiest actions.
function confirmAction({ title, body, confirm, cancel = "Cancel", danger = false, typed = "" }) {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = openDialog(`<form method="dialog" class="dialog-body">
      <h2 class="dialog-title">${esc(title)}</h2>
      <p class="dim">${esc(body)}</p>
      ${typed ? `<label class="field">Type ${esc(typed)} to confirm<input data-typed autocomplete="off" required></label>` : ""}
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close>${esc(cancel)}</button>
        <button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes ${typed ? "disabled" : ""}>${esc(confirm)}</button>
      </div></form>`);
    const yes = $("[data-yes]", dialog);
    $("[data-typed]", dialog)?.addEventListener("input", (event) => { yes.disabled = event.target.value.trim() !== typed; });
    $("form", dialog).addEventListener("submit", () => { answer = true; });
    dialog.addEventListener("close", () => resolve(answer));
  });
}

function icon(path) {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

async function signOut() {
  try { await api("/api/admin/logout", { method: "POST" }); } catch { /* signing out anyway */ }
  sessionStorage.removeItem("tcrAdminToken");
  location.href = "/login.html";
}

function moreMenu(current) {
  const links = NAV.filter(([id]) => !DOCK.includes(id)).map(([id, href, label]) => `<a class="btn ${id === current ? "btn-primary" : "btn-secondary"} btn-full" href="${href}">${label}</a>`).join("");
  const dialog = openDialog(`<div class="dialog-body"><h2 class="dialog-title">More</h2>${links}
    <a class="btn btn-secondary btn-full" href="https://teamclassicrollers.club" target="_blank" rel="noopener">View website</a>
    <button type="button" class="btn btn-secondary btn-full" data-out>Log out</button>
    <button type="button" class="btn btn-secondary btn-full" data-close>Close</button></div>`);
  $("[data-out]", dialog).addEventListener("click", signOut);
}

function mountShell() {
  const current = document.body.dataset.page;
  const links = NAV.map(([id, href, label, path]) => `<a class="side-link" href="${href}" ${id === current ? 'aria-current="page"' : ""}>${icon(path)}<span>${label}</span>${id === "requests" ? '<span class="count" data-pending hidden></span>' : ""}</a>`).join("");
  const side = document.createElement("aside");
  side.className = "side";
  side.innerHTML = `<a class="side-brand" href="/dashboard.html"><img src="/assets/opt/logo.webp" alt="Team Classic Rollers"><span>Admin</span></a>
    <nav aria-label="Admin">${links}</nav>
    <div class="side-foot">
      <a class="side-link" href="https://teamclassicrollers.club" target="_blank" rel="noopener">${icon("M14 4h6v6M20 4l-9 9M18 14v6H4V6h6")}<span>View website</span></a>
      <button type="button" class="side-link" data-out>${icon("M9 4H4v16h5M15 8l4 4-4 4M19 12H9")}<span>Log out</span></button>
    </div>`;
  document.body.prepend(side);
  $("[data-out]", side).addEventListener("click", signOut);

  const dock = document.createElement("nav");
  dock.className = "dock";
  dock.setAttribute("aria-label", "Admin");
  dock.innerHTML = NAV.filter(([id]) => DOCK.includes(id)).map(([id, href, label, path]) => `<a href="${href}" ${id === current ? 'aria-current="page"' : ""}>${icon(path)}<span>${id === "requests" ? "Requests" : label}</span>${id === "requests" ? '<span class="count" data-pending hidden></span>' : ""}</a>`).join("")
    + `<button type="button" data-more ${DOCK.includes(current) ? "" : 'aria-current="page"'}>${icon("M4 7h16M4 12h16M4 17h16")}<span>More</span></button>`;
  document.body.append(dock);
  $("[data-more]", dock).addEventListener("click", () => moreMenu(current));
}

async function refreshPending() {
  try {
    const { requests } = await api("/api/admin/game-requests");
    const pending = (requests || []).filter((r) => r.status === "pending").length;
    $$("[data-pending]").forEach((el) => { el.textContent = pending > 99 ? "99+" : pending; el.hidden = pending === 0; });
    document.title = document.title.replace(/^\(\d+\+?\) /, "");
    if (pending) document.title = `(${pending}) ${document.title}`;
    return pending;
  } catch { return 0; }
}

if (token()) {
  mountShell();
  refreshPending();
  setInterval(refreshPending, 20000);
}
