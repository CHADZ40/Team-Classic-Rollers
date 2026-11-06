// Admin frame: sidebar on wide screens, dock on phones, smooth scrolling.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Lenis from "lenis";
import { api, clearToken } from "../lib/api.js";
import { useAdmin } from "../data/store.jsx";
import { Modal } from "./ui.jsx";

const WEBSITE = "https://teamclassicrollers.club";
const NAV = [
  { to: "/dashboard", label: "Home", path: "M3 11.5 12 4l9 7.5M5.5 10v10h13V10" },
  { to: "/request", label: "Score requests", short: "Requests", path: "M4 5h16v14H4zM8 12l3 3 5-6" },
  { to: "/players", label: "Players", path: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.6 6.5-5.6s5.9 2 6.5 5.6M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2" },
  { to: "/news", label: "News", path: "M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7" },
  { to: "/introductions", label: "Leaders", more: true, path: "M4 5h16v14H4zM8.500 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4 17l5-4 3 2.500 3.500-3.500 4.500 4" },
  { to: "/content", label: "Website text", more: true, path: "M4 6h16M4 12h16M4 18h10" },
  { to: "/member-accounts", label: "Member accounts", more: true, path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 4-6 8-6s7.2 2 8 6" },
  { to: "/logs", label: "Activity", more: true, path: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
];

function Icon({ path }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

function useSignOut() {
  return async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* signing out anyway */ }
    clearToken();
    window.location.replace("/login");
  };
}

function PendingCount({ count }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span key="count" className="count" data-pending initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
          {count > 99 ? "99+" : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function Sidebar({ pending }) {
  const signOut = useSignOut();
  return (
    <aside className="side">
      <Link to="/dashboard" viewTransition className="side-brand"><img src="/assets/opt/logo.webp" alt="Team Classic Rollers" /><span>Admin</span></Link>
      <nav aria-label="Admin">
        {NAV.map(({ to, label, path }) => (
          <NavLink key={to} to={to} viewTransition className="side-link">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="side-pill" className="side-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <Icon path={path} /><span>{label}</span>
                {to === "/request" && <PendingCount count={pending} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="side-foot">
        <a className="side-link" href={WEBSITE} target="_blank" rel="noopener noreferrer"><Icon path="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /><span>View website</span></a>
        <button type="button" className="side-link" onClick={signOut}><Icon path="M9 4H4v16h5M15 8l4 4-4 4M19 12H9" /><span>Log out</span></button>
      </div>
    </aside>
  );
}

function Dock({ pending }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const inMore = NAV.some((item) => item.more && pathname.startsWith(item.to));
  const go = (to) => { setOpen(false); navigate(to, { viewTransition: true }); };
  return (
    <>
      <nav className="dock" aria-label="Admin">
        {NAV.filter((item) => !item.more).map(({ to, label, short, path }) => (
          <NavLink key={to} to={to} viewTransition>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="dock-pill" className="dock-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon path={path} /><span>{short || label}</span>
                {to === "/request" && <PendingCount count={pending} />}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" data-more className={inMore ? "is-active" : undefined} onClick={() => setOpen(true)}>
          {inMore && <motion.span layoutId="dock-pill" className="dock-pill" />}
          <Icon path="M4 7h16M4 12h16M4 17h16" /><span>More</span>
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <Modal key="more" onClose={() => setOpen(false)}>
            <div className="dialog-body">
              <h2 className="dialog-title">More</h2>
              {NAV.filter((item) => item.more).map(({ to, label }) => (
                <button key={to} type="button" className={`btn btn-full ${pathname.startsWith(to) ? "btn-primary" : "btn-secondary"}`} onClick={() => go(to)}>{label}</button>
              ))}
              <a className="btn btn-secondary btn-full" href={WEBSITE} target="_blank" rel="noopener noreferrer">View website</a>
              <button type="button" className="btn btn-secondary btn-full" onClick={signOut}>Log out</button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => setOpen(false)}>Close</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function useSmoothScroll() {
  const reduced = useReducedMotion();
  const lenis = useRef(null);
  useEffect(() => {
    if (reduced) return undefined;
    const instance = new Lenis({ lerp: 0.12 });
    lenis.current = instance;
    let frame = requestAnimationFrame(function raf(time) {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    });
    return () => { cancelAnimationFrame(frame); instance.destroy(); lenis.current = null; };
  }, [reduced]);
  return lenis;
}

export default function Shell() {
  const { pending, error } = useAdmin();
  const { pathname } = useLocation();
  const lenis = useSmoothScroll();
  useLayoutEffect(() => {
    if (lenis.current) lenis.current.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
  }, [pathname, lenis]);
  useEffect(() => {
    const label = NAV.find((item) => pathname.startsWith(item.to))?.label || "Admin";
    document.title = `${pending.length ? `(${pending.length}) ` : ""}${label} | TCR Admin`;
  }, [pathname, pending.length]);
  return (
    <>
      <Sidebar pending={pending.length} />
      <main className="page">
        {error && <p className="warn" role="alert">{error}</p>}
        <Outlet />
      </main>
      <Dock pending={pending.length} />
    </>
  );
}
