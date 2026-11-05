import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Lines, Reveal } from "../components/motion.jsx";
import { Icon } from "../components/Shell.jsx";
import { useSiteData } from "../data/SiteData.jsx";
import {
  TEAMS, TEAM_COLOR, activeMembers, byAverage, bySortOrder, memberPath, niceName, stats, thumbPhoto,
} from "../lib/team.js";

const SPRING = { type: "spring", stiffness: 260, damping: 30 };

export function Segments({ id, options, value, onChange, label }) {
  return (
    <div className="segments" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="segment" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {value === option.value && <motion.span layoutId={`seg-${id}`} className="segment-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function PlayerCard({ member, showStats }) {
  const s = stats(member);
  return (
    <motion.div
      layout
      className="player-cell"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={SPRING}
    >
      <Link to={memberPath(member)} viewTransition className="player" style={{ "--c": TEAM_COLOR[member.team] }}>
        <img
          src={thumbPhoto(member.photo)}
          alt={member.name}
          loading="lazy"
          decoding="async"
          style={{ viewTransitionName: `photo-${member.id}` }}
        />
        <span className="player-squad">{member.team.slice(-1)}</span>
        <span className="player-info">
          <span className="player-name">{niceName(member.name)}</span>
          {showStats && (
            <span className="player-stat">
              {s.games ? <><span>{s.games} {s.games === 1 ? "game" : "games"}</span><b>{s.avg.toFixed(1)}</b></> : <span>No games yet</span>}
            </span>
          )}
        </span>
      </Link>
    </motion.div>
  );
}

export default function Team() {
  const { data, hasStats } = useSiteData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("roster");
  const fromUrl = params.get("squad");
  const squad = ["A", "B", "C"].includes(fromUrl) ? `Team ${fromUrl}` : "all";

  // Old links used #team-a style anchors.
  useEffect(() => {
    const match = window.location.hash.match(/^#team-([abc])$/i);
    if (match) setParams({ squad: match[1].toUpperCase() }, { replace: true });
  }, [setParams]);

  const setSquad = (value) => setParams(value === "all" ? {} : { squad: value.slice(-1) }, { replace: true, preventScrollReset: true });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = activeMembers(data)
      .filter((member) => squad === "all" || member.team === squad)
      .filter((member) => member.name.toLowerCase().includes(needle));
    if (sort === "average") return list.sort(byAverage);
    if (sort === "games") return list.sort((a, b) => stats(b).games - stats(a).games);
    return list.sort((a, b) => TEAMS.indexOf(a.team) - TEAMS.indexOf(b.team) || bySortOrder(a, b));
  }, [data, squad, query, sort]);

  return (
    <>
      <section className="page-head wrap">
        <p className="label label--accent">The roster</p>
        <Lines as="h1" className="mega mega--page" lines={["Meet the", "Rollers"]} immediate />
        <Reveal><p className="lede">Every bowler, every squad, all in one place. Find someone by name or open a card for their live stats.</p></Reveal>
      </section>

      <div className="toolbar-wrap">
        <div className="toolbar wrap">
          <label className="search">
            <span className="sr-only">Search bowlers by name</span>
            <Icon name="search" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" autoComplete="off" />
          </label>
          <Segments
            id="squad"
            label="Filter by squad"
            value={squad}
            onChange={setSquad}
            options={[{ value: "all", label: "All" }, ...TEAMS.map((team) => ({ value: team, label: team }))]}
          />
          <label className="select">
            <span className="sr-only">Sort bowlers</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="roster">Roster order</option>
              <option value="average">Highest average</option>
              <option value="games">Most games</option>
            </select>
          </label>
        </div>
      </div>

      <section className="wrap section section--flush">
        <LayoutGroup>
          <div className="roster" data-testid="roster">
            <AnimatePresence mode="popLayout">
              {shown.map((member) => <PlayerCard key={member.id} member={member} showStats={hasStats} />)}
            </AnimatePresence>
          </div>
        </LayoutGroup>
        {!shown.length && <p className="empty">No bowler matches that search. Check the spelling or clear the filter.</p>}
      </section>
    </>
  );
}
