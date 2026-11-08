// Training sessions and who came. Attendance can be marked by hand or with face check-in.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router";
import { ActionButton, Loading, Modal, PageHead, Photo, Tabs, useFeedback } from "../components/ui.jsx";
import FaceRegister from "../components/FaceRegister.jsx";
import FaceScanner from "../components/FaceScanner.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName, plural } from "../lib/api.js";

const SESSIONS = "/api/admin/training-sessions";
const FACES = "/api/admin/faces";
const METHOD_LABELS = { face: "Face", "face-confirmed": "Face, confirmed", manual: "By hand" };
const today = () => new Date().toLocaleDateString("en-CA");
const matches = (member, needle) => member.name.toLowerCase().includes(needle.trim().toLowerCase());

function NewSession({ onClose, onCreated }) {
  const { run } = useFeedback();
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    const { ok, result } = await run(() => api(SESSIONS, { method: "POST", body }), "Session opened.");
    setBusy(false);
    if (ok) onCreated(result.session);
  };
  return (
    <Modal onClose={onClose}>
      <form className="dialog-body" onSubmit={submit}>
        <h2 className="dialog-title">Open a session</h2>
        <label className="field">Title<input name="title" required maxLength={120} defaultValue="Training" autoFocus /></label>
        <label className="field">Date<input name="date" type="date" required defaultValue={today()} /></label>
        <label className="field">Location <small>Optional.</small><input name="location" maxLength={200} /></label>
        <label className="field">Notes <small>Optional.</small><textarea name="notes" rows={2} maxLength={1000} /></label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Opening…" : "Open session"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CheckinPhoto({ sessionUrl, row, onClose }) {
  const when = new Date(row.recordedAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Modal onClose={onClose}>
      <div className="dialog-body">
        <h2 className="dialog-title">{niceName(row.memberName)}</h2>
        <img className="photo-view" src={`${sessionUrl}/photos/${encodeURIComponent(row.id)}`} alt={`${niceName(row.memberName)} at check-in`} />
        <p className="dim small">Checked in {when} · {METHOD_LABELS[row.method] || "By hand"}{row.matchScore ? ` · match ${row.matchScore.toFixed(2)}` : ""}</p>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function RosterRow({ member, row, open, sessionUrl, onMark, onUndo, onPhoto }) {
  return (
    <li className="roster-row">
      {row?.photo
        ? <button type="button" className="checkin-photo" onClick={() => onPhoto(row)} aria-label={`See ${niceName(member.name)}'s check-in photo`}><img src={`${sessionUrl}/photos/${encodeURIComponent(row.id)}`} alt="" loading="lazy" /></button>
        : <Photo path={member.photo} alt="" />}
      <div className="roster-name">
        <strong>{niceName(member.name)}</strong>
        <span className="dim">{member.team}{row ? ` · ${METHOD_LABELS[row.method] || "By hand"}` : ""}</span>
      </div>
      {row && <span className={`pill-state ${row.status === "present" ? "approved" : "rejected"}`}>{row.status === "present" ? "Present" : "Absent"}</span>}
      {open && (
        <div className="btn-row">
          {row?.status !== "present" && <ActionButton className="btn btn-primary btn-small" onAction={() => onMark(member, true)}>Present</ActionButton>}
          {row?.status !== "absent" && <ActionButton className="btn btn-secondary btn-small" onAction={() => onMark(member, false)}>Absent</ActionButton>}
          {row && <ActionButton className="btn btn-secondary btn-small" onAction={() => onUndo(member.id)}>Undo</ActionButton>}
        </div>
      )}
    </li>
  );
}

const timeOf = (row) => new Date(row.recordedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// Every check-in photo from one session, in the order people arrived.
function PhotoGrid({ sessionUrl, rows, onPhoto }) {
  const photos = rows.filter((row) => row.photo).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (!photos.length) return <p className="empty">No check-in photos yet. They're saved when someone is checked in by face.</p>;
  return (
    <ul className="photo-grid">
      {photos.map((row) => (
        <li key={row.id}>
          <button type="button" onClick={() => onPhoto(row)} aria-label={`See ${niceName(row.memberName)}'s check-in photo`}>
            <img src={`${sessionUrl}/photos/${encodeURIComponent(row.id)}`} alt="" loading="lazy" />
            <span className="photo-name">{niceName(row.memberName)}</span>
            <span className="photo-meta mono">{timeOf(row)} · {row.method === "face" ? "Auto" : "Confirmed"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SessionDetail({ id, onBack, onChanged }) {
  const { members } = useAdmin();
  const { confirmAction, run } = useFeedback();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState(null);
  const [view, setView] = useState("roster");
  const url = `${SESSIONS}/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    try { setData(await api(url)); } catch { setMissing(true); }
  }, [url]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => new Map((data?.attendance || []).map((row) => [row.memberId, row])), [data]);
  const shown = useMemo(() => members.filter((m) => matches(m, query)), [members, query]);

  if (missing) return <><p className="empty">This session no longer exists.</p><button type="button" className="btn btn-secondary" onClick={onBack}>Back to sessions</button></>;
  if (!data) return <Loading />;
  const { session } = data;
  const present = data.attendance.filter((row) => row.status === "present").length;
  const photoCount = data.attendance.filter((row) => row.photo).length;

  const mark = async (member, isPresent) => {
    const { ok } = await run(() => api(`${url}/attendance`, { method: "POST", body: { memberId: member.id, present: isPresent } }));
    if (ok) load();
  };
  const undo = async (memberId) => {
    const { ok } = await run(() => api(`${url}/attendance/${encodeURIComponent(memberId)}`, { method: "DELETE" }), "Attendance removed. The camera won't mark them again this session.");
    if (ok) load();
    return ok;
  };
  const setOpen = async (open) => {
    const { ok } = await run(() => api(url, { method: "PATCH", body: { open } }), open ? "Session reopened." : "Session closed.");
    if (ok) { if (!open) setScanning(false); load(); onChanged(); }
  };
  const remove = async () => {
    const yes = await confirmAction({ title: `Delete ${session.title}?`, body: `This also deletes its attendance for ${plural(data.attendance.length, "member")}. This can't be undone.`, confirm: "Delete session", cancel: "Keep", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(url, { method: "DELETE" }), "Session deleted.");
    if (ok) { onChanged(); onBack(); }
  };

  return (
    <>
      <div className="session-head">
        <div>
          <button type="button" className="link-back" onClick={onBack}>← All sessions</button>
          <h2>{session.title}</h2>
          <p className="dim">{[session.date, session.location].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="btn-row top">
          <span className={`pill-state ${session.open ? "is-on" : ""}`}>{session.open ? "Open" : "Closed"}</span>
          <span className="pill-state mono">{present} / {members.length} present</span>
        </div>
      </div>
      <div className="btn-row gap">
        {session.open && <button type="button" className="btn btn-primary" onClick={() => setScanning((on) => !on)}>{scanning ? "Stop camera" : "Start face check-in"}</button>}
        <ActionButton className="btn btn-secondary" onAction={() => setOpen(!session.open)}>{session.open ? "Close session" : "Reopen session"}</ActionButton>
        <ActionButton className="btn btn-danger-quiet" onAction={remove}>Delete session</ActionButton>
      </div>
      {!session.open && <p className="dim gap">This session is closed, so its attendance is locked.</p>}
      {scanning && session.open && !registering && (
        <div className="gap"><FaceScanner sessionUrl={url} onChange={load} onRegister={() => setRegistering(true)} onUndo={undo} /></div>
      )}
      <div className="toolbar gap-lg">
        <Tabs id="session-view" label="Session view" value={view} onChange={setView} options={[{ value: "roster", label: "Members" }, { value: "photos", label: `Photos (${photoCount})` }]} />
        {view === "roster" && <input type="search" placeholder="Search members" aria-label="Search members" value={query} onChange={(event) => setQuery(event.target.value)} />}
      </div>
      {view === "photos" ? <PhotoGrid sessionUrl={url} rows={data.attendance} onPhoto={setViewing} /> : (
        <>
          <ul className="roster">
            {shown.map((member) => <RosterRow key={member.id} member={member} row={rows.get(member.id)} open={session.open} sessionUrl={url} onMark={mark} onUndo={undo} onPhoto={setViewing} />)}
          </ul>
          {!shown.length && <p className="empty">No members match that search.</p>}
        </>
      )}
      <AnimatePresence>
        {registering && <FaceRegister key="register" onClose={() => setRegistering(false)} onDone={() => setRegistering(false)} />}
        {viewing && <CheckinPhoto key="photo" sessionUrl={url} row={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </>
  );
}

function SessionList({ sessions, onPick, onNew }) {
  if (!sessions) return <Loading />;
  return (
    <>
      <div className="toolbar"><button type="button" className="btn btn-primary" onClick={onNew}>Open a session</button></div>
      {!sessions.length && <p className="empty">No sessions yet. Open one when training starts.</p>}
      <div className="grid">
        {sessions.map((session) => (
          <button key={session.id} type="button" className="session-card" onClick={() => onPick(session.id)}>
            <span>
              <strong>{session.title}</strong>
              <span className="dim">{[session.date, session.location].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="btn-row">
              <span className={`pill-state ${session.open ? "is-on" : ""}`}>{session.open ? "Open" : "Closed"}</span>
              <span className="pill-state mono">{session.presentCount} present</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function FacesTab() {
  const { members } = useAdmin();
  const { confirmAction, run } = useFeedback();
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState("");
  const [registering, setRegistering] = useState(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try { setData(await api(FACES)); setProblem(""); } catch (failure) { setProblem(failure.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (problem) return <p className="warn" role="alert">{problem}</p>;
  if (!data) return <Loading />;
  const registered = new Map(data.registered.map((item) => [item.memberId, item]));

  const remove = async (member) => {
    const name = niceName(member.name);
    const yes = await confirmAction({ title: `Delete ${name}'s face data?`, body: "The camera will stop recognizing them. Their attendance history stays.", confirm: "Delete face data", cancel: "Keep", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(`${FACES}/${encodeURIComponent(member.id)}`, { method: "DELETE" }), `Face data deleted for ${name}.`);
    if (ok) load();
  };

  return (
    <>
      {!data.service.ready && <p className="warn" role="alert">Face check-in is offline, so scanning won't work right now. You can still mark attendance by hand.</p>}
      <div className="toolbar">
        <input type="search" placeholder="Search members" aria-label="Search members" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="btn btn-primary" disabled={!data.service.ready} onClick={() => setRegistering({ memberId: "" })}>Register a face</button>
        <span className="pill-state mono">{data.registered.length} registered</span>
      </div>
      <ul className="roster">
        {members.filter((m) => matches(m, query)).map((member) => {
          const face = registered.get(member.id);
          return (
            <li key={member.id} className="roster-row">
              <Photo path={member.photo} alt="" />
              <div className="roster-name">
                <strong>{niceName(member.name)}</strong>
                <span className="dim">{member.team}</span>
              </div>
              <span className={`pill-state ${face && !face.outdated ? "approved" : face ? "pending" : ""}`}>{face ? (face.outdated ? "Register again" : "Registered") : "Not registered"}</span>
              <div className="btn-row">
                <button type="button" className="btn btn-secondary btn-small" disabled={!data.service.ready} onClick={() => setRegistering({ memberId: member.id })}>{face ? "Scan again" : "Register"}</button>
                {face && <ActionButton className="btn btn-danger-quiet btn-small" onAction={() => remove(member)}>Delete face data</ActionButton>}
              </div>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {registering && <FaceRegister key="register" memberId={registering.memberId} onClose={() => setRegistering(null)} onDone={() => { setRegistering(null); load(); }} />}
      </AnimatePresence>
    </>
  );
}

export default function Attendance() {
  const { loaded } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("sessions");
  const [sessions, setSessions] = useState(null);
  const [problem, setProblem] = useState("");
  const [adding, setAdding] = useState(false);
  const sessionId = params.get("session") || "";

  const load = useCallback(async () => {
    try { setSessions((await api(SESSIONS)).sessions); setProblem(""); } catch (failure) { setProblem(failure.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = (id) => setParams(id ? { session: id } : {});
  return (
    <>
      <PageHead eyebrow="Training" title="Attendance" intro="Open a session, then check members in by face or by hand. Only admins can see this page." />
      <div className="toolbar">
        <Tabs id="attendance" label="Attendance view" value={tab} onChange={setTab} options={[{ value: "sessions", label: "Sessions" }, { value: "faces", label: "Registered faces" }]} />
      </div>
      {problem && <p className="warn" role="alert">{problem}</p>}
      {!loaded ? <Loading /> : tab === "faces" ? <FacesTab /> : sessionId
        ? <SessionDetail key={sessionId} id={sessionId} onBack={() => pick("")} onChanged={load} />
        : <SessionList sessions={sessions} onPick={pick} onNew={() => setAdding(true)} />}
      <AnimatePresence>
        {adding && <NewSession key="new" onClose={() => setAdding(false)} onCreated={(session) => { setAdding(false); load(); pick(session.id); }} />}
      </AnimatePresence>
    </>
  );
}
