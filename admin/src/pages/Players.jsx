import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ActionButton, Loading, Modal, PageHead, Photo, SPRING, Tabs, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, average, fullPhoto, memberUrl, niceName, number, plural } from "../lib/api.js";

const TEAMS = ["Team A", "Team B", "Team C"];
const ORDER = { "Team A": 0, "Team B": 1, "Team C": 2 };

function AddScore({ member, onClose }) {
  const { run, toast } = useFeedback();
  const { updateMember } = useAdmin();
  const [games, setGames] = useState("");
  const [pins, setPins] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = games !== "" && pins !== "";
  const addGames = Math.floor(Number(games) || 0);
  const addPins = Math.floor(Number(pins) || 0);
  const nextGames = Number(member.games) + addGames;
  const nextPins = Number(member.scores) + addPins;

  const submit = async (event) => {
    event.preventDefault();
    if (addGames < 1 && addPins < 1) { toast("Enter at least one game or pin.", true); return; }
    setBusy(true);
    const reason = note.trim() || "Score added by admin";
    const { ok, result } = await run(async () => {
      let saved = member;
      if (addGames) saved = (await api(`${memberUrl(member.id)}/adjust`, { method: "POST", body: { field: "games", amount: addGames, reason } })).member;
      if (addPins) saved = (await api(`${memberUrl(member.id)}/adjust`, { method: "POST", body: { field: "scores", amount: addPins, reason } })).member;
      return saved;
    }, `Score added for ${niceName(member.name)}.`);
    setBusy(false);
    if (ok) { updateMember(result); onClose(); }
  };

  return (
    <Modal onClose={onClose}>
      <form className="dialog-body" onSubmit={submit}>
        <h2 className="dialog-title">Add score for {niceName(member.name)}</h2>
        <div className="form-2">
          <label className="field">Games bowled<input name="games" type="number" inputMode="numeric" min="0" step="1" required placeholder="3" value={games} onChange={(event) => setGames(event.target.value)} autoFocus /></label>
          <label className="field">Total pins<input name="pins" type="number" inputMode="numeric" min="0" step="1" required placeholder="487" value={pins} onChange={(event) => setPins(event.target.value)} /></label>
        </div>
        <label className="field">Note <small>Optional. Shown in Activity and score history.</small><input name="note" maxLength={300} placeholder="e.g. Weekly training" value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <AnimatePresence initial={false}>
          {ready && (
            <motion.div className="preview-wrap" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <div className="preview" data-preview>New totals: <b>{number(nextGames)}</b> games, <b>{number(nextPins)}</b> pins, average <b>{nextGames ? (nextPins / nextGames).toFixed(1) : "0.0"}</b></div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" data-save disabled={busy}>{busy ? "Saving…" : ready ? `Add ${plural(addGames, "game")} and ${number(addPins)} pins` : "Add score"}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditPlayer({ member, onClose }) {
  const { confirmAction, run, toast } = useFeedback();
  const { updateMember, refresh } = useAdmin();
  const [form, setForm] = useState({
    name: member.name, team: member.team, bio: member.bio || "", achievements: (member.achievements || []).join("\n"),
    games: String(member.games ?? 0), scores: String(member.scores ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const label = niceName(member.name);

  const pickPhoto = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Photo must be 5 MB or smaller.", true); return; }
    const body = new FormData();
    body.append("photo", file);
    const { ok, result } = await run(() => api(memberUrl(member.id), { method: "PATCH", body }), `Photo updated for ${label}.`);
    if (ok) updateMember(result.member);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = { ...form, games: Number(form.games) || 0, scores: Number(form.scores) || 0 };
    const { ok, result } = await run(() => api(memberUrl(member.id), { method: "PATCH", body }), "Changes saved.");
    setBusy(false);
    if (ok) { updateMember(result.member); onClose(); }
  };

  const reset = async () => {
    const yes = await confirmAction({ title: `Reset ${label}'s stats?`, body: "Their games and pins go back to zero. This can't be undone.", confirm: "Reset to zero", cancel: "Keep stats", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(`${memberUrl(member.id)}/reset-stats`, { method: "POST", body: {} }), `${label}'s stats were reset.`);
    if (ok) { await refresh(); onClose(); }
  };

  const remove = async () => {
    const yes = await confirmAction({ title: `Remove ${label}?`, body: "They'll disappear from the public roster and rankings.", confirm: "Remove player", cancel: "Keep player", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(memberUrl(member.id), { method: "DELETE" }), `${label} was removed.`);
    if (ok) { await refresh(); onClose(); }
  };

  return (
    <Modal sheet onClose={onClose}>
      <div className="dialog-body">
        <h2 className="dialog-title">{label}</h2>
        <div className="photo-row">
          <img src={fullPhoto(member.photo)} alt="" data-photo-preview />
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} data-photo-input />
            <button type="button" className="btn btn-secondary" data-photo onClick={() => fileRef.current.click()}>Change photo</button>
            <p className="dim small photo-hint">PNG, JPG or WEBP, up to 5 MB. It saves straight away.</p>
          </div>
        </div>
        <form className="form" onSubmit={save}>
          <div className="form-2">
            <label className="field">Name<input name="name" required maxLength={100} value={form.name} onChange={set("name")} /></label>
            <label className="field">Squad<select name="team" value={form.team} onChange={set("team")}>{TEAMS.map((team) => <option key={team}>{team}</option>)}</select></label>
          </div>
          <label className="field">Biography<textarea name="bio" rows={3} maxLength={2000} value={form.bio} onChange={set("bio")} /></label>
          <label className="field">Achievements <small>One per line.</small><textarea name="achievements" rows={3} value={form.achievements} onChange={set("achievements")} /></label>
          <div className="form-2">
            <label className="field">Total games <small>Only to correct a mistake.</small><input name="games" type="number" min="0" step="1" value={form.games} onChange={set("games")} /></label>
            <label className="field">Total pins <small>Only to correct a mistake.</small><input name="scores" type="number" min="0" step="1" value={form.scores} onChange={set("scores")} /></label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close without saving</button>
            <button type="submit" className="btn btn-primary" data-save disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
        <section className="danger-zone">
          <h3>Danger zone</h3>
          <div className="btn-row">
            <ActionButton className="btn btn-danger-quiet" data-reset onAction={reset}>Reset stats to zero</ActionButton>
            <ActionButton className="btn btn-danger-quiet" data-remove onAction={remove}>Remove from roster</ActionButton>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function NewPlayer({ onClose }) {
  const { run } = useFeedback();
  const { refresh } = useAdmin();
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const body = new FormData(event.currentTarget);
    const { ok } = await run(() => api("/api/admin/members", { method: "POST", body }), `${body.get("name")} was added.`);
    setBusy(false);
    if (ok) { await refresh(); onClose(); }
  };
  return (
    <Modal onClose={onClose}>
      <form className="dialog-body" onSubmit={submit}>
        <h2 className="dialog-title">Add a player</h2>
        <label className="field">Name<input name="name" required maxLength={100} placeholder="Full name" autoFocus /></label>
        <label className="field">Squad<select name="team" defaultValue="Team C">{TEAMS.map((team) => <option key={team}>{team}</option>)}</select></label>
        <label className="field">Photo <small>Optional. You can add it later.</small><input type="file" name="photo" accept="image/png,image/jpeg,image/webp" /></label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" data-save disabled={busy}>{busy ? "Adding…" : "Add to roster"}</button>
        </div>
      </form>
    </Modal>
  );
}

function PlayerRow({ member, onScore, onEdit }) {
  const avg = average(member);
  const percent = Math.min(100, Math.max(0, (avg / (Number(member.goal) || 1)) * 100));
  return (
    <motion.article
      layout
      className="player"
      data-id={member.id}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={SPRING}
    >
      <Photo path={member.photo} />
      <div><div className="player-name">{niceName(member.name)}</div><div className="player-meta">{member.team}</div></div>
      <div className="player-stats">
        <div>{member.games ? <><b>{avg.toFixed(1)}</b> average · {plural(member.games, "game")} · {number(member.scores)} pins</> : <span className="dim">No games yet</span>}</div>
        <div className="bar" title={`${percent.toFixed(0)}% of ${member.goal} goal`}><motion.i initial={false} animate={{ width: `${percent}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} /></div>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" data-score onClick={onScore}>Add score</button>
        <button type="button" className="btn btn-secondary" data-edit onClick={onEdit}>Edit</button>
      </div>
    </motion.article>
  );
}

export default function Players() {
  const { loaded, members, refresh } = useAdmin();
  const { confirmAction, run } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [squad, setSquad] = useState("all");
  const [scoring, setScoring] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.get("new")) { setAdding(true); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members
      .filter((m) => (squad === "all" || m.team === squad) && m.name.toLowerCase().includes(needle))
      .sort((a, b) => (ORDER[a.team] ?? 3) - (ORDER[b.team] ?? 3) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [members, query, squad]);

  const scoringMember = members.find((m) => m.id === scoring);
  const editingMember = members.find((m) => m.id === editing);

  const resetAll = async () => {
    const yes = await confirmAction({ title: "Reset every player's scores?", body: "All games and pins for every player go back to zero. This can't be undone.", confirm: "Reset all scores", cancel: "Keep scores", danger: true, typed: "RESET" });
    if (!yes) return;
    const { ok } = await run(() => api("/api/admin/reset-all-scores", { method: "POST", body: {} }), "All scores were reset.");
    if (ok) await refresh();
  };

  return (
    <>
      <PageHead eyebrow="Roster" title="Players" intro="Find a player, then add their score or edit their details. Every change is saved in Activity.">
        <button type="button" className="btn btn-primary" id="newPlayer" onClick={() => setAdding(true)}>Add a player</button>
      </PageHead>
      <div className="toolbar">
        <input id="search" type="search" placeholder="Search by name" aria-label="Search players by name" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Tabs id="squads" label="Filter by squad" value={squad} onChange={setSquad} options={[{ value: "all", label: "All" }, ...TEAMS.map((team) => ({ value: team, label: team }))]} />
      </div>
      {!loaded ? <Loading /> : (
        <div className="players" id="players">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((m) => <PlayerRow key={m.id} member={m} onScore={() => setScoring(m.id)} onEdit={() => setEditing(m.id)} />)}
          </AnimatePresence>
        </div>
      )}
      {loaded && !list.length && <p className="empty">No player matches that search.</p>}
      <section className="danger-zone gap-lg">
        <h3>Danger zone</h3>
        <p className="dim small">Resets every player's games and pins to zero. Only use this to start a new season.</p>
        <div className="btn-row"><ActionButton className="btn btn-danger-quiet" id="resetAll" onAction={resetAll}>Reset all scores</ActionButton></div>
      </section>
      <AnimatePresence>
        {scoringMember && <AddScore key="score" member={scoringMember} onClose={() => setScoring(null)} />}
        {editingMember && <EditPlayer key="edit" member={editingMember} onClose={() => setEditing(null)} />}
        {adding && <NewPlayer key="new" onClose={() => setAdding(false)} />}
      </AnimatePresence>
    </>
  );
}
