// Home: what needs attention, team totals, shortcuts and recent activity.
const ACTION_LABELS = {
  game_request_submitted: "Score request sent", game_request_approved: "Score request approved", game_request_rejected: "Score request rejected",
  score_added: "Pins added", score_removed: "Pins removed", games_adjusted: "Games changed", member_stats_set: "Stats corrected",
  member_added: "Player added", member_removed: "Player removed", member_updated: "Player updated", website_content_updated: "Website text updated",
  news_published: "News published", news_updated: "News updated", news_deleted: "News deleted",
};

async function loadHome() {
  const [site, requests, logs, telegram] = await Promise.all([
    api("/api/admin/site-data"), api("/api/admin/game-requests"), api("/api/admin/logs"), api("/api/admin/telegram-status").catch(() => null),
  ]);
  const members = site.members.filter((m) => m.active !== false);
  const games = members.reduce((sum, m) => sum + Number(m.games || 0), 0);
  const pins = members.reduce((sum, m) => sum + Number(m.scores || 0), 0);
  $("#statPlayers").textContent = members.length;
  $("#statGames").textContent = number(games);
  $("#statPins").textContent = number(pins);
  $("#statAvg").textContent = games ? (pins / games).toFixed(1) : "—";

  const pending = (requests.requests || []).filter((r) => r.status === "pending");
  $("#attention").hidden = pending.length === 0;
  $("#allClear").hidden = pending.length > 0;
  $("#attentionText").textContent = `${pending.length} score ${pending.length === 1 ? "request is" : "requests are"} waiting`;
  $("#attentionWho").textContent = pending.slice(0, 3).map((r) => niceName(r.name)).join(", ") + (pending.length > 3 ? ` and ${pending.length - 3} more` : "");

  const recent = (logs.logs || []).slice(0, 6);
  $("#feed").innerHTML = recent.length
    ? recent.map((l) => `<li><span>${esc(ACTION_LABELS[l.action] || l.action.replaceAll("_", " "))}${l.memberName || l.requester ? ` · <span style="text-transform:capitalize">${esc(niceName(l.memberName || l.requester))}</span>` : ""}</span><small>${esc(new Date(l.timestamp).toLocaleDateString())}</small></li>`).join("")
    : '<li><span class="dim">Nothing yet.</span></li>';

  const state = $("#tgState");
  const button = $("#tgTest");
  if (!telegram) { state.textContent = "Unknown"; return; }
  state.textContent = telegram.ready ? `On · ${telegram.adminChats} ${telegram.adminChats === 1 ? "chat" : "chats"}` : "Not set up";
  state.classList.toggle("is-on", telegram.ready);
  $("#tgHelp").hidden = telegram.ready;
  button.hidden = !telegram.ready;
}

$("#tgTest").addEventListener("click", (event) => run(event.currentTarget, () => api("/api/admin/telegram-test", { method: "POST" }), "Test message sent. Check Telegram."));
loadHome().catch((error) => toast(error.message, true));
