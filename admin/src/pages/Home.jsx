import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ActionButton, Counter, EASE, PageHead, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { actionLabel, api, niceName } from "../lib/api.js";

const SHORTCUTS = [
  { to: "/players", title: "Add a score", copy: "Update a player's games and pins" },
  { to: "/players?new=1", title: "Add a player", copy: "Put someone on the roster" },
  { to: "/news", title: "Post news", copy: "Results, events and updates" },
  { to: "/content", title: "Edit website text", copy: "Home and About pages" },
];

function Telegram() {
  const { run } = useFeedback();
  const [status, setStatus] = useState(null);
  useEffect(() => { api("/api/admin/telegram-status").then(setStatus).catch(() => setStatus({ failed: true })); }, []);
  const ready = status?.ready;
  return (
    <section className="panel">
      <h2>Telegram alerts</h2>
      <p className="dim">Get a message when someone sends a score, and approve it from Telegram.</p>
      <p className="gap"><span className={`pill-state${ready ? " is-on" : ""}`} id="tgState">
        {!status ? "Checking…" : status.failed ? "Unknown" : ready ? `On · ${status.adminChats} ${status.adminChats === 1 ? "chat" : "chats"}` : "Not set up"}
      </span></p>
      {status && !status.failed && !ready && (
        <div className="gap dim small" id="tgHelp">
          <p>To turn this on:</p>
          <ol className="numbered">
            <li>Open the chat you want alerts in, and add the bot if it's a group.</li>
            <li>Send <span className="mono">/chatid</span> there.</li>
            <li>Add that number to <span className="mono">TELEGRAM_ADMIN_CHAT_IDS</span> in the server's .env file.</li>
            <li>Restart the backend.</li>
          </ol>
        </div>
      )}
      {ready && <ActionButton className="btn btn-secondary gap" busyText="Sending…" onAction={() => run(() => api("/api/admin/telegram-test", { method: "POST" }), "Test message sent. Check Telegram.")}>Send a test message</ActionButton>}
    </section>
  );
}

function Feed() {
  const [logs, setLogs] = useState(null);
  const { requests } = useAdmin();
  useEffect(() => { api("/api/admin/logs").then((data) => setLogs((data.logs || []).slice(0, 6))).catch(() => setLogs([])); }, [requests.length]);
  return (
    <section className="panel">
      <h2>Recent activity</h2>
      <ul className="feed gap" id="feed">
        {logs === null ? <li><span className="dim">Loading…</span></li>
          : !logs.length ? <li><span className="dim">Nothing yet.</span></li>
            : logs.map((log) => (
              <li key={log.id}>
                <span>{actionLabel(log.action)}{log.memberName || log.requester ? ` · ${niceName(log.memberName || log.requester)}` : ""}</span>
                <small>{new Date(log.timestamp).toLocaleDateString()}</small>
              </li>
            ))}
      </ul>
      <Link to="/logs" viewTransition className="btn btn-secondary gap">See all activity</Link>
    </section>
  );
}

export default function Home() {
  const { loaded, members, pending } = useAdmin();
  const games = members.reduce((sum, m) => sum + Number(m.games || 0), 0);
  const pins = members.reduce((sum, m) => sum + Number(m.scores || 0), 0);
  const who = pending.slice(0, 3).map((r) => niceName(r.name)).join(", ") + (pending.length > 3 ? ` and ${pending.length - 3} more` : "");
  const stats = [
    { id: "statPlayers", label: "Players", value: members.length },
    { id: "statGames", label: "Games", value: games },
    { id: "statPins", label: "Pins", value: pins },
  ];
  return (
    <>
      <PageHead eyebrow="Team Classic Rollers" title="Admin home" />
      <AnimatePresence initial={false} mode="wait">
        {loaded && (pending.length ? (
          <motion.section key="attention" className="attention" id="attention" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
            <div>
              <h2 id="attentionText">{pending.length} score {pending.length === 1 ? "request is" : "requests are"} waiting</h2>
              <p id="attentionWho">{who}</p>
            </div>
            <Link to="/request" viewTransition className="btn">Review score requests</Link>
          </motion.section>
        ) : (
          <motion.section key="clear" className="panel clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2>All caught up</h2>
            <p className="dim">No score requests are waiting for review.</p>
          </motion.section>
        ))}
      </AnimatePresence>
      <div className="grid grid-4">
        {stats.map((stat) => <div className="stat" key={stat.id}><span>{stat.label}</span><strong id={stat.id}>{loaded ? <Counter value={stat.value} /> : "—"}</strong></div>)}
        <div className="stat is-accent"><span>Team average</span><strong id="statAvg">{loaded && games ? <Counter value={pins / games} decimals={1} /> : "—"}</strong></div>
      </div>
      <div className="grid grid-4 gap">
        {SHORTCUTS.map((item) => <Link key={item.title} to={item.to} viewTransition className="action-card"><strong>{item.title}</strong><span>{item.copy}</span></Link>)}
      </div>
      <div className="grid grid-2 gap">
        <Feed />
        <Telegram />
      </div>
    </>
  );
}
