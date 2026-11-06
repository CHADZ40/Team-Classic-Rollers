// The leaders introduced on the public home page: add, edit, remove and reorder them.
import { useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ActionButton, Loading, Modal, PageHead, Photo, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName, shrinkPhoto } from "../lib/api.js";

const ROLES = ["Team Captain & Founder", "Team Manager & Founder", "Two-Handed Coach", "One-Handed Coach", "Advisor"];
const CAPTION_MAX = 280;
const WEBSITE = "https://teamclassicrollers.club/#meet";
const URL = "/api/admin/introductions";

function useLeaders() {
  const { setSite } = useAdmin();
  return (result) => setSite((current) => ({ ...current, introductions: result.introductions }));
}

function PlayerSelect({ value, onChange }) {
  const { members } = useAdmin();
  return (
    <label className="field">Roster player <small>Optional. Adds their stats and profile link.</small>
      <select name="memberId" value={value} onChange={onChange}>
        <option value="">Not linked</option>
        {members.map((m) => <option key={m.id} value={m.id}>{niceName(m.name)}</option>)}
      </select>
    </label>
  );
}

function LeaderCard({ item, position, total, onMove }) {
  const { confirmAction, run } = useFeedback();
  const { members } = useAdmin();
  const apply = useLeaders();
  // Kept here, not read from the store, so a background refresh can't overwrite what's being typed.
  const [form, setForm] = useState({ name: item.name, role: item.role, caption: item.caption, memberId: item.memberId });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const label = item.name || item.role;
  const url = `${URL}/${encodeURIComponent(item.id)}`;
  const linked = members.find((m) => m.id === item.memberId);
  const changed = ["name", "role", "caption", "memberId"].some((key) => form[key].trim() !== item[key]);

  const send = async (body, message) => {
    setBusy(true);
    const { ok, result } = await run(async () => api(url, { method: "PATCH", body: await body() }), message);
    setBusy(false);
    if (ok) apply(result);
  };

  const pickPhoto = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    send(async () => {
      const body = new FormData();
      body.append("photo", await shrinkPhoto(file));
      return body;
    }, `Picture updated for ${label}.`);
  };

  const remove = async () => {
    const yes = await confirmAction({ title: `Remove ${label}?`, body: "They'll disappear from the home page, along with their picture and caption. This can't be undone.", confirm: "Remove", cancel: "Keep", danger: true });
    if (!yes) return;
    const { ok, result } = await run(() => api(url, { method: "DELETE" }), `${label} was removed.`);
    if (ok) apply(result);
  };

  return (
    <article className="intro-card" data-id={item.id}>
      <div className="intro-preview">
        <Photo path={item.photo || linked?.photo} alt={`${label}'s picture`} />
      </div>
      <div className="intro-fields">
        <div className="intro-head">
          <div>
            <h2>{label}</h2>
            {!item.name && <span className="tag">Add a name to show on the website</span>}
          </div>
          <div className="intro-move">
            <ActionButton className="btn btn-secondary" data-up aria-label={`Move ${label} up`} disabled={position === 0} onAction={() => onMove(position, -1)}>↑</ActionButton>
            <ActionButton className="btn btn-secondary" data-down aria-label={`Move ${label} down`} disabled={position === total - 1} onAction={() => onMove(position, 1)}>↓</ActionButton>
          </div>
        </div>
        <div className="btn-row">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} aria-label={`Picture for ${label}`} />
          <button type="button" className="btn btn-secondary" data-photo disabled={busy} onClick={() => fileRef.current.click()}>{item.photo ? "Change picture" : "Add picture"}</button>
          {item.photo && <ActionButton className="btn btn-secondary" data-remove-photo disabled={busy} onAction={() => send(async () => ({ removePhoto: true }), `Picture removed for ${label}.`)}>Remove picture</ActionButton>}
        </div>
        <form className="form" onSubmit={(event) => { event.preventDefault(); send(async () => form, "Changes saved."); }}>
          <div className="form-2">
            <label className="field">Name<input name="name" maxLength={100} value={form.name} onChange={set("name")} /></label>
            <label className="field">Role<input name="role" required maxLength={80} list="leader-roles" value={form.role} onChange={set("role")} /></label>
          </div>
          <label className="field">Caption
            <textarea name="caption" rows={3} maxLength={CAPTION_MAX} value={form.caption} onChange={set("caption")} />
            <small className="mono">{form.caption.length}/{CAPTION_MAX}</small>
          </label>
          <PlayerSelect value={form.memberId} onChange={set("memberId")} />
          <div className="intro-save">
            <ActionButton className="btn btn-danger-quiet" data-remove onAction={remove}>Remove person</ActionButton>
            <button type="submit" className="btn btn-primary" data-save disabled={busy || !changed}>{busy ? "Saving…" : changed ? "Save changes" : "Saved"}</button>
          </div>
        </form>
      </div>
    </article>
  );
}

function NewLeader({ onClose }) {
  const { run } = useFeedback();
  const apply = useLeaders();
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    const file = body.get("photo");
    setBusy(true);
    const { ok, result } = await run(async () => {
      if (file?.size) body.set("photo", await shrinkPhoto(file));
      else body.delete("photo");
      return api(URL, { method: "POST", body });
    }, `${body.get("name")} was added.`);
    setBusy(false);
    if (ok) { apply(result); onClose(); }
  };
  return (
    <Modal onClose={onClose}>
      <form className="dialog-body" onSubmit={submit}>
        <h2 className="dialog-title">Add a person</h2>
        <label className="field">Name<input name="name" required maxLength={100} autoFocus /></label>
        <label className="field">Role<input name="role" required maxLength={80} list="leader-roles" /></label>
        <label className="field">Caption<textarea name="caption" rows={3} maxLength={CAPTION_MAX} /></label>
        <label className="field">Picture <small>Optional. You can add it later.</small><input type="file" name="photo" accept="image/png,image/jpeg,image/webp" /></label>
        <PlayerSelect value={memberId} onChange={(event) => setMemberId(event.target.value)} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" data-save disabled={busy}>{busy ? "Adding…" : "Add person"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Introductions() {
  const { loaded, site } = useAdmin();
  const { run } = useFeedback();
  const apply = useLeaders();
  const [adding, setAdding] = useState(false);
  const items = site?.introductions || [];

  const move = async (position, by) => {
    const ids = items.map((item) => item.id);
    [ids[position], ids[position + by]] = [ids[position + by], ids[position]];
    const { ok, result } = await run(() => api(`${URL}/order`, { method: "POST", body: { ids } }));
    if (ok) apply(result);
  };

  return (
    <>
      <PageHead eyebrow="Home page" title="Leaders" intro="These people are introduced on the home page, in this order. Changes go live as soon as you save.">
        <div className="btn-row">
          <a className="btn btn-secondary" href={WEBSITE} target="_blank" rel="noopener noreferrer">See it on the website</a>
          <button type="button" className="btn btn-primary" id="newLeader" onClick={() => setAdding(true)}>Add a person</button>
        </div>
      </PageHead>
      <datalist id="leader-roles">{ROLES.map((role) => <option key={role} value={role} />)}</datalist>
      {!loaded ? <Loading /> : (
        <div className="intro-cards">
          {items.map((item, i) => <LeaderCard key={item.id} item={item} position={i} total={items.length} onMove={move} />)}
        </div>
      )}
      {loaded && !items.length && <p className="empty">Nobody here yet. Add the first person.</p>}
      <AnimatePresence>{adding && <NewLeader key="new" onClose={() => setAdding(false)} />}</AnimatePresence>
    </>
  );
}
