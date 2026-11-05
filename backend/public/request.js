// Score requests: review each one with the player already picked where the name matches.
let requests = [];
let members = [];
let tab = "pending";

const clean = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function suggested(request) {
  if (request.memberId) return members.find((m) => m.id === request.memberId) || null;
  const matches = members.filter((m) => clean(m.name) === clean(request.name));
  return matches.length === 1 ? matches[0] : null;
}

function approveLabel(request, member) {
  const what = `${number(request.games)} ${Number(request.games) === 1 ? "game" : "games"} and ${number(request.scores)} pins`;
  return member ? `Approve: add ${what} to ${member.name}` : "Choose a player to approve";
}

function card(r) {
  const proofs = (r.proofs || []).map((p, i) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="Proof ${i + 1}" loading="lazy"></a>`).join("");
  const avg = r.games ? (r.scores / r.games).toFixed(1) : "0.0";
  const verified = r.source === "member-portal";
  const match = suggested(r);
  const when = new Date(r.createdAt).toLocaleString();
  const top = `<div class="request-top">
      <div><h2>${esc(niceName(r.name))}</h2><p class="dim small">${esc(when)} · ${verified ? "Member Portal (verified)" : "Public form (name not verified)"}</p></div>
      <span class="pill-state ${esc(r.status)}">${r.status === "pending" ? "Waiting" : r.status === "approved" ? "Approved" : "Rejected"}</span>
    </div>
    <div class="figures">
      <div><span>Games</span><b>${number(r.games)}</b></div>
      <div><span>Total pins</span><b>${number(r.scores)}</b></div>
      <div><span>Average</span><b>${avg}</b></div>
    </div>
    ${r.notes ? `<p class="gap">${esc(r.notes)}</p>` : ""}
    ${proofs ? `<div class="proofs">${proofs}</div>` : '<p class="dim small gap">No proof photos.</p>'}`;
  if (r.status !== "pending") {
    return `<article class="request">${top}<p class="dim small gap">${r.status === "approved" ? `Added to ${esc(r.memberName || "the player")}` : "Rejected"}${r.reviewedAt ? ` on ${esc(new Date(r.reviewedAt).toLocaleString())}` : ""}${r.reviewReason ? ` · ${esc(r.reviewReason)}` : ""}</p></article>`;
  }
  const options = members.map((m) => `<option value="${esc(m.id)}" ${match?.id === m.id ? "selected" : ""}>${esc(m.name)} · ${esc(m.team)}</option>`).join("");
  return `<article class="request is-pending" data-id="${esc(r.id)}">${top}
    ${match ? "" : '<p class="warn">This name doesn\'t match the roster. Choose who it belongs to.</p>'}
    <div class="review">
      <label class="field">Add to player<select data-member><option value="">Choose a player…</option>${options}</select></label>
      <label class="field">Note <small>Optional</small><input data-note maxlength="300" placeholder="Reason or note"></label>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-approve ${match ? "" : "disabled"}>${esc(approveLabel(r, match))}</button>
        <button type="button" class="btn btn-danger-quiet" data-reject>Reject</button>
      </div>
    </div></article>`;
}

function render() {
  const count = (status) => requests.filter((r) => r.status === status).length;
  $("#nPending").textContent = count("pending") ? `(${count("pending")})` : "";
  $("#nApproved").textContent = count("approved") ? `(${count("approved")})` : "";
  $("#nRejected").textContent = count("rejected") ? `(${count("rejected")})` : "";
  const list = requests.filter((r) => r.status === tab);
  const root = $("#requests");
  root.innerHTML = list.length ? list.map(card).join("")
    : `<div class="panel empty">${tab === "pending" ? "All caught up. Nothing is waiting." : "Nothing here yet."}</div>`;
  $$("[data-id]", root).forEach((el) => {
    const r = requests.find((x) => x.id === el.dataset.id);
    const select = $("[data-member]", el);
    const approve = $("[data-approve]", el);
    select.addEventListener("change", () => {
      const member = members.find((m) => m.id === select.value);
      approve.disabled = !member;
      approve.textContent = approveLabel(r, member);
    });
    approve.addEventListener("click", () => decide(r, "approve", el, approve));
    $("[data-reject]", el).addEventListener("click", (event) => decide(r, "reject", el, event.currentTarget));
  });
}

async function decide(r, decision, el, button) {
  const memberId = $("[data-member]", el).value;
  const reason = $("[data-note]", el).value;
  if (decision === "reject") {
    const yes = await confirmAction({ title: `Reject ${r.name}'s request?`, body: "Their games and pins won't be added.", confirm: "Reject request", cancel: "Go back", danger: true });
    if (!yes) return;
  }
  const member = members.find((m) => m.id === memberId);
  const ok = await run(button, () => api(`/api/admin/game-requests/${encodeURIComponent(r.id)}/review`, { method: "POST", body: { decision, memberId, reason } }),
    decision === "approve" ? `Added to ${member?.name}.` : "Request rejected.");
  await load();
  if (ok) refreshPending();
}

async function load() {
  const [r, d] = await Promise.all([api("/api/admin/game-requests"), api("/api/admin/site-data")]);
  requests = r.requests || [];
  members = (d.members || []).filter((m) => m.active !== false);
  render();
}

$$("#tabs button").forEach((b) => b.addEventListener("click", () => {
  tab = b.dataset.status;
  $$("#tabs button").forEach((other) => other.setAttribute("aria-pressed", String(other === b)));
  render();
}));

// Pick up new requests, but never redraw while someone is partway through a review.
setInterval(() => {
  const busy = document.querySelector("dialog[open]") || document.activeElement?.closest?.("[data-id]");
  if (!busy) load().catch(() => {});
}, 20000);
load().catch((error) => toast(error.message, true));
