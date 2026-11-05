// Activity: a readable history of admin changes.
const LABELS = {
  game_request_submitted: "Score request sent", game_request_approved: "Score request approved", game_request_rejected: "Score request rejected",
  score_added: "Pins added", score_removed: "Pins removed", games_adjusted: "Games changed", member_stats_set: "Stats corrected", member_stats_reset: "Stats reset",
  member_added: "Player added", member_removed: "Player removed", member_updated: "Player updated", website_content_updated: "Website text updated",
  news_published: "News published", news_updated: "News updated", news_deleted: "News deleted",
};
const label = (action) => LABELS[action] || String(action || "").replaceAll("_", " ");
let logs = [];

function change(x) {
  const signed = (n) => `${Number(n) > 0 ? "+" : ""}${number(n)}`;
  if (x.field === "scores" || x.field === "games") return `${x.field === "scores" ? "Pins" : "Games"} ${number(x.previousValue)} → ${number(x.newValue)} (${signed(x.amount)})`;
  if (x.gamesAdded !== undefined) return `+${number(x.gamesAdded)} games, +${number(x.scoresAdded)} pins`;
  if (x.games !== undefined && x.scores !== undefined) return `${number(x.games)} games, ${number(x.scores)} pins`;
  return x.reason || "—";
}

function render() {
  const query = $("#logSearch").value.trim().toLowerCase();
  const action = $("#actionFilter").value;
  const rows = logs.filter((x) => (!action || x.action === action) && (!query || `${label(x.action)} ${JSON.stringify(x)}`.toLowerCase().includes(query)));
  $("#logsBody").innerHTML = rows.length ? rows.map((x) => `<tr>
    <td class="mono small">${esc(new Date(x.timestamp).toLocaleString())}</td>
    <td>${esc(x.actor || "admin")}</td>
    <td><span class="tag">${esc(label(x.action))}</span></td>
    <td>${esc(x.memberName || x.requester || x.details || "—")}${x.team ? `<small>${esc(x.team)}</small>` : ""}</td>
    <td>${esc(change(x))}</td>
  </tr>`).join("") : '<tr><td colspan="5" class="dim">No matching activity.</td></tr>';
}

async function load() {
  const data = await api("/api/admin/logs");
  logs = data.logs || [];
  const filter = $("#actionFilter");
  const chosen = filter.value;
  const actions = [...new Set(logs.map((x) => x.action))].sort((a, b) => label(a).localeCompare(label(b)));
  filter.innerHTML = `<option value="">All activity</option>${actions.map((a) => `<option value="${esc(a)}">${esc(label(a))}</option>`).join("")}`;
  filter.value = chosen;
  render();
}

$("#logSearch").addEventListener("input", render);
$("#actionFilter").addEventListener("change", render);
$("#resetLogs").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const yes = await confirmAction({ title: "Delete all activity?", body: "The whole history goes, including score history on player profiles. This can't be undone.", confirm: "Delete all activity", cancel: "Keep activity", danger: true, typed: "DELETE" });
  if (yes && await run(button, () => api("/api/admin/reset-logs", { method: "POST", body: {} }), "Activity deleted.")) await load();
});
load().catch((error) => toast(error.message, true));
