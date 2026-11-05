import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActionButton, PageHead, SPRING, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api } from "../lib/api.js";

const TYPES = ["Announcement", "Tournament", "Results", "New Member", "Achievement", "Upcoming Event"];

function Item({ item }) {
  const { confirmAction, run } = useFeedback();
  const { refresh } = useAdmin();
  const url = `/api/admin/news/${encodeURIComponent(item.id)}`;
  const hidden = item.published === false;
  const toggle = async () => {
    const { ok } = await run(() => api(url, { method: "PATCH", body: { published: hidden } }), hidden ? "Now on the website." : "Hidden from the website.");
    if (ok) await refresh();
  };
  const remove = async () => {
    const yes = await confirmAction({ title: "Delete this update?", body: `"${item.title}" will be gone for good.`, confirm: "Delete update", cancel: "Keep it", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(url, { method: "DELETE" }), "Update deleted.");
    if (ok) await refresh();
  };
  return (
    <motion.article layout className="news-item" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={SPRING}>
      <div>
        <p className="eyebrow">{item.type || "Announcement"}{item.date ? ` · ${item.date}` : ""}</p>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        <p className="gap"><span className={`pill-state${hidden ? "" : " is-on"}`}>{hidden ? "Hidden" : "On the website"}</span></p>
      </div>
      <div className="btn-row top">
        <ActionButton className="btn btn-secondary" data-toggle onAction={toggle}>{hidden ? "Show on website" : "Hide from website"}</ActionButton>
        <ActionButton className="btn btn-danger-quiet" data-delete onAction={remove}>Delete</ActionButton>
      </div>
    </motion.article>
  );
}

export default function News() {
  const { site, refresh } = useAdmin();
  const { run } = useFeedback();
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const items = site?.news || [];
  const submit = async (event) => {
    event.preventDefault();
    const form = formRef.current;
    const body = Object.fromEntries(new FormData(form));
    body.published = form.elements.published.checked;
    setBusy(true);
    const { ok } = await run(() => api("/api/admin/news", { method: "POST", body }), body.published ? "Update published." : "Update saved, hidden from the website.");
    setBusy(false);
    if (ok) { form.reset(); await refresh(); }
  };
  return (
    <>
      <PageHead eyebrow="Announcements" title="News" intro="Published updates appear on the public home page." />
      <section className="panel">
        <h2>Write an update</h2>
        <form ref={formRef} id="newsForm" className="form gap" onSubmit={submit}>
          <label className="field">Title<input name="title" required maxLength={160} placeholder="e.g. October Team Tournament Results" /></label>
          <div className="form-2">
            <label className="field">Type<select name="type">{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="field">Date<input name="date" type="date" /></label>
          </div>
          <label className="field">Details<textarea name="body" rows={4} required maxLength={5000} placeholder="Write the update for the website" /></label>
          <label className="check"><input name="published" type="checkbox" defaultChecked /> Show it on the website now</label>
          <div className="btn-row"><button type="submit" className="btn btn-primary" id="saveNews" disabled={busy}>{busy ? "Saving…" : "Save update"}</button></div>
        </form>
      </section>
      <section className="panel">
        <h2>Your updates</h2>
        <div id="newsList" className="gap">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((item) => <Item key={item.id} item={item} />)}
          </AnimatePresence>
          {!items.length && <p className="empty">No updates yet. Write your first one above.</p>}
        </div>
      </section>
    </>
  );
}
