// Site frame: smooth scrolling, floating nav, phone dock, footer.
import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import Lenis from "lenis";
import { SOCIALS } from "../lib/team.js";
import { PAGES } from "../data/routes.js";
import { Magnetic } from "./motion.jsx";

const NAV = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/team", label: "Team", icon: "team" },
  { to: "/rankings", label: "Rankings", icon: "trophy" },
  { to: "/learn", label: "Learn", icon: "ball" },
  { to: "/about", label: "About" },
];

const ICONS = {
  home: <><path d="M3 11.5 12 4l9 7.500" /><path d="M5.500 10v10h13V10" /></>,
  team: <><circle cx="9" cy="8" r="3.500" /><path d="M2.500 20c.6-3.600 3.200-5.600 6.500-5.600s5.900 2 6.500 5.600" /><path d="M15.500 4.800a3.500 3.500 0 0 1 0 6.400" /><path d="M18 14.800c2 .7 3.200 2.500 3.500 5.200" /></>,
  trophy: <><path d="M7 4h10v6a5 5 0 0 1-10 0z" /><path d="M7 6H3.500c0 3.500 1.200 5.500 3.900 6" /><path d="M17 6h3.500c0 3.500-1.200 5.500-3.900 6" /><path d="M12 15v4" /><path d="M8 20h8" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><circle cx="9.500" cy="8.500" r=".8" /><circle cx="13" cy="7.500" r=".8" /><circle cx="12" cy="11" r=".8" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.800-3.800" /></>,
  share: <><path d="M12 15V4" /><path d="m8 8 4-4 4 4" /><path d="M5 13v7h14v-7" /></>,
};

export function Icon({ name, size = 20 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function usePageMeta(meta) {
  useEffect(() => {
    if (!meta) return;
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
  }, [meta]);
}

function useSmoothScroll() {
  const reduced = useReducedMotion();
  const lenis = useRef(null);
  useEffect(() => {
    if (reduced) return undefined;
    const instance = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.current = instance;
    let frame = requestAnimationFrame(function raf(time) {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    });
    return () => { cancelAnimationFrame(frame); instance.destroy(); lenis.current = null; };
  }, [reduced]);
  return lenis;
}

function ScrollManager({ lenis }) {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) return;
    if (lenis.current) lenis.current.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
  }, [pathname, hash, lenis]);
  useEffect(() => {
    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;
    if (lenis.current) lenis.current.scrollTo(el, { offset: -100 });
    else el.scrollIntoView();
  }, [hash, lenis]);
  return null;
}

function Nav() {
  const { scrollY } = useScroll();
  const shadow = useTransform(scrollY, [0, 120], ["rgba(255,255,255,.05)", "rgba(255,255,255,.14)"]);
  return (
    <header className="nav-wrap">
      <motion.nav
        className="nav"
        aria-label="Main"
        style={{ borderColor: shadow }}
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <Link to="/" viewTransition className="nav-logo" aria-label="Team Classic Rollers home">
          <img src="/assets/opt/logo.webp" alt="" width="520" height="312" />
        </Link>
        <div className="nav-links">
          {NAV.map(({ to, label }) => (
            <NavLink key={to} to={to} end={to === "/"} viewTransition className="nav-link">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
        <Link to="/login" viewTransition className="nav-portal">Sign in</Link>
        <Magnetic>
          <Link to="/submit" viewTransition className="pill pill--sm nav-cta">Submit a score</Link>
        </Magnetic>
      </motion.nav>
    </header>
  );
}

function Dock() {
  const items = [...NAV.filter((item) => item.icon), { to: "/submit", label: "Submit", icon: "plus" }];
  return (
    <nav className="dock" aria-label="Quick navigation">
      {items.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} end={to === "/"} viewTransition className={`dock-item${to === "/submit" ? " dock-item--cta" : ""}`}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="dock-pill" className="dock-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Footer() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], ["40%", "0%"]), { stiffness: 90, damping: 24 });
  return (
    <footer className="footer" ref={ref}>
      <div className="wrap footer-top">
        <div>
          <p className="footer-lead">Three squads, one scoreboard, and a lot of Cambodian pride.</p>
        </div>
        <div className="footer-cols">
          <div>
            <p className="label">Explore</p>
            {NAV.slice(1).map(({ to, label }) => <Link key={to} to={to} viewTransition>{label}</Link>)}
          </div>
          <div>
            <p className="label">Members</p>
            <Link to="/submit" viewTransition>Submit a score</Link>
            <Link to="/login" viewTransition>Member sign in</Link>
          </div>
          <div>
            <p className="label">Follow</p>
            {SOCIALS.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
          </div>
        </div>
      </div>
      <div className="footer-mark" aria-hidden="true"><motion.span style={{ y }}>ROLLERS</motion.span></div>
      <p className="wrap footer-legal">© {new Date().getFullYear()} Team Classic Rollers</p>
    </footer>
  );
}

export default function Shell() {
  const lenis = useSmoothScroll();
  const { pathname } = useLocation();
  const meta = PAGES[pathname.replace(/\/$/, "") || "/"];
  usePageMeta(meta);
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <ScrollManager lenis={lenis} />
      <Nav />
      <main id="main"><Outlet /></main>
      <Footer />
      <Dock />
    </>
  );
}
