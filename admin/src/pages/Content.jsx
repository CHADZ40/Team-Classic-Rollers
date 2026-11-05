import { useEffect, useState } from "react";
import { Loading, PageHead, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api } from "../lib/api.js";

const KEYS = ["homeTitle", "homeDescription", "aboutTitle", "aboutDescription", "aboutHeading", "aboutBody", "aboutBody2"];

export default function Content() {
  const { site, setSite } = useAdmin();
  const { run } = useFeedback();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Load once, so a background refresh can't overwrite what's being typed.
  useEffect(() => {
    if (site && !form) setForm(Object.fromEntries(KEYS.map((key) => [key, String(site.content?.[key] || "").replace(/[ \t]*\n\s*/g, " ")])));
  }, [site, form]);

  if (!form) return <><PageHead eyebrow="Website" title="Website text" /><Loading /></>;
  const bind = (key) => ({ name: key, value: form[key], onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) });
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const { ok } = await run(() => api("/api/admin/content", { method: "PATCH", body: form }), "Website text saved.");
    setBusy(false);
    if (ok) setSite((current) => ({ ...current, content: { ...current.content, ...form } }));
  };
  return (
    <>
      <PageHead eyebrow="Website" title="Website text" intro="Edit the wording on the public Home and About pages. Changes go live as soon as you save." />
      <form id="contentForm" className="form" onSubmit={submit}>
        <section className="panel form">
          <h2>Home page</h2>
          <label className="field">Headline <small>Each sentence goes on its own line.</small><input required {...bind("homeTitle")} /></label>
          <label className="field">Intro text<textarea rows={3} {...bind("homeDescription")} /></label>
        </section>
        <section className="panel form">
          <h2>About page</h2>
          <label className="field">Headline<input required {...bind("aboutTitle")} /></label>
          <label className="field">Intro text<textarea rows={2} {...bind("aboutDescription")} /></label>
          <label className="field">Section label<input {...bind("aboutHeading")} /></label>
          <label className="field">Main story <small>Shown large. The words light up as visitors scroll.</small><textarea rows={4} {...bind("aboutBody")} /></label>
          <label className="field">Second paragraph<textarea rows={4} {...bind("aboutBody2")} /></label>
        </section>
        <div className="btn-row"><button type="submit" className="btn btn-primary" id="saveContent" disabled={busy}>{busy ? "Saving…" : "Save website text"}</button></div>
      </form>
    </>
  );
}
