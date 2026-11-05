// News: write updates and control what's public.
let items = [];

function render() {
  const root = $("#newsList");
  root.innerHTML = items.length ? items.map((n) => `<article class="news-item" data-id="${esc(n.id)}">
    <div>
      <p class="eyebrow">${esc(n.type || "Announcement")}${n.date ? ` · ${esc(n.date)}` : ""}</p>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.body)}</p>
      <p class="gap"><span class="pill-state ${n.published === false ? "" : "is-on"}">${n.published === false ? "Hidden" : "On the website"}</span></p>
    </div>
    <div class="btn-row" style="align-self:flex-start">
      <button type="button" class="btn btn-secondary" data-toggle>${n.published === false ? "Show on website" : "Hide from website"}</button>
      <button type="button" class="btn btn-danger-quiet" data-delete>Delete</button>
    </div>
  </article>`).join("") : '<p class="empty">No updates yet. Write your first one above.</p>';
  $$("[data-id]", root).forEach((el) => {
    const n = items.find((x) => x.id === el.dataset.id);
    const url = `/api/admin/news/${encodeURIComponent(n.id)}`;
    $("[data-toggle]", el).addEventListener("click", async (event) => {
      const show = n.published === false;
      if (await run(event.currentTarget, () => api(url, { method: "PATCH", body: { published: show } }), show ? "Now on the website." : "Hidden from the website.")) await load();
    });
    $("[data-delete]", el).addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const yes = await confirmAction({ title: "Delete this update?", body: `"${n.title}" will be gone for good.`, confirm: "Delete update", cancel: "Keep it", danger: true });
      if (yes && await run(button, () => api(url, { method: "DELETE" }), "Update deleted.")) await load();
    });
  });
}

async function load() {
  const data = await api("/api/admin/site-data");
  items = data.news || [];
  render();
}

$("#newsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  body.published = form.elements.published.checked;
  const ok = await run($("#saveNews"), () => api("/api/admin/news", { method: "POST", body }), body.published ? "Update published." : "Update saved, hidden from the website.");
  if (ok) { form.reset(); form.elements.published.checked = true; await load(); }
});
load().catch((error) => toast(error.message, true));
