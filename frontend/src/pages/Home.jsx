import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Counter, Lines, Magnetic, Marquee, Reveal, Tile } from "../components/motion.jsx";
import { Icon } from "../components/Shell.jsx";
import { statusNote, useContent, useSiteData } from "../data/SiteData.jsx";
import {
  TEAMS, TEAM_COLOR, formatNumber, memberPath, niceName, rankedMembers, stats, teamSummary, teamTotals, thumbPhoto,
} from "../lib/team.js";

const HeroScene = lazy(() => import("../three/HeroScene.jsx"));

const TAGLINE = "Three squads, one scoreboard, and a lot of pride. Team Classic Rollers is where Cambodian bowlers train hard, compete together and get better every frame.";

function canRender3D() {
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

function useHeadline() {
  const title = useContent("homeTitle", "ROLL TOGETHER. PLAY TO WIN.");
  return useMemo(() => title.split(/(?<=[.!?])\s*(?=\S)/), [title]);
}

function Hero() {
  const reduced = useReducedMotion();
  const [threeD, setThreeD] = useState(null);
  useEffect(() => { setThreeD(!reduced && canRender3D()); }, [reduced]);
  const lines = useHeadline();
  const tagline = useContent("homeDescription", TAGLINE);
  if (threeD === null) return <section className="hero-static" />;
  if (threeD) return <Hero3D lines={lines} tagline={tagline} />;
  return (
    <section className="hero-static">
      <img className="hero-static-art" src="/assets/opt/banner.webp" alt="" />
      <div className="wrap hero-copy">
        <p className="label label--accent">Bowling team · Cambodia</p>
        <Lines as="h1" className="mega" lines={lines} immediate />
        <p className="lede">{tagline}</p>
        <HeroActions />
      </div>
    </section>
  );
}

function Hero3D({ lines, tagline }) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "20% 0px 20% 0px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const copyOpacity = useTransform(scrollYProgress, [0, 0.14], [1, 0]);
  const copyY = useTransform(scrollYProgress, [0, 0.14], [0, -70]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);
  const flash = useTransform(scrollYProgress, [0.6, 0.615, 0.67], [0, 0.34, 0]);
  const strikeOpacity = useTransform(scrollYProgress, [0.625, 0.645, 0.8, 0.86], [0, 1, 1, 0]);
  const strikeScale = useTransform(scrollYProgress, [0.625, 0.665, 0.86], [2.2, 1, 0.92]);
  const outroOpacity = useTransform(scrollYProgress, [0.86, 0.93], [0, 1]);
  const outroY = useTransform(scrollYProgress, [0.86, 0.93], [40, 0]);

  const [pastCopy, setPastCopy] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setPastCopy(v > 0.14));

  return (
    <section className="hero" ref={ref} aria-label="Team Classic Rollers">
      <div className="hero-stage">
        <Suspense fallback={null}>
          <HeroScene progress={scrollYProgress} active={inView} />
        </Suspense>
        <div className="hero-scrim" />
        <motion.div className="hero-flash" style={{ opacity: flash }} />

        <motion.div className="wrap hero-copy" style={{ opacity: copyOpacity, y: copyY, pointerEvents: pastCopy ? "none" : "auto" }}>
          <motion.p className="label label--accent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}>
            Bowling team · Cambodia
          </motion.p>
          <Lines as="h1" className="mega" lines={lines} immediate delay={0.25} />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.9 }}>
            <p className="lede">{tagline}</p>
            <HeroActions />
          </motion.div>
        </motion.div>

        <motion.div className="hero-strike" style={{ opacity: strikeOpacity, scale: strikeScale }} aria-hidden="true">Strike!</motion.div>

        <motion.div className="hero-outro" style={{ opacity: outroOpacity, y: outroY }} aria-hidden="true">
          <p className="label label--accent">Every frame counts</p>
          <p className="display-md">Here's how the team is rolling.</p>
        </motion.div>

        <motion.div className="hero-hint" style={{ opacity: hintOpacity }} aria-hidden="true">
          <span>Scroll to roll</span>
          <motion.i animate={{ y: [0, 10, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      </div>
    </section>
  );
}

function HeroActions() {
  return (
    <div className="actions">
      <Magnetic><Link to="/team" viewTransition className="pill">Meet the team <Icon name="arrow" /></Link></Magnetic>
      <Magnetic><Link to="/rankings" viewTransition className="pill pill--ghost">See the rankings</Link></Magnetic>
    </div>
  );
}

function Scoreboard() {
  const site = useSiteData();
  const totals = teamTotals(site.data);
  const top = rankedMembers(site.data)[0];
  const standings = TEAMS.map((team) => teamSummary(site.data, team)).sort((a, b) => b.avg - a.avg);
  const best = Math.max(...standings.map((row) => row.avg), 1);
  const live = site.hasStats;
  return (
    <section className="section">
      <div className="wrap">
        <div className="head">
          <div>
            <p className="label label--accent">Live scoreboard</p>
            <Lines lines={["The numbers", "don't lie"]} className="display" />
          </div>
          <p className="status" data-state={site.status}>{statusNote(site)}</p>
        </div>
        <div className="bento">
          {live && top && (
            <Reveal className="bento-leader">
              <Link to={memberPath(top)} viewTransition className="leader">
                <img src={thumbPhoto(top.photo)} alt={top.name} loading="lazy" />
                <div className="leader-copy">
                  <p className="label">Top of the lane</p>
                  <p className="leader-name">{niceName(top.name)}</p>
                  <p className="leader-meta">{top.team} · {stats(top).games} games</p>
                  <p className="leader-avg"><Counter value={stats(top).avg} decimals={1} /></p>
                </div>
              </Link>
            </Reveal>
          )}
          <Tile className="bento-stat">
            <p className="label">Bowlers</p>
            <p className="stat"><Counter value={totals.bowlers} /></p>
          </Tile>
          <Tile className="bento-stat">
            <p className="label">Games bowled</p>
            <p className="stat">{live ? <Counter value={totals.games} /> : "—"}</p>
          </Tile>
          <Tile className="bento-stat">
            <p className="label">Pins down</p>
            <p className="stat">{live ? <Counter value={totals.pins} /> : "—"}</p>
          </Tile>
          <Tile className="bento-stat bento-stat--accent">
            <p className="label">Team average</p>
            <p className="stat">{live && totals.games ? <Counter value={totals.average} decimals={1} /> : "—"}</p>
          </Tile>
          {live && (
            <Tile className="bento-squads">
              <p className="label">Squad standings</p>
              {standings.map((row) => (
                <div className="standing" key={row.team} style={{ "--c": TEAM_COLOR[row.team] }}>
                  <span>{row.team}</span>
                  <span className="track">
                    <motion.i
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: row.avg / best }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.3, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </span>
                  <b>{row.games ? row.avg.toFixed(1) : "—"}</b>
                </div>
              ))}
            </Tile>
          )}
        </div>
      </div>
    </section>
  );
}

const SQUAD_COPY = {
  "Team A": "The experienced core. Team A sets the standard in practice and carries it into competition.",
  "Team B": "Focused and climbing. Team B is all about growth, sharper spare shooting and tougher competition.",
  "Team C": "The next generation. Team C is building the habits and the confidence that win games later.",
};

function Squads() {
  const { data } = useSiteData();
  const [open, setOpen] = useState("Team A");
  return (
    <section className="section">
      <div className="wrap">
        <div className="head">
          <div>
            <p className="label label--accent">Three squads</p>
            <Lines lines={["One team,", "three ways to play"]} className="display" />
          </div>
        </div>
        <div className="squads">
          {TEAMS.map((team) => {
            const summary = teamSummary(data, team);
            const isOpen = open === team;
            return (
              <motion.div
                key={team}
                layout
                className="squad"
                data-open={isOpen}
                style={{ "--c": TEAM_COLOR[team] }}
                onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(team); }}
                onClick={() => setOpen(team)}
                transition={{ type: "spring", stiffness: 170, damping: 26 }}
              >
                <motion.span layout="position" className="squad-letter" aria-hidden="true">{team.slice(-1)}</motion.span>
                <div className="squad-body">
                  <h3>{team}</h3>
                  <p>{SQUAD_COPY[team]}</p>
                  <div className="squad-foot">
                    <span className="faces">
                      {summary.list.slice(0, 5).map((member) => <img key={member.id} src={thumbPhoto(member.photo)} alt="" loading="lazy" />)}
                    </span>
                    <Link to={`/team?squad=${team.slice(-1)}`} viewTransition className="text-link">
                      {summary.list.length} bowlers <Icon name="arrow" size={18} />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function News() {
  const { data } = useSiteData();
  const items = (data.news || []).filter((item) => item.published !== false).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="wrap">
        <div className="head"><div><p className="label label--accent">Latest from TCR</p><Lines lines={["News and updates"]} className="display" /></div></div>
        <div className="grid-3">
          {items.map((item, i) => (
            <Reveal key={item.id || item.title} delay={i * 0.06}>
              <Tile className="pad-lg full">
                <p className="label label--accent">{item.type || "Announcement"}{item.date ? ` · ${item.date}` : ""}</p>
                <h3 className="tile-title">{item.title}</h3>
                <p className="dim pre">{item.body}</p>
              </Tile>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Basics() {
  return (
    <section className="section">
      <div className="wrap split">
        <div>
          <p className="label label--accent">New to bowling?</p>
          <Lines lines={["Ten frames.", "Ten pins.", "Easy to start."]} className="display" />
          <Reveal><p className="lede">Bowling takes a minute to learn and years to master, and that's the fun of it. Our guide covers how scoring really works, what to do in your first game, and the words you'll hear at the lanes.</p></Reveal>
          <Reveal className="actions">
            <Magnetic><Link to="/learn" viewTransition className="pill">Learn the basics <Icon name="arrow" /></Link></Magnetic>
            <Link to="/learn#calculator" viewTransition className="pill pill--ghost">Score calculator</Link>
          </Reveal>
        </div>
        <div className="marks">
          <Reveal><Tile className="pad-lg mark-tile"><span className="mark">X</span><h3 className="tile-title">Strike</h3><p className="dim">All ten down on the first ball. Scores 10 plus your next two rolls.</p></Tile></Reveal>
          <Reveal delay={0.1}><Tile className="pad-lg mark-tile"><span className="mark">/</span><h3 className="tile-title">Spare</h3><p className="dim">All ten down with two balls. Scores 10 plus your next roll.</p></Tile></Reveal>
        </div>
      </div>
    </section>
  );
}

function SubmitBand() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const radius = useTransform(scrollYProgress, [0, 1], [72, 28]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  return (
    <section className="band-wrap" ref={ref}>
      <motion.div className="band" style={{ borderRadius: radius, scale }}>
        <div>
          <p className="label">Team members</p>
          <Lines lines={["Bowled a game?", "Get it on the board."]} className="display" />
          <p className="band-copy">Your average only moves when your scores are in. It takes about a minute from your phone, right there at the lanes.</p>
          <Magnetic><Link to="/submit" viewTransition className="pill pill--dark">Submit a score <Icon name="arrow" /></Link></Magnetic>
        </div>
        <ol className="steps">
          <li><b>Finish your games</b><span>Note how many you bowled and your total pins.</span></li>
          <li><b>Snap the lane screen</b><span>A photo is your proof. It's optional, but it helps.</span></li>
          <li><b>Send it in</b><span>An admin reviews it, then your stats update.</span></li>
        </ol>
      </motion.div>
    </section>
  );
}

function Ticker() {
  const { data, hasStats } = useSiteData();
  const leaders = hasStats ? rankedMembers(data).slice(0, 5) : [];
  return (
    <Marquee>
      <b>Roll together</b><em>✦</em><b>Play to win</b><em>✦</em>
      {leaders.map((member) => (
        <span key={member.id}>{niceName(member.name)} <i>{formatNumber(stats(member).avg.toFixed(1))}</i><em>✦</em></span>
      ))}
    </Marquee>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Ticker />
      <Scoreboard />
      <Squads />
      <News />
      <Basics />
      <SubmitBand />
    </>
  );
}
