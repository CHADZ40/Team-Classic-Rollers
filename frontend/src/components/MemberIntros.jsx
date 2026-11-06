// The leaders section on the home page. One person at a time on a big stage, with
// everyone listed below. Names, roles, pictures and captions come from the admin's Leaders page.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { EASE, Lines } from "./motion.jsx";
import { Icon } from "./Shell.jsx";
import { useSiteData } from "../data/SiteData.jsx";
import { leaderList, leaderPicture, leaderThumb, memberPath, stats } from "../lib/team.js";

const SWIPE_DISTANCE = 60;

// Longer captions stay up longer, so there's time to read them.
const dwellMs = (leader) => Math.min(14000, 6000 + leader.caption.length * 35);
const initials = (name) => name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

function Stage({ leader, direction, onSwipe }) {
  const picture = leaderPicture(leader);
  return (
    <motion.div
      className="intro-photo"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.12}
      onDragEnd={(_event, info) => { if (Math.abs(info.offset.x) > SWIPE_DISTANCE) onSwipe(info.offset.x < 0 ? 1 : -1); }}
    >
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={leader.id}
          className="intro-slide"
          custom={direction}
          variants={{
            enter: (d) => ({ clipPath: d > 0 ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)", scale: 1.08 }),
            shown: { clipPath: "inset(0 0 0 0%)", scale: 1 },
            leave: { opacity: 0.35, scale: 1.02 },
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={{ duration: 0.8, ease: EASE }}
        >
          {leader.photo && <img className="intro-backdrop" src={picture} alt="" />}
          {picture
            ? <img className="intro-picture" src={picture} alt={`${leader.name}, ${leader.role}`} draggable={false} decoding="async" />
            : <div className="intro-initials" aria-hidden="true"><b>{initials(leader.name)}</b></div>}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function Details({ leader, position, total, live }) {
  const s = leader.member ? stats(leader.member) : null;
  const caption = leader.caption || leader.member?.bio;
  return (
    <div className="intro-details">
      <p className="intro-count"><b>{String(position).padStart(2, "0")}</b> / {String(total).padStart(2, "0")}</p>
      <p className="intro-role">{leader.role}</p>
      <Lines as="h3" className={`intro-name${leader.name.length > 14 ? " intro-name--long" : ""}`} lines={[leader.name]} immediate />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.14, ease: EASE }}>
        {caption && <p className="intro-caption">{caption}</p>}
        {live && s?.games > 0 && (
          <dl className="intro-stats">
            <div><dt>Average</dt><dd>{s.avg.toFixed(1)}</dd></div>
            <div><dt>Games</dt><dd>{s.games}</dd></div>
            <div><dt>Goal</dt><dd>{s.goal}</dd></div>
          </dl>
        )}
        {leader.member && <Link to={memberPath(leader.member)} viewTransition className="text-link intro-link">See full profile <Icon name="arrow" size={18} /></Link>}
      </motion.div>
    </div>
  );
}

function Strip({ list, active, running, showTimer, onPick, onTimerEnd }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  // Scrolls the strip only. scrollIntoView would drag the whole page along with it.
  useEffect(() => {
    const strip = ref.current;
    const tile = strip?.querySelector('[aria-current="true"]');
    if (!tile) return;
    strip.scrollTo({ left: tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active.id, list, reduced]);
  return (
    <div className="intro-strip" ref={ref} role="group" aria-label="Choose a person">
      {list.map((leader) => {
        const current = leader.id === active.id;
        const thumb = leaderThumb(leader);
        return (
          <button key={leader.id} type="button" className="intro-tile" aria-current={current} onClick={() => onPick(leader)}>
            <span className="intro-face">
              {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} /> : <span aria-hidden="true">{initials(leader.name)}</span>}
            </span>
            <span className="intro-who"><b>{leader.name}</b><small>{leader.role}</small></span>
            {current && showTimer && (
              <i
                className="intro-timer"
                style={{ animationDuration: `${dwellMs(leader)}ms`, animationPlayState: running ? "running" : "paused" }}
                onAnimationEnd={onTimerEnd}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function MemberIntros() {
  const { data, hasStats } = useSiteData();
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [activeId, setActiveId] = useState(null);
  const [direction, setDirection] = useState(1);
  const [playing, setPlaying] = useState(!reduced);
  const [hovering, setHovering] = useState(false);

  const list = useMemo(() => leaderList(data), [data]);
  // Tracked by id, so the person on stage stays put when fresh data arrives.
  const index = Math.max(0, list.findIndex((leader) => leader.id === activeId));
  const active = list[index];
  const next = list.length ? list[(index + 1) % list.length] : null;

  useEffect(() => {
    const picture = next && leaderPicture(next);
    if (inView && picture) new Image().src = picture;
  }, [inView, next]);

  // Leaders arrive with the live data, after the site's own #link handling has run.
  // Waits a frame for the hero to reach its full height.
  const hasLeaders = Boolean(active);
  useEffect(() => {
    if (!hasLeaders || window.location.hash !== "#meet") return undefined;
    const frame = requestAnimationFrame(() => ref.current?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hasLeaders]);

  if (!active) return null;

  const step = (by) => {
    setDirection(by);
    setActiveId(list[(index + by + list.length) % list.length].id);
  };
  // Choosing someone means they're being read, so stop moving on by itself.
  const browse = (by) => { setPlaying(false); step(by); };
  const pick = (leader) => {
    setPlaying(false);
    setDirection(list.indexOf(leader) >= index ? 1 : -1);
    setActiveId(leader.id);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") browse(1);
    if (event.key === "ArrowLeft") browse(-1);
  };
  const several = list.length > 1;

  return (
    <section className="section" id="meet" ref={ref} aria-label="Meet the leaders">
      <div className="wrap">
        <div className="head">
          <div>
            <p className="label label--accent">Leadership and coaches</p>
            <Lines lines={["Meet the", "leaders"]} className="display" />
          </div>
        </div>
        <div
          onKeyDown={onKeyDown}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovering(true); }}
          onPointerLeave={() => setHovering(false)}
        >
          <div className="intro">
            <Stage leader={active} direction={direction} onSwipe={several ? browse : () => {}} />
            <div className="intro-copy" aria-live={playing ? "off" : "polite"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={active.id} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                  <Details leader={active} position={index + 1} total={list.length} live={hasStats} />
                </motion.div>
              </AnimatePresence>
            </div>
            {several && (
              <div className="intro-controls">
                <button type="button" className="intro-button" aria-label="Previous person" onClick={() => browse(-1)}><span className="flip"><Icon name="arrow" /></span></button>
                <button type="button" className="intro-button" aria-label="Next person" onClick={() => browse(1)}><Icon name="arrow" /></button>
                <button type="button" className="intro-button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((value) => !value)}><Icon name={playing ? "pause" : "play"} /></button>
              </div>
            )}
          </div>
          {several && (
            <Strip
              list={list}
              active={active}
              running={playing && inView && !hovering}
              showTimer={playing}
              onPick={pick}
              onTimerEnd={() => step(1)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
