// Tournaments: bowlers come from a session's present members, get shuffled into lanes, can be
// moved by hand, and their scores build a live ranking. Only admins can see this page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useBlocker, useSearchParams } from "react-router";
import { ActionButton, Counter, Loading, Modal, PageHead, Photo, Tabs, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName, number, plural } from "../lib/api.js";

const TOURNAMENTS = "/api/admin/tournaments";
const SESSIONS = "/api/admin/training-sessions";
const MAX_SCORE = 300;
const TEAMS = ["Team A", "Team B", "Team C"];
const today = () => new Date().toLocaleDateString("en-CA");

// ---- Scores and ranking ----
const played = (list, games) => (list || []).slice(0, games).filter((s) => Number.isInteger(s));
export function bowlerStats(list, games) {
  const done = played(list, games);
  const pins = done.reduce((sum, s) => sum + s, 0);
  return { games: done.length, pins, average: done.length ? pins / done.length : 0 };
}
const byAverage = (a, b) => b.average - a.average || b.pins - a.pins || a.name.localeCompare(b.name);
const METRICS = {
  average: { label: "Average", sort: byAverage, value: (r) => r.average, decimals: 1 },
  games: { label: "Games", sort: (a, b) => b.games - a.games || byAverage(a, b), value: (r) => r.games, decimals: 0 },
  pins: { label: "Pins", sort: (a, b) => b.pins - a.pins || byAverage(a, b), value: (r) => r.pins, decimals: 0 },
};

// ---- Lanes: pure moves on { lanes: [{ slots, edited }], unassigned } ----
// A spot is { lane, slot } inside a lane, or { out: true } for the "not assigned" list.
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function generate(ids, laneCount, perLane) {
  const order = shuffle(ids);
  const lanes = Array.from({ length: laneCount }, (_, i) => ({
    slots: Array.from({ length: perLane }, (_, j) => order[i * perLane + j] ?? null),
    edited: false,
  }));
  return { lanes, unassigned: order.slice(laneCount * perLane) };
}

// Keeps everyone when the number of lanes or spots changes. Anyone without a spot is not assigned.
function resize(state, laneCount, perLane) {
  if (!state.lanes.length) return state;
  const extra = [];
  const lanes = Array.from({ length: laneCount }, (_, i) => {
    const old = state.lanes[i] || { slots: [], edited: false };
    const people = old.slots.filter(Boolean);
    extra.push(...people.slice(perLane));
    const kept = people.slice(0, perLane);
    return { slots: Array.from({ length: perLane }, (_, j) => kept[j] ?? null), edited: old.edited };
  });
  state.lanes.slice(laneCount).forEach((lane) => extra.push(...lane.slots.filter(Boolean)));
  return { lanes, unassigned: [...state.unassigned, ...extra] };
}

const idAt = (state, spot) => (spot.out ? state.unassigned[spot.index] : state.lanes[spot.lane]?.slots[spot.slot]) ?? null;
const firstEmpty = (lane) => lane.slots.indexOf(null);

// Moves the bowler at `from` to `to`. A bowler already at `to` swaps places with them.
// Returns { state } or { warning } when a lane has no room.
function move(state, from, to, perLane) {
  const id = idAt(state, from);
  if (!id) return { state };
  if (!to.out && to.slot === undefined) {
    const lane = state.lanes[to.lane];
    if (!from.out && from.lane === to.lane) return { state };
    const slot = firstEmpty(lane);
    if (slot < 0) return { warning: `Lane ${to.lane + 1} is full (${perLane} bowlers). Drop onto a bowler to swap, or remove someone first.` };
    to = { lane: to.lane, slot };
  }
  if (to.out && from.out) return { state };
  if (!from.out && !to.out && from.lane === to.lane && from.slot === to.slot) return { state };
  const lanes = state.lanes.map((lane) => ({ ...lane, slots: [...lane.slots] }));
  let unassigned = [...state.unassigned];
  const other = to.out ? null : lanes[to.lane].slots[to.slot];
  // Take the bowler out of where they were, leaving the person they swap with (or a gap).
  if (from.out) {
    unassigned = unassigned.filter((x) => x !== id);
    if (other) unassigned.splice(from.index, 0, other);
  } else {
    lanes[from.lane].slots[from.slot] = other;
    lanes[from.lane].edited = true;
  }
  if (to.out) unassigned.push(id);
  else { lanes[to.lane].slots[to.slot] = id; lanes[to.lane].edited = true; }
  return { state: { lanes, unassigned } };
}

// ---- Forms ----
function SettingsForm({ title, initial, sessions, submitLabel, busy, onCancel, onSubmit, note }) {
  const [form, setForm] = useState(initial);
  const [lanesTouched, setLanesTouched] = useState(Boolean(initial.id));
  const session = sessions.find((s) => s.id === form.sessionId);
  const present = session?.presentCount ?? 0;
  const spots = Number(form.laneCount) * Number(form.perLane) || 0;
  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Suggest enough lanes for everyone until the admin picks a number.
      if (!lanesTouched && (key === "perLane" || key === "sessionId")) {
        const count = sessions.find((s) => s.id === next.sessionId)?.presentCount || 0;
        const per = Number(next.perLane) || 1;
        if (count) next.laneCount = String(Math.max(1, Math.ceil(count / per)));
      }
      if (key === "sessionId" && !current.id) {
        const picked = sessions.find((s) => s.id === value);
        if (picked) {
          if (!current.nameTouched) next.name = picked.title;
          if (!current.dateTouched) next.date = picked.date;
          if (!current.locationTouched && picked.location) next.location = picked.location;
        }
      }
      if (key === "name" || key === "date" || key === "location") next[`${key}Touched`] = true;
      return next;
    });
    if (key === "laneCount") setLanesTouched(true);
  };
  const submit = (event) => { event.preventDefault(); onSubmit(form); };
  return (
    <form className="dialog-body" onSubmit={submit}>
      <h2 className="dialog-title">{title}</h2>
      <label className="field">Tournament name<input required maxLength={120} value={form.name} onChange={set("name")} autoFocus /></label>
      <div className="form-2">
        <label className="field">Date<input type="date" required value={form.date} onChange={set("date")} /></label>
        <label className="field">Location<input maxLength={200} placeholder="Bowling Center" value={form.location} onChange={set("location")} /></label>
      </div>
      <div className="form-3">
        <label className="field">How many lanes<input type="number" inputMode="numeric" min={1} max={40} required value={form.laneCount} onChange={set("laneCount")} /></label>
        <label className="field">Bowlers per lane<input type="number" inputMode="numeric" min={1} max={10} required value={form.perLane} onChange={set("perLane")} /></label>
        <label className="field">Games per bowler<input type="number" inputMode="numeric" min={1} max={10} required value={form.gamesPerBowler} onChange={set("gamesPerBowler")} /></label>
      </div>
      <label className="field">Select session
        <select required value={form.sessionId} onChange={set("sessionId")}>
          <option value="" disabled>Choose a session from Attendance</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}, {s.date}, {s.presentCount} present</option>)}
        </select>
        {session && (
          <small className="hint-yellow">
            Present members from this session become the bowlers ({present}).
            {spots > 0 && present !== spots && ` ${plural(spots, "spot")}: ${present > spots ? `${present - spots} left out` : plural(spots - present, "empty spot")}.`}
          </small>
        )}
        {!sessions.length && <small>No sessions yet. Open one on the Attendance page and mark who is present.</small>}
      </label>
      {note && <p className="dim small">{note}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !form.sessionId}>{busy ? "Saving…" : submitLabel}</button>
      </div>
    </form>
  );
}

function useSessions() {
  const [sessions, setSessions] = useState(null);
  useEffect(() => {
    let live = true;
    api(SESSIONS).then((r) => { if (live) setSessions(r.sessions || []); }).catch(() => { if (live) setSessions([]); });
    return () => { live = false; };
  }, []);
  return sessions;
}

function CreateTournament({ onClose, onCreated }) {
  const { run } = useFeedback();
  const sessions = useSessions();
  const [busy, setBusy] = useState(false);
  if (!sessions) return <Modal onClose={onClose}><div className="dialog-body"><Loading /></div></Modal>;
  const first = sessions.find((s) => s.presentCount > 0) || sessions[0];
  const initial = {
    name: first?.title || "", date: first?.date || today(), location: first?.location || "Bowling Center",
    laneCount: String(Math.max(1, Math.ceil((first?.presentCount || 4) / 4))), perLane: "4", gamesPerBowler: "3", sessionId: first?.id || "",
  };
  const submit = async (form) => {
    setBusy(true);
    const { ok, result } = await run(() => api(TOURNAMENTS, { method: "POST", body: form }), "Tournament created. Now generate the lanes.");
    setBusy(false);
    if (ok) onCreated(result.tournament);
  };
  return (
    <Modal onClose={onClose}>
      <SettingsForm title="Create tournament" initial={initial} sessions={sessions} submitLabel="Create" busy={busy} onCancel={onClose} onSubmit={submit} />
    </Modal>
  );
}

function EditDetails({ draft, onClose, onApply }) {
  const sessions = useSessions();
  if (!sessions) return <Modal onClose={onClose}><div className="dialog-body"><Loading /></div></Modal>;
  // The tournament's own session stays in the list even if it was deleted from Attendance.
  const list = sessions.some((s) => s.id === draft.sessionId) ? sessions
    : [{ id: draft.sessionId, title: draft.sessionTitle || "Original session", date: draft.date, presentCount: draft.bowlers.length }, ...sessions];
  const initial = { ...draft, laneCount: String(draft.laneCount), perLane: String(draft.perLane), gamesPerBowler: String(draft.gamesPerBowler) };
  return (
    <Modal onClose={onClose}>
      <SettingsForm
        title="Tournament details" initial={initial} sessions={list} submitLabel="Apply and save" onCancel={onClose} onSubmit={onApply}
        note="Changing lanes keeps everyone: bowlers without a spot go to Not assigned. Changing the session brings in its present members and keeps scores for anyone still there."
      />
    </Modal>
  );
}

// ---- Lane board ----
function BowlerMenu({ who, spot, draft, onMove, onClose }) {
  const lanes = draft.lanes;
  const swaps = [];
  lanes.forEach((lane, l) => lane.slots.forEach((id, s) => {
    if (id && id !== who.memberId && (spot.out || l !== spot.lane)) swaps.push({ id, lane: l, slot: s });
  }));
  const go = (to) => { onMove(spot, to); onClose(); };
  return (
    <Modal onClose={onClose}>
      <div className="dialog-body">
        <h2 className="dialog-title">{niceName(who.name)}</h2>
        <p className="dim small">{spot.out ? "Not assigned. Add them to a lane with an empty spot." : `Lane ${spot.lane + 1}. Move them, swap them, or take them out of the lane.`}</p>
        <div className="move-grid">
          {lanes.map((lane, l) => {
            if (!spot.out && l === spot.lane) return null;
            const free = lane.slots.filter((x) => !x).length;
            return (
              <button key={l} type="button" className={`btn ${free ? "btn-secondary" : "btn-quiet"}`} onClick={() => go({ lane: l })}>
                {spot.out ? "Add to" : "Move to"} Lane {l + 1}<small>{free ? plural(free, "spot") : "Full"}</small>
              </button>
            );
          })}
        </div>
        {swaps.length > 0 && (
          <label className="field">Swap with
            <select defaultValue="" onChange={(event) => { const t = swaps[Number(event.target.value)]; if (t) go({ lane: t.lane, slot: t.slot }); }}>
              <option value="" disabled>Choose a bowler in another lane</option>
              {swaps.map((t, i) => <option key={t.id} value={i}>Lane {t.lane + 1}: {niceName(draft.byId.get(t.id)?.name)}</option>)}
            </select>
          </label>
        )}
        {!spot.out && <button type="button" className="btn btn-danger-quiet" onClick={() => go({ out: true })}>Remove from lane</button>}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function ScoreInputs({ who, scores, games, editing, onScore }) {
  const s = bowlerStats(scores, games);
  return (
    <div className="lane-scores">
      <div className="score-games" style={{ "--games": games }}>
        {Array.from({ length: games }, (_, g) => {
          const value = scores?.[g];
          return editing ? (
            <input
              key={g} type="number" inputMode="numeric" min={0} max={MAX_SCORE} placeholder={`G${g + 1}`}
              aria-label={`${niceName(who.name)} game ${g + 1}`}
              value={Number.isInteger(value) ? value : ""}
              onChange={(event) => onScore(who.memberId, g, event.target.value)}
            />
          ) : <span key={g} className="score-cell mono">{Number.isInteger(value) ? value : "–"}</span>;
        })}
      </div>
      <p className="score-sum mono"><span>{number(s.pins)} pins</span><span>{s.games}/{games} games</span><b>{s.games ? s.average.toFixed(1) : "–"}</b></p>
    </div>
  );
}

function Bowler({ who, spot, editing, draft, drag, onPick, onScore }) {
  const member = draft.liveMember(who.memberId);
  return (
    <div
      className={`lane-bowler${drag.over === key(spot) ? " is-over" : ""}`}
      draggable={editing}
      onDragStart={(event) => { drag.start(spot); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", who.memberId); }}
      onDragEnd={drag.end}
      onDragOver={(event) => editing && drag.enter(event, spot)}
      onDragLeave={() => drag.leave(spot)}
      onDrop={(event) => drag.drop(event, spot)}
    >
      <button type="button" className="lane-who" disabled={!editing} onClick={() => onPick(who, spot)} aria-label={editing ? `Move ${niceName(who.name)}` : undefined}>
        <Photo path={member.photo} alt="" />
        <span><strong>{niceName(who.name)}</strong><small>{member.team}</small></span>
        {editing && <span className="grip" aria-hidden="true">::</span>}
      </button>
      {!spot.out && <ScoreInputs who={who} scores={draft.scores[who.memberId]} games={draft.gamesPerBowler} editing={editing} onScore={onScore} />}
    </div>
  );
}

const key = (spot) => (spot.out ? `out-${spot.index ?? "list"}` : `${spot.lane}-${spot.slot ?? "lane"}`);

function useDrag(onMove) {
  const from = useRef(null);
  const [over, setOver] = useState(null);
  return {
    over,
    start: (spot) => { from.current = spot; },
    end: () => { from.current = null; setOver(null); },
    enter: (event, spot) => { if (!from.current) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setOver(key(spot)); },
    leave: (spot) => setOver((current) => (current === key(spot) ? null : current)),
    drop: (event, spot) => {
      if (!from.current) return;
      event.preventDefault();
      event.stopPropagation();
      const source = from.current;
      from.current = null;
      setOver(null);
      onMove(source, spot);
    },
  };
}

function LaneBoard({ draft, editing, onMove, onScore }) {
  const [picked, setPicked] = useState(null);
  const drag = useDrag(onMove);
  const spots = draft.laneCount * draft.perLane;
  const assigned = draft.lanes.reduce((n, lane) => n + lane.slots.filter(Boolean).length, 0);
  const present = draft.bowlers.length;
  const target = (spot) => (editing ? {
    onDragOver: (event) => drag.enter(event, spot),
    onDragLeave: () => drag.leave(spot),
    onDrop: (event) => drag.drop(event, spot),
  } : {});

  return (
    <>
      <div className="lanes">
        {draft.lanes.map((lane, l) => (
          <section key={l} className={`lane${drag.over === key({ lane: l }) ? " is-over" : ""}`} {...target({ lane: l })} aria-label={`Lane ${l + 1}`}>
            <header className="lane-head">
              <h3>Lane {l + 1}</h3>
              {lane.edited && <span className="tag">Edited</span>}
              <span className="dim mono small">{lane.slots.filter(Boolean).length}/{draft.perLane}</span>
            </header>
            <LayoutGroup>
              {lane.slots.map((id, s) => {
                const spot = { lane: l, slot: s };
                const who = id && draft.byId.get(id);
                return who ? (
                  <motion.div layout="position" key={id} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
                    <Bowler who={who} spot={spot} editing={editing} draft={draft} drag={drag} onPick={(w, sp) => setPicked({ who: w, spot: sp })} onScore={onScore} />
                  </motion.div>
                ) : (
                  <div key={`empty-${s}`} className={`lane-empty${drag.over === key(spot) ? " is-over" : ""}`} {...target(spot)}>empty spot</div>
                );
              })}
            </LayoutGroup>
          </section>
        ))}
      </div>
      {editing && <p className="lane-hint">Drag a bowler to another lane or onto someone to swap. On a phone, tap a bowler and choose “Move to Lane X”.</p>}
      <section className={`panel out-list${drag.over === key({ out: true }) ? " is-over" : ""}`} {...target({ out: true })} aria-label="Not assigned">
        <h2>Not assigned / left out</h2>
        <p className="hint-yellow small">
          {present} present, {plural(spots, "spot")}.
          {present > assigned && ` ${draft.unassigned.length} not in a lane.`}
          {spots > assigned && ` ${plural(spots - assigned, "empty spot")}.`}
        </p>
        <p className="dim small">Bowlers removed from a lane show up here, and can be added to any lane with an empty spot.</p>
        {draft.unassigned.length > 0 && (
          <div className="out-bowlers">
            {draft.unassigned.map((id, index) => {
              const who = draft.byId.get(id);
              return who && <Bowler key={id} who={who} spot={{ out: true, index }} editing={editing} draft={draft} drag={drag} onPick={(w, sp) => setPicked({ who: w, spot: sp })} onScore={onScore} />;
            })}
          </div>
        )}
      </section>
      <AnimatePresence>
        {picked && <BowlerMenu key="menu" who={picked.who} spot={picked.spot} draft={draft} onMove={onMove} onClose={() => setPicked(null)} />}
      </AnimatePresence>
    </>
  );
}

// ---- Ranking ----
function Ranking({ draft }) {
  const [team, setTeam] = useState("all");
  const [metric, setMetric] = useState("average");
  const rows = useMemo(() => draft.bowlers
    .map((b) => {
      const live = draft.liveMember(b.memberId);
      return { ...b, team: live.team, photo: live.photo, ...bowlerStats(draft.scores[b.memberId], draft.gamesPerBowler) };
    })
    .filter((r) => r.games > 0 && (team === "all" || r.team === team))
    .sort(METRICS[metric].sort)
    .slice(0, 5), [draft, team, metric]);
  const M = METRICS[metric];
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  const show = (r) => <Counter key={metric} value={M.value(r)} decimals={M.decimals} />;

  return (
    <section className="gap-lg" aria-labelledby="ranking-title">
      <div className="session-head">
        <div><p className="eyebrow">Top 5</p><h2 id="ranking-title">Ranking</h2></div>
      </div>
      <div className="toolbar gap rank-tabs">
        <Tabs id="rank-team" label="Filter by team" value={team} onChange={setTeam} options={[{ value: "all", label: "Everyone" }, ...TEAMS.map((t) => ({ value: t, label: t }))]} />
        <Tabs id="rank-metric" label="Sort by" value={metric} onChange={setMetric} options={Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label }))} />
      </div>
      {!rows.length ? <p className="empty">No scores yet{team !== "all" ? ` for ${team}` : ""}. Enter scores in the lanes and the ranking appears here.</p> : (
        <LayoutGroup>
          <div className="podium">
            {podium.map((r) => {
              const place = rows.indexOf(r) + 1;
              return (
                <motion.div layout key={r.memberId} className="podium-cell" data-place={place} transition={{ type: "spring", stiffness: 220, damping: 28 }}>
                  <div className="podium-card">
                    <Photo path={r.photo} alt={niceName(r.name)} />
                    <span className="podium-place">{place}</span>
                    <span className="podium-info">
                      <span className="podium-name">{niceName(r.name)}</span>
                      <span className="podium-team">{r.team}</span>
                      <span className="podium-value">{show(r)}</span>
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <ul className="rank-rows">
            {rows.slice(3).map((r, i) => (
              <motion.li layout key={r.memberId} className="rank-row">
                <span className="rank-pos mono">{i + 4}</span>
                <Photo path={r.photo} alt="" />
                <span className="rank-who"><b>{niceName(r.name)}</b><small>{r.team}</small></span>
                <span className="rank-value">{show(r)}</span>
              </motion.li>
            ))}
          </ul>
        </LayoutGroup>
      )}
      <p className="dim small gap">Tie-break: same average → more total pins ranks higher. Updates live when a score changes.</p>
    </section>
  );
}

// ---- One tournament ----
const toBody = (d) => ({
  name: d.name, date: d.date, location: d.location, laneCount: d.laneCount, perLane: d.perLane, gamesPerBowler: d.gamesPerBowler, sessionId: d.sessionId,
  lanes: d.lanes.map((lane) => ({ slots: lane.slots, edited: lane.edited })), unassigned: d.unassigned, scores: d.scores,
});

function TournamentDetail({ id, editing, onBack, onEdit, onChanged }) {
  const { members } = useAdmin();
  const { confirmAction, run, toast } = useFeedback();
  const [draft, setDraft] = useState(null);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirtyState] = useState(false);
  // A ref too, so leaving right after saving or deleting isn't stopped by a stale value.
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value) => { dirtyRef.current = value; setDirtyState(value); }, []);
  const [details, setDetails] = useState(false);
  const url = `${TOURNAMENTS}/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    try { setDraft((await api(url)).tournament); setDirty(false); } catch { setMissing(true); }
  }, [url, setDirty]);
  useEffect(() => { load(); }, [load]);

  // Ask before leaving with unsaved changes, inside the admin and when closing the tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirmAction({ title: "Leave without saving?", body: "Your lane changes and scores for this tournament aren't saved yet.", confirm: "Leave", cancel: "Stay", danger: true })
      .then((yes) => (yes ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirmAction]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const memberMap = useMemo(() => new Map(members.map((m) => [String(m.id), m])), [members]);
  const view = useMemo(() => draft && {
    ...draft,
    byId: new Map(draft.bowlers.map((b) => [b.memberId, b])),
    // Current team and photo when the member still exists, otherwise what was saved.
    liveMember: (memberId) => {
      const saved = draft.bowlers.find((b) => b.memberId === memberId) || {};
      const m = memberMap.get(memberId);
      return { team: m?.team || saved.team || "", photo: m?.photo || saved.photo || "" };
    },
  }, [draft, memberMap]);

  if (missing) return <><p className="empty">This tournament no longer exists.</p><button type="button" className="btn btn-secondary" onClick={onBack}>Back to tournaments</button></>;
  if (!view) return <Loading />;

  const change = (next) => { setDraft((d) => ({ ...d, ...next })); setDirty(true); };
  const moveBowler = (from, to) => {
    const result = move(draft, from, to, draft.perLane);
    if (result.warning) { toast(result.warning, true); return; }
    if (result.state !== draft) change(result.state);
  };
  const setScore = (memberId, game, raw) => {
    const trimmed = String(raw).trim();
    let value = null;
    if (trimmed !== "") {
      value = Math.floor(Number(trimmed));
      if (!Number.isFinite(value) || value < 0) return;
      if (value > MAX_SCORE) { toast(`A game can't be more than ${MAX_SCORE}.`, true); return; }
    }
    const list = [...(draft.scores[memberId] || Array(draft.gamesPerBowler).fill(null))];
    list[game] = value;
    change({ scores: { ...draft.scores, [memberId]: list } });
  };
  const regenerate = async () => {
    if (draft.lanes.some((lane) => lane.edited)) {
      const yes = await confirmAction({ title: "Reshuffle every lane?", body: "Lanes you changed by hand will be shuffled too. Scores stay with each bowler.", confirm: "Reshuffle", cancel: "Keep lanes" });
      if (!yes) return;
    }
    change(generate(draft.bowlers.map((b) => b.memberId), draft.laneCount, draft.perLane));
  };
  const save = async (next = draft) => {
    const { ok, result } = await run(() => api(url, { method: "PUT", body: toBody(next) }), "Tournament saved.");
    if (ok) { setDraft(result.tournament); setDirty(false); onChanged(); }
    return ok;
  };
  const applyDetails = async (form) => {
    const laneCount = Number(form.laneCount);
    const perLane = Number(form.perLane);
    const gamesPerBowler = Number(form.gamesPerBowler);
    const sized = resize(draft, laneCount, perLane);
    const scores = Object.fromEntries(Object.entries(draft.scores).map(([k, list]) => [k, Array.from({ length: gamesPerBowler }, (_, g) => list?.[g] ?? null)]));
    const next = { ...draft, ...sized, scores, name: form.name, date: form.date, location: form.location, laneCount, perLane, gamesPerBowler, sessionId: form.sessionId };
    if (await save(next)) setDetails(false);
  };
  const remove = async () => {
    const yes = await confirmAction({ title: `Delete ${draft.name}?`, body: "Its lanes, scores and ranking are deleted. Attendance stays. This can't be undone.", confirm: "Delete tournament", cancel: "Keep", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(url, { method: "DELETE" }), "Tournament deleted.");
    if (ok) { setDirty(false); onChanged(); onBack(true); }
  };

  return (
    <>
      <div className="session-head">
        <div>
          <button type="button" className="link-back" onClick={() => onBack()}>← All tournaments</button>
          <h2>{draft.name}</h2>
          <p className="dim">{[draft.date, draft.location, `${draft.laneCount} lanes × ${draft.perLane} bowlers`, `${draft.gamesPerBowler} games`, `${draft.bowlers.length} present`].filter(Boolean).join(" | ")}</p>
        </div>
        {dirty && <span className="pill-state pending top">Unsaved changes</span>}
      </div>
      <div className="btn-row gap">
        {editing ? (
          <>
            <button type="button" className="btn btn-primary" onClick={regenerate}>{draft.lanes.length ? "Generate lanes again" : "Generate lanes"}</button>
            <ActionButton className="btn btn-primary" busyText="Saving…" onAction={() => save()} disabled={!dirty}>Save tournament</ActionButton>
            <button type="button" className="btn btn-secondary" onClick={() => setDetails(true)}>Details</button>
            <ActionButton className="btn btn-danger-quiet" onAction={remove}>Delete</ActionButton>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onEdit}>Edit</button>
            <ActionButton className="btn btn-danger-quiet" onAction={remove}>Delete</ActionButton>
          </>
        )}
      </div>
      {!draft.lanes.length ? (
        <p className="empty">{editing ? `No lanes yet. Press Generate lanes to shuffle the ${draft.bowlers.length} present bowlers into ${plural(draft.laneCount, "lane")}.` : "No lanes yet. Press Edit, then Generate lanes."}</p>
      ) : (
        <div className="gap-lg"><LaneBoard draft={view} editing={editing} onMove={moveBowler} onScore={setScore} /></div>
      )}
      <Ranking draft={view} />
      <AnimatePresence>
        {details && <EditDetails key="details" draft={draft} onClose={() => setDetails(false)} onApply={applyDetails} />}
      </AnimatePresence>
    </>
  );
}

// ---- List ----
function TournamentList({ items, onOpen, onEdit, onDelete }) {
  if (!items) return <Loading />;
  if (!items.length) return <p className="empty">No tournaments yet. Create one from a session's present members.</p>;
  return (
    <div className="grid">
      {items.map((t) => (
        <article key={t.id} className="session-card tournament-card">
          <button type="button" className="tournament-open" onClick={() => onOpen(t.id)}>
            <strong>{t.name}</strong>
            <span className="dim">{[t.date, t.location].filter(Boolean).join(" | ")}</span>
          </button>
          <span className="tournament-meta">
            <span className="dim small">{plural(t.laneCount, "lane")} | {plural(t.bowlerCount, "bowler")}</span>
            <b className="mono">{t.top ? `Top 1: ${niceName(t.top.name)}  ${t.top.average.toFixed(1)}` : t.generated ? "No scores yet" : "Lanes not generated"}</b>
          </span>
          <span className="btn-row">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(t.id)}>Open</button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => onEdit(t.id)}>Edit</button>
            <ActionButton className="btn btn-danger-quiet btn-small" onAction={() => onDelete(t)}>Delete</ActionButton>
          </span>
        </article>
      ))}
    </div>
  );
}

export default function Tournament() {
  const { loaded } = useAdmin();
  const { confirmAction, run } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [problem, setProblem] = useState("");
  const [creating, setCreating] = useState(false);
  const id = params.get("t") || "";
  const editing = params.get("mode") === "edit";

  const load = useCallback(async () => {
    try { setItems((await api(TOURNAMENTS)).tournaments); setProblem(""); } catch (failure) { setProblem(failure.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (tid, edit = false) => setParams(tid ? { t: tid, ...(edit ? { mode: "edit" } : {}) } : {});
  const removeFromList = async (t) => {
    const yes = await confirmAction({ title: `Delete ${t.name}?`, body: "Its lanes, scores and ranking are deleted. Attendance stays. This can't be undone.", confirm: "Delete tournament", cancel: "Keep", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(`${TOURNAMENTS}/${encodeURIComponent(t.id)}`, { method: "DELETE" }), "Tournament deleted.");
    if (ok) load();
  };

  return (
    <>
      <PageHead eyebrow="Tournament" title="Tournaments" intro="Create a tournament, auto-fill lanes, enter scores, see the ranking. Only admins can see this page.">
        {!id && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Create tournament</button>}
      </PageHead>
      {problem && <p className="warn" role="alert">{problem}</p>}
      {!loaded ? <Loading /> : id
        ? <TournamentDetail key={`${id}-${editing}`} id={id} editing={editing} onBack={() => open("")} onEdit={() => open(id, true)} onChanged={load} />
        : <TournamentList items={items} onOpen={(tid) => open(tid)} onEdit={(tid) => open(tid, true)} onDelete={removeFromList} />}
      <AnimatePresence>
        {creating && <CreateTournament key="new" onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); load(); open(t.id, true); }} />}
      </AnimatePresence>
    </>
  );
}
