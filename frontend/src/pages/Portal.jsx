// A signed-in member's own page: how they're bowling, how close they are to moving up a
// squad, their training attendance, and their scores. Only they can see it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { motion } from "motion/react";
import { Counter, Reveal, Tile } from "../components/motion.jsx";
import { Icon } from "../components/Shell.jsx";
import { memberApi, useMemberSession } from "../data/MemberSession.jsx";
import { TEAM_COLOR, formatNumber, niceName, stats, thumbPhoto } from "../lib/team.js";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STATUS = { present: "Present", absent: "Absent", missed: "Missed", open: "Open", pending: "Waiting", approved: "Approved", rejected: "Not approved" };

const toDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value));
const shortDate = (value) => toDate(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDate = (value) => toDate(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const signed = (value) => `${Number(value) > 0 ? "+" : ""}${formatNumber(value)}`;
const listOf = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words.join(""));

function nextTraining(days) {
  const today = new Date();
  for (let i = 0; i < 8; i += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (days.includes(date.getDay())) {
      if (i === 0) return "Today";
      if (i === 1) return "Tomorrow";
      return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
    }
  }
  return "Not set";
}

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

// ---- Pieces of the portal ----

function Promotion({ member, promotion }) {
  const s = stats(member);
  if (!promotion) {
    return (
      <Tile className="pad-lg promo full">
        <p className="label label--accent">Squad</p>
        <h2 className="tile-title">You're in Team A</h2>
        <p className="dim">The top squad. Keep your average strong and help the next bowlers up.</p>
      </Tile>
    );
  }
  const reached = s.games > 0 && s.avg >= promotion.average;
  const percent = s.games ? Math.min(100, (s.avg / promotion.average) * 100) : 0;
  return (
    <Tile className={`pad-lg promo full${reached ? " is-reached" : ""}`}>
      <p className="label label--accent">Road to {promotion.next}</p>
      <h2 className="tile-title">
        {!s.games ? `Average ${promotion.average} to move up` : reached ? `You've reached ${promotion.average}!` : `${(promotion.average - s.avg).toFixed(1)} pins per game to go`}
      </h2>
      <div className="promo-bar" role="progressbar" aria-label={`Average towards ${promotion.average}`} aria-valuemin={0} aria-valuemax={promotion.average} aria-valuenow={Math.round(s.avg)}>
        <motion.i initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} />
      </div>
      <p className="promo-scale mono"><span>{s.games ? s.avg.toFixed(1) : "—"} now</span><span>{promotion.average} for {promotion.next}</span></p>
      <p className="dim">
        {!s.games ? `Bowl your first games to start your road to ${promotion.next}.`
          : reached ? `Talk to your coach about moving up to ${promotion.next}.`
            : `Average ${promotion.average} or more to move up from ${member.team} to ${promotion.next}.`}
      </p>
    </Tile>
  );
}

function Training({ schedule, attendance }) {
  const days = schedule.days || [];
  const today = new Date().getDay();
  const rate = attendance.total ? Math.round((attendance.present / attendance.total) * 100) : null;
  const recent = attendance.sessions.filter((s) => s.status !== "open").slice(0, 12).reverse();
  return (
    <Tile className="pad-lg full">
      <p className="label label--accent">Training</p>
      <h2 className="tile-title">Next: {nextTraining(days)}</h2>
      <div className="week" aria-label={`Training every ${listOf(days.map((d) => DAY_LONG[d]))}`}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => <span key={d} className={`day${days.includes(d) ? " is-on" : ""}${d === today ? " is-today" : ""}`}>{DAY_SHORT[d]}</span>)}
      </div>
      <p className="dim">{rate === null ? "Your attendance shows here after your first session." : `You came to ${attendance.present} of ${attendance.total} ${attendance.total === 1 ? "session" : "sessions"} since your first one.`}</p>
      {recent.length > 0 && (
        <div className="dots" aria-hidden="true">{recent.map((s) => <span key={s.id} className={`dot is-${s.status}`} title={`${longDate(s.date)}: ${STATUS[s.status]}`} />)}</div>
      )}
    </Tile>
  );
}

// Average for each set of games, oldest first, against the average needed to move up.
function AverageChart({ games, target }) {
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  // Drawn at its real width, so labels stay the same size on a phone and a wide screen.
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = wrap.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = useMemo(() => games.filter((row) => row.kind !== "corrected" && row.games > 0 && row.pins > 0)
    .slice().reverse().map((row) => ({ ...row, avg: row.pins / row.games })), [games]);
  if (points.length < 2) return <p className="dim" ref={wrap}>Your chart appears after two sets of games.</p>;

  const W = Math.max(260, width), H = W < 480 ? 200 : 240, L = 36, R = 12, T = 16, B = 28;
  const values = points.map((p) => p.avg).concat(target ? [target] : []);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 15) / 10) * 10);
  const hi = Math.ceil((Math.max(...values) + 15) / 10) * 10;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = [lo, Math.round((lo + hi) / 20) * 10, hi];
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join("");
  const last = points[points.length - 1];

  const pick = (event) => {
    const box = wrap.current.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((at - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const shown = hover === null ? null : points[hover];

  return (
    <div className="chart" ref={wrap} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average per set of games, from ${Math.round(points[0].avg)} to ${Math.round(last.avg)}${target ? `, against ${target} needed to move up` : ""}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={L - 8} y={y(t)} className="chart-tick" textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {target && target <= hi && (
          <g>
            <line x1={L} x2={W - R} y1={y(target)} y2={y(target)} className="chart-target" />
            <text x={W - R} y={y(target) - 6} className="chart-target-label" textAnchor="end">{target} to move up</text>
          </g>
        )}
        <path d={path} className="chart-line" />
        {points.map((p, i) => <circle key={`${p.at}${i}`} cx={x(i)} cy={y(p.avg)} r={hover === i ? 6 : 4} className="chart-dot" />)}
        {shown && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="chart-cross" />}
        <text x={L} y={H - 6} className="chart-tick">{shortDate(points[0].at)}</text>
        <text x={W - R} y={H - 6} className="chart-tick" textAnchor="end">{shortDate(last.at)}</text>
      </svg>
      {shown && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{shown.avg.toFixed(1)} avg</b>
          <span>{formatNumber(shown.games)} {shown.games === 1 ? "game" : "games"} · {formatNumber(shown.pins)} pins</span>
          <span>{longDate(shown.at)}</span>
        </div>
      )}
    </div>
  );
}

function GameRow({ row }) {
  const title = { approved: "Score approved", added: "Added by the team", corrected: "Stats corrected" }[row.kind];
  const corrected = row.kind === "corrected";
  const parts = [];
  if (row.games !== undefined) parts.push(`${corrected ? formatNumber(row.games) : signed(row.games)} ${Math.abs(row.games) === 1 ? "game" : "games"}`);
  if (row.pins !== undefined) parts.push(`${corrected ? formatNumber(row.pins) : signed(row.pins)} pins`);
  const avg = !corrected && row.games > 0 && row.pins > 0 ? Math.round(row.pins / row.games) : null;
  return (
    <li>
      <div><b>{title}</b><small>{longDate(row.at)}{row.note ? ` · ${row.note}` : ""}</small></div>
      <span className="mono">{parts.join(" · ")}{avg ? <em> · {avg} avg</em> : null}</span>
    </li>
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
