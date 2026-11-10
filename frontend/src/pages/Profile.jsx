import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { motion, useScroll, useTransform } from "motion/react";
import { Counter, Lines, Reveal, Tile } from "../components/motion.jsx";
import { Icon, usePageMeta } from "../components/Shell.jsx";
import { AverageChart, GameRow, Promotion, STATUS, Training, longDate } from "../components/MemberStats.jsx";
import { useSiteData } from "../data/SiteData.jsx";
import { memberMeta } from "../data/routes.js";
import {
  API_BASE, STATIC_SITE, TEAM_COLOR, activeMembers, bySortOrder, formatNumber, fullPhoto, memberPath, niceName, posterPhoto, rankedMembers, stats,
} from "../lib/team.js";

function GoalRing({ percent, goal, avg, games }) {
  const radius = 88;
  return (
    <div className="ring">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r={radius} className="ring-track" />
        <motion.circle
          cx="100" cy="100" r={radius} className="ring-fill"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: percent / 100 }}
          transition={{ duration: 1.6, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="ring-copy">
        <span className="ring-value">{games ? <Counter value={avg} decimals={1} /> : "—"}</span>
        <span className="label">of {goal} goal</span>
      </div>
    </div>
  );
}

function History({ id }) {
  const { data } = useSiteData();
  const [state, setState] = useState({ status: "loading", rows: [] });
  useEffect(() => {
    // The published data already holds each bowler's history.
    if (STATIC_SITE) { setState({ status: "done", rows: data.history?.[id] || [] }); return undefined; }
    let cancelled = false;
    setState({ status: "loading", rows: [] });
    fetch(`${API_BASE}/api/public/member-history/${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((json) => { if (!cancelled) setState({ status: "done", rows: json.history || [] }); })
      .catch(() => { if (!cancelled) setState({ status: "error", rows: [] }); });
    return () => { cancelled = true; };
  }, [id, data]);
  if (state.status === "loading") return <p className="dim">Loading score history…</p>;
  if (state.status === "error") return <p className="dim">Score history is unavailable right now.</p>;
  if (!state.rows.length) return <p className="dim">No score changes recorded yet.</p>;
  return (
    <ul className="history">
      {state.rows.map((row, i) => (
        <motion.li key={`${row.timestamp}${i}`} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.05 }}>
          <span>{row.reason || String(row.action || "").replaceAll("_", " ")}</span>
          <b>{row.newScores !== undefined ? formatNumber(row.newScores) : "—"}</b>
          <small>{new Date(row.timestamp).toLocaleDateString()}</small>
        </motion.li>
      ))}
    </ul>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: document.title, url: location.href }); return; }
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* share sheet dismissed */ }
  };
  return <button type="button" className="pill pill--ghost pill--sm" onClick={share}><Icon name="share" size={18} />{copied ? "Link copied" : "Share profile"}</button>;
}

export default function Profile() {
  const { id } = useParams();
  const { data, hasStats, status } = useSiteData();
  const member = data.members.find((item) => item.id === id || item.slug === id);
  const meta = useMemo(() => (member ? memberMeta(member.name, member.team) : null), [member]);
  usePageMeta(meta);

  const photoRef = useRef(null);
  const { scrollY } = useScroll();
  const photoY = useTransform(scrollY, [0, 700], [0, 60]);

  if (!member) {
    if (status === "loading") return <div className="page-loading" />;
    return (
      <section className="page-head wrap">
        <p className="label label--accent">Off the lane</p>
        <h1 className="mega mega--page">Bowler not found</h1>
        <Link to="/team" viewTransition className="pill gap-sm">Back to the team</Link>
      </section>
    );
  }

  const s = stats(member);
  const ranked = rankedMembers(data);
  const place = ranked.findIndex((item) => item.id === member.id);
  const squad = activeMembers(data).filter((item) => item.team === member.team).sort(bySortOrder);
  const index = squad.findIndex((item) => item.id === member.id);
  const prev = squad.length > 1 ? squad[(index - 1 + squad.length) % squad.length] : null;
  const next = squad.length > 1 ? squad[(index + 1) % squad.length] : null;
  const achievements = Array.isArray(member.achievements) ? member.achievements : [];
  const words = niceName(member.name).split(" ");
  const gap = s.goal - s.avg;
  // Published with the website: this bowler's games and training attendance.
  const portal = data.portal?.[member.id];
  const promotion = data.promotion?.[member.team] || null;

  return (
    <div className="wrap profile" key={member.id} style={{ "--c": TEAM_COLOR[member.team] }}>
      <motion.div className="profile-photo" ref={photoRef} style={{ y: photoY }}>
        <img
          src={posterPhoto(member.photo)}
          alt={`${member.name}, ${member.team}`}
          onError={(event) => { const full = fullPhoto(member.photo); if (event.currentTarget.src !== new URL(full, location.href).href) event.currentTarget.src = full; }}
          style={{ viewTransitionName: `photo-${member.id}` }}
        />
      </motion.div>

      <div className="profile-main">
        <Link to="/team" viewTransition className="back"><span className="flip"><Icon name="arrow" size={18} /></span> The team</Link>
        <p className="profile-team">{member.team}</p>
        <Lines as="h1" className="mega mega--profile" lines={words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : words} immediate />
        <p className="lede">
          {!hasStats ? "Official stats, straight from team records."
            : place >= 0 ? `Ranked #${place + 1} of ${ranked.length} on the team.`
              : "Not ranked yet. One game gets you on the board."}
        </p>
        <div className="actions">
          <Link to="/submit" viewTransition className="pill pill--sm">Submit a score</Link>
          <ShareButton />
        </div>

        <div className="profile-stats">
          <Tile className="pad-lg goal-tile">
            <GoalRing percent={hasStats ? s.percent : 0} goal={s.goal} avg={s.avg} games={hasStats ? s.games : 0} />
            <p className="dim">
              {hasStats && s.games
                ? `${gap.toFixed(1)} pins per game to go. Reach ${s.goal} and the target moves up 25.`
                : `First target is a ${s.goal} average. It moves up 25 each time it's reached.`}
            </p>
          </Tile>
          <div className="profile-nums">
            <Tile className="pad-lg"><p className="label">Games</p><p className="stat">{hasStats ? <Counter value={s.games} /> : "—"}</p></Tile>
            <Tile className="pad-lg"><p className="label">Total pins</p><p className="stat">{hasStats ? <Counter value={s.scores} /> : "—"}</p></Tile>
          </div>
        </div>

        {portal && (
          <>
            <div className="portal-grid profile-cards">
              <Promotion member={member} promotion={promotion} />
              <Training schedule={data.schedule || { days: [] }} attendance={portal.attendance} />
            </div>
            <Reveal className="portal-block">
              <h2 className="tile-title">Performance</h2>
              <p className="dim portal-sub">Average for each set of games.</p>
              <AverageChart games={portal.games} target={promotion?.average} />
            </Reveal>
            {portal.attendance.sessions.length > 0 && (
              <Reveal className="portal-block">
                <h2 className="tile-title">Training attendance</h2>
                <ul className="portal-list">
                  {portal.attendance.sessions.slice(0, 12).map((session) => (
                    <li key={session.id}>
                      <div><b>{session.title}</b><small>{longDate(session.date)}{session.location ? ` · ${session.location}` : ""}</small></div>
                      <span className={`state is-${session.status}`}>{STATUS[session.status]}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </>
        )}
        {member.bio && <Reveal className="profile-block"><h2 className="tile-title">About {words[0]}</h2><p className="dim pre">{member.bio}</p></Reveal>}
        {achievements.length > 0 && (
          <Reveal className="profile-block">
            <h2 className="tile-title">Achievements</h2>
            <ul className="achievements">{achievements.map((item) => <li key={item}>{item}</li>)}</ul>
          </Reveal>
        )}
        <Reveal className="profile-block">
          <h2 className="tile-title">Score history</h2>
          {portal ? (portal.games.length ? <ul className="portal-list">{portal.games.slice(0, 12).map((row, i) => <GameRow key={`${row.at}${i}`} row={row} />)}</ul> : <p className="dim">No games recorded yet.</p>)
            : <History id={member.id} />}
        </Reveal>

        {prev && next && (
          <nav className="neighbours" aria-label="Other bowlers in this squad">
            <Link to={memberPath(prev)} viewTransition className="text-link"><span className="flip"><Icon name="arrow" size={18} /></span>{niceName(prev.name)}</Link>
            <Link to={memberPath(next)} viewTransition className="text-link">{niceName(next.name)}<Icon name="arrow" size={18} /></Link>
          </nav>
        )}
      </div>
    </div>
  );
}
