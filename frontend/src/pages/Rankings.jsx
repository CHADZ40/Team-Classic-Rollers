import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Counter, Lines, Reveal, Tile } from "../components/motion.jsx";
import { statusNote, useSiteData } from "../data/SiteData.jsx";
import {
  TEAMS, TEAM_COLOR, activeMembers, byAverage, formatNumber, memberPath, niceName, stats, teamSummary, thumbPhoto,
} from "../lib/team.js";
import { Segments } from "./Team.jsx";

const METRICS = {
  average: { label: "Average", sort: byAverage, value: (s) => s.avg, show: (s) => s.avg.toFixed(1), decimals: 1 },
  games: { label: "Games", sort: (a, b) => stats(b).games - stats(a).games || byAverage(a, b), value: (s) => s.games, show: (s) => formatNumber(s.games), decimals: 0 },
  pins: { label: "Pins", sort: (a, b) => stats(b).scores - stats(a).scores || byAverage(a, b), value: (s) => s.scores, show: (s) => formatNumber(s.scores), decimals: 0 },
};

function Podium({ list, metric }) {
  const order = [list[1], list[0], list[2]].filter(Boolean);
  return (
    <div className="podium">
      {order.map((member) => {
        const place = list.indexOf(member) + 1;
        const s = stats(member);
        return (
          <motion.div layout key={member.id} className="podium-cell" data-place={place} transition={{ type: "spring", stiffness: 220, damping: 28 }}>
            <Link to={memberPath(member)} viewTransition className="podium-card">
              <img src={thumbPhoto(member.photo)} alt={member.name} />
              <span className="podium-place">{place}</span>
              <span className="podium-info">
                <span className="podium-name">{niceName(member.name)}</span>
                <span className="podium-team">{member.team}</span>
                <span className="podium-value"><Counter key={metric} value={METRICS[metric].value(s)} decimals={METRICS[metric].decimals} /></span>
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Rankings() {
  const site = useSiteData();
  const { data, hasStats } = site;
  const [squad, setSquad] = useState("all");
  const [metric, setMetric] = useState("average");

  const { ranked, waiting } = useMemo(() => {
    const pool = activeMembers(data).filter((member) => squad === "all" || member.team === squad);
    return {
      ranked: pool.filter((member) => stats(member).games > 0).sort(METRICS[metric].sort),
      waiting: pool.filter((member) => stats(member).games === 0),
    };
  }, [data, squad, metric]);

  const top = ranked.length ? METRICS[metric].value(stats(ranked[0])) : 1;
  const standings = TEAMS.map((team) => teamSummary(data, team)).sort((a, b) => b.avg - a.avg);
  const bestSquad = Math.max(...standings.map((row) => row.avg), 1);

  return (
    <>
      <section className="page-head wrap">
        <p className="label label--accent">Rankings</p>
        <Lines as="h1" className="mega mega--page" lines={["The", "leaderboard"]} immediate />
        <Reveal><p className="lede">Every approved game counts. Switch squads, or rank by average, games bowled or total pins.</p></Reveal>
      </section>

      <div className="toolbar-wrap">
        <div className="toolbar wrap">
          <Segments id="rank-squad" label="Choose squad" value={squad} onChange={setSquad} options={[{ value: "all", label: "Everyone" }, ...TEAMS.map((team) => ({ value: team, label: team }))]} />
          <Segments id="rank-metric" label="Rank by" value={metric} onChange={setMetric} options={Object.entries(METRICS).map(([value, { label }]) => ({ value, label }))} />
        </div>
      </div>

      <section className="wrap section section--flush">
        {!hasStats ? (
          <p className="empty">{statusNote(site)}</p>
        ) : !ranked.length ? (
          <p className="empty">No games recorded for this squad yet. First score on the board takes the top spot.</p>
        ) : (
          <LayoutGroup>
            <Podium list={ranked.slice(0, 3)} metric={metric} />
            <ol className="ranks" data-testid="ranks">
              <AnimatePresence initial={false} mode="popLayout">
                {ranked.map((member, i) => {
                  const s = stats(member);
                  const value = METRICS[metric].value(s);
                  return (
                    <motion.li
                      layout
                      key={member.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 32 }}
                    >
                      <Link to={memberPath(member)} viewTransition className="rank" style={{ "--c": TEAM_COLOR[member.team] }}>
                        <span className="rank-pos">{String(i + 1).padStart(2, "0")}</span>
                        <img src={thumbPhoto(member.photo)} alt="" loading="lazy" />
                        <span className="rank-who"><b>{niceName(member.name)}</b><small>{member.team} · {s.games} {s.games === 1 ? "game" : "games"}</small></span>
                        <span className="rank-bar"><motion.i animate={{ scaleX: top ? value / top : 0 }} initial={false} transition={{ type: "spring", stiffness: 120, damping: 22 }} /></span>
                        <span className="rank-value">{METRICS[metric].show(s)}</span>
                      </Link>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          </LayoutGroup>
        )}

        {hasStats && waiting.length > 0 && (
          <Reveal className="waiting">
            <h2 className="tile-title">Yet to hit the board</h2>
            <p className="dim">One recorded game puts a bowler in the rankings.</p>
            <div className="chips">
              {waiting.map((member) => (
                <Link key={member.id} to={memberPath(member)} viewTransition className="chip">
                  <img src={thumbPhoto(member.photo)} alt="" loading="lazy" />{niceName(member.name)}
                </Link>
              ))}
            </div>
          </Reveal>
        )}

        <div className="grid-2 gap-top">
          {hasStats && (
            <Tile className="pad-lg">
              <p className="label">Squad standings</p>
              {standings.map((row) => (
                <div className="standing" key={row.team} style={{ "--c": TEAM_COLOR[row.team] }}>
                  <span>{row.team}</span>
                  <span className="track"><motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: row.avg / bestSquad }} viewport={{ once: true }} transition={{ duration: 1.2 }} /></span>
                  <b>{row.games ? row.avg.toFixed(1) : "—"}</b>
                </div>
              ))}
            </Tile>
          )}
          <Tile className="pad-lg">
            <p className="label">How the numbers work</p>
            <p className="dim gap-sm"><strong>Average</strong> is total pins divided by games. Every bowler has a personal average goal, and it moves up 25 each time they reach it. A small number of games can swing an average a long way, so the more you bowl, the truer it gets.</p>
            <Link to="/submit" viewTransition className="pill pill--sm gap-sm">Submit a score</Link>
          </Tile>
        </div>
      </section>
    </>
  );
}
