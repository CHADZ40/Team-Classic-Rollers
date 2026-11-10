// A bowler's performance, squad progress and training attendance. Shown on their public
// profile and in the member portal.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Tile } from "./motion.jsx";
import { formatNumber, stats } from "../lib/team.js";

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const STATUS = { present: "Present", absent: "Absent", missed: "Missed", open: "Open", pending: "Waiting", approved: "Approved", rejected: "Not approved" };

const toDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value));
export const shortDate = (value) => toDate(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const longDate = (value) => toDate(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const signed = (value) => `${Number(value) > 0 ? "+" : ""}${formatNumber(value)}`;
export const listOf = (words) => (words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words.join(""));

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

export function Promotion({ member, promotion }) {
  const s = stats(member);
  if (!promotion) {
    return (
      <Tile className="pad-lg promo full">
        <p className="label label--accent">Squad</p>
        <h2 className="tile-title">In Team A</h2>
        <p className="dim">The top squad. The goal now is keeping the average strong.</p>
      </Tile>
    );
  }
  const reached = s.games > 0 && s.avg >= promotion.average;
  const percent = s.games ? Math.min(100, (s.avg / promotion.average) * 100) : 0;
  return (
    <Tile className={`pad-lg promo full${reached ? " is-reached" : ""}`}>
      <p className="label label--accent">Road to {promotion.next}</p>
      <h2 className="tile-title">
        {!s.games ? `Average ${promotion.average} to move up` : reached ? `Reached ${promotion.average}!` : `${(promotion.average - s.avg).toFixed(1)} pins per game to go`}
      </h2>
      <div className="promo-bar" role="progressbar" aria-label={`Average towards ${promotion.average}`} aria-valuemin={0} aria-valuemax={promotion.average} aria-valuenow={Math.round(s.avg)}>
        <motion.i initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} />
      </div>
      <p className="promo-scale mono"><span>{s.games ? s.avg.toFixed(1) : "—"} now</span><span>{promotion.average} for {promotion.next}</span></p>
      <p className="dim">
        {!s.games ? `The road to ${promotion.next} starts with the first games.`
          : reached ? `Ready to talk to the coach about moving up to ${promotion.next}.`
            : `Average ${promotion.average} or more to move up from ${member.team} to ${promotion.next}.`}
      </p>
    </Tile>
  );
}

export function Training({ schedule, attendance }) {
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
      <p className="dim">{rate === null ? "Attendance shows here after the first session." : `Came to ${attendance.present} of ${attendance.total} ${attendance.total === 1 ? "session" : "sessions"} since the first one.`}</p>
      {recent.length > 0 && (
        <div className="dots" aria-hidden="true">{recent.map((s) => <span key={s.id} className={`dot is-${s.status}`} title={`${longDate(s.date)}: ${STATUS[s.status]}`} />)}</div>
      )}
    </Tile>
  );
}

// Average for each set of games, oldest first, against the average needed to move up.
export function AverageChart({ games, target }) {
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
  if (points.length < 2) return <p className="dim" ref={wrap}>The chart appears after two sets of games.</p>;

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

export function GameRow({ row }) {
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
