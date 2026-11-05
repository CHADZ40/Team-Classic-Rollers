// Players: find someone, add a score, or edit everything about them in one panel.
let members = [];
let squad = "all";

const memberUrl = (id) => `/api/admin/members/${encodeURIComponent(id)}`;
const findMember = (id) => members.find((m) => m.id === id);

async function load() {
  const data = await api("/api/admin/site-data");
  members = data.members.filter((m) => m.active !== false);
  render();
}

function render() {
  const needle = $("#search").value.trim().toLowerCase();
  const order = { "Team A": 0, "Team B": 1, "Team C": 2 };
  const list = members
    .filter((m) => (squad === "all" || m.team === squad) && m.name.toLowerCase().includes(needle))
    .sort((a, b) => (order[a.team] ?? 3) - (order[b.team] ?? 3) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  $("#noPlayers").hidden = list.length > 0;
  $("#players").innerHTML = list.map((m) => {
    const avg = average(m);
    const percent = Math.min(100, Math.max(0, (avg / (Number(m.goal) || 1)) * 100));
    return `<article class="player" data-id="${esc(m.id)}">
      <img src="${esc(photoSrc(m.photo))}" alt="" loading="lazy">
      <div><div class="player-name">${esc(niceName(m.name))}</div><div class="player-meta">${esc(m.team)}</div></div>
      <div class="player-stats">
        <div>${m.games ? `<b>${avg.toFixed(1)}</b> average · ${number(m.games)} ${Number(m.games) === 1 ? "game" : "games"} · ${number(m.scores)} pins` : '<span class="dim">No games yet</span>'}</div>
        <div class="bar" title="${percent.toFixed(0)}% of ${esc(m.goal)} goal"><i style="width:${percent}%"></i></div>
      </div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-score>Add score</button>
        <button type="button" class="btn btn-secondary" data-edit>Edit</button>
      </div>
    </article>`;
  }).join("");
  $$("#players img").forEach((img) => img.addEventListener("error", () => {
    const m = findMember(img.closest("[data-id]").dataset.id);
    const full = m.photo.startsWith("/") ? m.photo : `/${m.photo}`;
    if (!img.src.endsWith(encodeURI(full))) img.src = full;
  }, { once: true }));
  $$("#players [data-score]").forEach((b) => b.addEventListener("click", () => addScore(findMember(b.closest("[data-id]").dataset.id))));
  $$("#players [data-edit]").forEach((b) => b.addEventListener("click", () => editPlayer(findMember(b.closest("[data-id]").dataset.id))));
}

function addScore(m) {
  const dialog = openDialog(`<form class="dialog-body">
    <h2 class="dialog-title">Add score for <span style="text-transform:capitalize">${esc(niceName(m.name))}</span></h2>
    <div class="form-2">
      <label class="field">Games bowled<input name="games" type="number" inputmode="numeric" min="0" step="1" required placeholder="3"></label>
      <label class="field">Total pins<input name="pins" type="number" inputmode="numeric" min="0" step="1" required placeholder="487"></label>
    </div>
    <label class="field">Note <small>Optional. Shown in Activity and score history.</small><input name="note" maxlength="300" placeholder="e.g. Weekly training"></label>
    <div class="preview" data-preview hidden></div>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary" data-save>Add score</button>
    </div></form>`);
  const form = $("form", dialog);
  const update = () => {
    const games = Number(form.elements.games.value) || 0;
    const pins = Number(form.elements.pins.value) || 0;
    const ready = form.elements.games.value !== "" && form.elements.pins.value !== "";
    const preview = $("[data-preview]", dialog);
    preview.hidden = !ready;
    if (!ready) return;
    const nextGames = Number(m.games) + games;
    const nextPins = Number(m.scores) + pins;
    preview.innerHTML = `New totals: <b>${number(nextGames)}</b> games, <b>${number(nextPins)}</b> pins, average <b>${nextGames ? (nextPins / nextGames).toFixed(1) : "0.0"}</b>`;
    $("[data-save]", dialog).textContent = `Add ${number(games)} ${games === 1 ? "game" : "games"} and ${number(pins)} pins`;
  };
  form.addEventListener("input", update);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const games = Math.floor(Number(form.elements.games.value));
    const pins = Math.floor(Number(form.elements.pins.value));
    if (games < 1 && pins < 1) { toast("Enter at least one game or pin.", true); return; }
    const reason = form.elements.note.value.trim() || "Score added by admin";
    const ok = await run($("[data-save]", dialog), async () => {
      if (games) await api(`${memberUrl(m.id)}/adjust`, { method: "POST", body: { field: "games", amount: games, reason } });
      if (pins) await api(`${memberUrl(m.id)}/adjust`, { method: "POST", body: { field: "scores", amount: pins, reason } });
    }, `Score added for ${m.name}.`);
    if (ok) { dialog.close(); await load(); }
  });
}

function editPlayer(m) {
  const dialog = openDialog(`<div class="dialog-body">
    <h2 class="dialog-title" style="text-transform:capitalize">${esc(niceName(m.name))}</h2>
    <div class="photo-row">
      <img src="${esc(photoSrc(m.photo))}" alt="" data-photo-preview>
      <div>
        <button type="button" class="btn btn-secondary" data-photo>Change photo</button>
        <p class="dim small" style="margin-top:6px">PNG, JPG or WEBP, up to 5 MB. It saves straight away.</p>
      </div>
    </div>
    <form class="form">
      <div class="form-2">
        <label class="field">Name<input name="name" required maxlength="100" value="${esc(m.name)}"></label>
        <label class="field">Squad<select name="team">${["Team A", "Team B", "Team C"].map((t) => `<option ${t === m.team ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="field">Biography<textarea name="bio" rows="3" maxlength="2000">${esc(m.bio || "")}</textarea></label>
      <label class="field">Achievements <small>One per line.</small><textarea name="achievements" rows="3">${esc((m.achievements || []).join("\n"))}</textarea></label>
      <div class="form-2">
        <label class="field">Total games <small>Only to correct a mistake.</small><input name="games" type="number" min="0" step="1" value="${esc(m.games)}"></label>
        <label class="field">Total pins <small>Only to correct a mistake.</small><input name="scores" type="number" min="0" step="1" value="${esc(m.scores)}"></label>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-close>Close without saving</button>
        <button type="submit" class="btn btn-primary" data-save>Save changes</button>
      </div>
    </form>
    <section class="danger-zone">
      <h3>Danger zone</h3>
      <div class="btn-row">
        <button type="button" class="btn btn-danger-quiet" data-reset>Reset stats to zero</button>
        <button type="button" class="btn btn-danger-quiet" data-remove>Remove from roster</button>
      </div>
    </section>
  </div>`, { sheet: true });

  $("[data-photo]", dialog).addEventListener("click", (event) => {
    const button = event.currentTarget;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast("Photo must be 5 MB or smaller.", true); return; }
      const body = new FormData();
      body.append("photo", file);
      let saved = null;
      const ok = await run(button, async () => { saved = await api(memberUrl(m.id), { method: "PATCH", body }); }, `Photo updated for ${m.name}.`);
      if (!ok) return;
      m.photo = saved.member.photo;
      $("[data-photo-preview]", dialog).src = m.photo;
      render();
    });
    input.click();
  });

  $("form", dialog).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      name: form.elements.name.value, team: form.elements.team.value, bio: form.elements.bio.value, achievements: form.elements.achievements.value,
      games: Number(form.elements.games.value) || 0, scores: Number(form.elements.scores.value) || 0,
    };
    const ok = await run($("[data-save]", dialog), () => api(memberUrl(m.id), { method: "PATCH", body }), "Changes saved.");
    if (ok) { dialog.close(); await load(); }
  });

  $("[data-reset]", dialog).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const yes = await confirmAction({ title: `Reset ${m.name}'s stats?`, body: "Their games and pins go back to zero. This can't be undone.", confirm: "Reset to zero", cancel: "Keep stats", danger: true });
    if (!yes) return;
    if (await run(button, () => api(`${memberUrl(m.id)}/reset-stats`, { method: "POST", body: {} }), `${m.name}'s stats were reset.`)) { dialog.close(); await load(); }
  });

  $("[data-remove]", dialog).addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const yes = await confirmAction({ title: `Remove ${m.name}?`, body: "They'll disappear from the public roster and rankings.", confirm: "Remove player", cancel: "Keep player", danger: true });
    if (!yes) return;
    if (await run(button, () => api(memberUrl(m.id), { method: "DELETE" }), `${m.name} was removed.`)) { dialog.close(); await load(); }
  });
}

function newPlayer() {
  const dialog = openDialog(`<form class="dialog-body">
    <h2 class="dialog-title">Add a player</h2>
    <label class="field">Name<input name="name" required maxlength="100" placeholder="Full name"></label>
    <label class="field">Squad<select name="team"><option>Team A</option><option>Team B</option><option selected>Team C</option></select></label>
    <label class="field">Photo <small>Optional. You can add it later.</small><input type="file" name="photo" accept="image/png,image/jpeg,image/webp"></label>
    <div class="dialog-actions">
      <button type="button" class="btn btn-secondary" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary" data-save>Add to roster</button>
    </div></form>`);
  $("form", dialog).addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    if (await run($("[data-save]", dialog), () => api("/api/admin/members", { method: "POST", body }), `${body.get("name")} was added.`)) { dialog.close(); await load(); }
  });
}

$("#search").addEventListener("input", render);
$$("#squads button").forEach((b) => b.addEventListener("click", () => {
  squad = b.dataset.squad;
  $$("#squads button").forEach((other) => other.setAttribute("aria-pressed", String(other === b)));
  render();
}));
$("#newPlayer").addEventListener("click", newPlayer);
$("#resetAll").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const yes = await confirmAction({ title: "Reset every player's scores?", body: "All games and pins for every player go back to zero. This can't be undone.", confirm: "Reset all scores", cancel: "Keep scores", danger: true, typed: "RESET" });
  if (!yes) return;
  if (await run(button, () => api("/api/admin/reset-all-scores", { method: "POST", body: {} }), "All scores were reset.")) await load();
});
load().then(() => { if (location.hash === "#new") newPlayer(); }).catch((error) => toast(error.message, true));
