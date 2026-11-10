// A signed-in member's own page: how they're bowling, how close they are to moving up a
// squad, their training attendance, and their scores. Only they can see it.
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Counter, Reveal, Tile } from "../components/motion.jsx";
import { AverageChart, DAY_LONG, GameRow, Promotion, STATUS, Training, listOf, longDate, shortDate } from "../components/MemberStats.jsx";
import { Icon } from "../components/Shell.jsx";
import { memberApi, useMemberSession } from "../data/MemberSession.jsx";
import { TEAM_COLOR, formatNumber, niceName, stats, thumbPhoto } from "../lib/team.js";



// ---- Signing in from the Telegram link ----

function RememberStep({ ticket }) {
  const { signIn } = useMemberSession();
  const [, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choose = async (remember) => {
    setBusy(true);
    setError("");
    try {
      await signIn(ticket, remember);
      setParams({}, { replace: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  return (
    <section className="wrap portal-gate">
      <Tile className="pad-lg portal-gate-card">
        <p className="label label--accent">Welcome back</p>
        <h1 className="display-md">Remember this device?</h1>
        <p className="dim">We save a sign-in cookie on this device, so next time we know it's you. You'll stay signed in as long as you visit at least once every 6 months. On a shared or borrowed device, choose not this time.</p>
        <div className="actions">
          <button type="button" className="pill" disabled={busy} onClick={() => choose(true)}>Yes, keep me signed in</button>
          <button type="button" className="pill pill--ghost" disabled={busy} onClick={() => choose(false)}>Not this time</button>
        </div>
        {error && <p className="portal-error" role="alert">{error} <Link to="/login" viewTransition>How to get a new link</Link></p>}
      </Tile>
    </section>
  );
}

function SendScore({ onSent }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      await memberApi("/api/member/score-requests", { method: "POST", body: new FormData(form) });
      form.reset();
      setOpen(false);
      setMessage("Score sent. An admin will review it soon.");
      onSent();
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="send">
      {!open && <button type="button" className="pill pill--sm" onClick={() => setOpen(true)}>Send a new score</button>}
      {open && (
        <form className="send-form" onSubmit={submit}>
          <div className="field-row">
            <label className="field"><span>Games</span><input name="games" type="number" min="1" max="100" required /></label>
            <label className="field"><span>Total pins</span><input name="scores" type="number" min="0" max="100000" required /></label>
          </div>
          <label className="field"><span>Note <small>Optional</small></span><input name="notes" maxLength={500} /></label>
          <label className="field"><span>Photos of the lane screen <small>Up to 6</small></span><input name="proofs" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
          <div className="actions">
            <button type="submit" className="pill pill--sm" disabled={busy}>{busy ? "Sending…" : "Send for review"}</button>
            <button type="button" className="pill pill--ghost pill--sm" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {message && <p className="dim gap-sm" role="status">{message}</p>}
    </div>
  );
}

function Details({ member, onSaved }) {
  const profile = member.profile || {};
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await memberApi("/api/member/profile", { method: "PATCH", body: new FormData(event.currentTarget) });
      setMessage("Your details were saved.");
      onSaved();
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="portal-more">
      <summary>My details</summary>
      <form className="send-form" onSubmit={submit}>
        <div className="field-row">
          <label className="field"><span>Full name</span><input name="name" maxLength={120} defaultValue={profile.name || ""} /></label>
          <label className="field"><span>Phone</span><input name="phone" maxLength={40} inputMode="tel" defaultValue={profile.phone || ""} /></label>
          <label className="field"><span>Date of birth</span><input name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth || ""} /></label>
          <label className="field"><span>City or province</span><input name="cityProvince" maxLength={120} defaultValue={profile.cityProvince || ""} /></label>
        </div>
        <label className="field"><span>Gender</span>
          <select name="gender" defaultValue={profile.gender || ""}>
            <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
          </select>
        </label>
        <label className="field"><span>Profile photo <small>Optional</small></span><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        <div className="actions"><button type="submit" className="pill pill--sm" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
        {message && <p className="dim" role="status">{message}</p>}
      </form>
    </details>
  );
}

// ---- The page ----

export default function Portal() {
  const { status, me, refresh, signOut } = useMemberSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const ticket = params.get("ticket");

  const loadRequests = () => memberApi("/api/member/score-requests").then((json) => setRequests(json.requests || [])).catch(() => {});
  useEffect(() => { if (status === "in") loadRequests(); }, [status]);

  if (ticket) return <RememberStep ticket={ticket} />;
  if (status === "loading") return <div className="page-loading" />;
  if (status === "out") return <Navigate to="/login" replace />;

  const { member, attendance, games, schedule, notifications, promotion } = me;
  const s = stats(member);
  const name = niceName(member.profile?.name || member.name);
  const rate = attendance.total ? Math.round((attendance.present / attendance.total) * 100) : null;
  const leave = async () => { await signOut(); navigate("/", { viewTransition: true }); };

  return (
    <div className="wrap portal" style={{ "--c": TEAM_COLOR[member.team] }}>
      <header className="portal-head">
        <img src={thumbPhoto(member.profile?.photo || member.photo)} alt="" onError={(event) => { event.currentTarget.src = "/assets/member-placeholder.svg"; }} />
        <div>
          <p className="label label--accent">My portal · {member.team}</p>
          <h1 className="display-md">{name}</h1>
        </div>
        <button type="button" className="text-button portal-out" onClick={leave}>Sign out</button>
      </header>

      <div className="portal-stats">
        <Tile className="pad-lg is-accent"><p className="label">Average</p><p className="stat">{s.games ? <Counter value={s.avg} decimals={1} /> : "—"}</p></Tile>
        <Tile className="pad-lg"><p className="label">Games</p><p className="stat"><Counter value={s.games} /></p></Tile>
        <Tile className="pad-lg"><p className="label">Total pins</p><p className="stat"><Counter value={s.scores} /></p></Tile>
        <Tile className="pad-lg"><p className="label">Attendance</p><p className="stat">{rate === null ? "—" : <><Counter value={rate} />%</>}</p></Tile>
      </div>

      <div className="portal-grid">
        <Promotion member={member} promotion={promotion} />
        <Training schedule={schedule} attendance={attendance} />
      </div>

      <Reveal className="portal-block">
        <h2 className="tile-title">Performance</h2>
        <p className="dim portal-sub">Your average for each set of games.</p>
        <AverageChart games={games} target={promotion?.average} />
      </Reveal>

      <div className="portal-grid">
        <Reveal className="portal-block">
          <h2 className="tile-title">Score history</h2>
          {games.length ? <ul className="portal-list">{games.slice(0, 12).map((row, i) => <GameRow key={`${row.at}${i}`} row={row} />)}</ul> : <p className="dim">No games recorded yet.</p>}
          <h2 className="tile-title gap-top">My score requests</h2>
          {requests.length ? (
            <ul className="portal-list">
              {requests.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <div><b>{formatNumber(r.games)} {r.games === 1 ? "game" : "games"} · {formatNumber(r.scores)} pins</b><small>Sent {longDate(r.createdAt)}{r.reviewReason ? ` · ${r.reviewReason}` : ""}</small></div>
                  <span className={`state is-${r.status}`}>{STATUS[r.status] || r.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="dim">You haven't sent any scores from here yet.</p>}
          <SendScore onSent={() => { loadRequests(); }} />
        </Reveal>

        <Reveal className="portal-block">
          <h2 className="tile-title">Attendance</h2>
          {attendance.sessions.length ? (
            <ul className="portal-list">
              {attendance.sessions.slice(0, 12).map((session) => (
                <li key={session.id}>
                  <div><b>{session.title}</b><small>{longDate(session.date)}{session.location ? ` · ${session.location}` : ""}</small></div>
                  <span className={`state is-${session.status}`}>{STATUS[session.status]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="dim">No sessions yet. Training is every {listOf((schedule.days || []).map((d) => DAY_LONG[d]))}.</p>}
        </Reveal>
      </div>

      {notifications.length > 0 && (
        <Reveal className="portal-block">
          <h2 className="tile-title">Messages from the team</h2>
          <ul className="portal-list">
            {notifications.slice(0, 6).map((n) => <li key={n.id}><div><b>{n.title}</b><small>{n.message}</small></div><small className="mono">{shortDate(n.createdAt)}</small></li>)}
          </ul>
        </Reveal>
      )}

      <Details member={member} onSaved={refresh} />
      <p className="portal-foot"><Link to={`/members/${encodeURIComponent(member.slug || member.id)}`} viewTransition className="text-link">See my public profile <Icon name="arrow" size={18} /></Link></p>
    </div>
  );
}
