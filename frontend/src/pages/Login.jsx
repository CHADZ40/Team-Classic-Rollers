import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Lines, Reveal, Tile } from "../components/motion.jsx";
import { Icon } from "../components/Shell.jsx";
import { API_BASE, SOCIALS } from "../lib/team.js";
import { useMemberSession } from "../data/MemberSession.jsx";
import { Segments } from "./Team.jsx";

const ADMIN_LOGIN_URL = "https://admin.teamclassicrollers.club/login.html";
const SWAP = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] } };

const PERKS = [
  ["My stats", "Your games, total pins and average in one place."],
  ["My profile", "Keep your details and photo up to date."],
  ["Score requests", "Send in games and follow each request."],
  ["Notifications", "Messages from the team, sent to you."],
  ["Training", "See sessions and your attendance."],
];

function useTelegramBot() {
  const [bot, setBot] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/public/login-info`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => { if (!cancelled && json?.telegramBot) setBot(json.telegramBot); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return bot;
}

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText("/login");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable: the command is still on screen */ }
  };
  return <button type="button" className="cmd" onClick={copy} aria-label="Copy the /login command">{copied ? "Copied" : "/login"}</button>;
}

function SignInSteps({ bot }) {
  const [mode, setMode] = useState("returning");
  const telegram = bot ? `https://t.me/${bot}` : null;
  return (
    <motion.div {...SWAP}>
      <Segments
        id="login-mode"
        label="Have you signed in before?"
        value={mode}
        onChange={setMode}
        options={[{ value: "returning", label: "Returning" }, { value: "first", label: "First time" }]}
      />
      <AnimatePresence mode="wait" initial={false}>
        {mode === "returning" ? (
          <motion.div key="returning" {...SWAP}>
            <ol className="login-steps">
              <li><b>Open the TCR bot</b><span>{bot ? <>It's <strong>@{bot}</strong> on Telegram.</> : "Find it in your Telegram chats."}</span></li>
              <li><b>Send <CopyCommand /></b><span>The bot replies with your personal sign-in link.</span></li>
              <li><b>Tap the link</b><span>It works once and lasts 5 minutes. Choose to be remembered and you'll stay signed in while you keep visiting.</span></li>
            </ol>
            {telegram && <a className="pill" href={telegram} target="_blank" rel="noopener noreferrer">Open Telegram <Icon name="arrow" /></a>}
          </motion.div>
        ) : (
          <motion.div key="first" {...SWAP}>
            <ol className="login-steps">
              <li><b>Ask a team admin for your link</b><span>They'll create one just for your roster profile.</span></li>
              <li><b>Open it in Telegram</b><span>Use it within 10 minutes. It only works once.</span></li>
              <li><b>Tap the link the bot sends you</b><span>That signs you in. Next time, just send <span className="cmd">/login</span> to the bot.</span></li>
            </ol>
            <a className="pill" href={SOCIALS[0].href} target="_blank" rel="noopener noreferrer">Message the team <Icon name="arrow" /></a>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="login-note">No password to remember. Telegram proves it's you.</p>
    </motion.div>
  );
}

function Faq({ question, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item">
      <button type="button" className="faq-q" aria-expanded={open} onClick={() => setOpen(!open)}>{question}<i aria-hidden="true" /></button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
            <p>{children}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Login() {
  const { status } = useMemberSession();
  const bot = useTelegramBot();
  // Already signed in: this page has nothing to do, so go straight to the portal.
  if (status === "in") return <Navigate to="/portal" replace />;
  return (
    <>
      <section className="wrap login">
        <div className="login-intro">
          <p className="label label--accent">Members</p>
          <Lines as="h1" className="mega mega--page" lines={["Member", "sign in"]} immediate />
          <p className="lede">Your stats, your profile and team updates, all in one place. Sign in with Telegram, so there's no password to remember.</p>
        </div>
        <div className="login-card">
          <SignInSteps bot={bot} />
        </div>
      </section>

      <section className="wrap section section--flush">
        <p className="label label--accent">Inside the portal</p>
        <div className="perks">
          {PERKS.map(([title, copy], i) => (
            <Reveal key={title} delay={i * 0.05}>
              <Tile className="full">
                <h2 className="tile-title">{title}</h2>
                <p className="dim gap-sm">{copy}</p>
              </Tile>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="wrap section section--flush-top">
        <Lines lines={["Need a hand?"]} className="display" />
        <div className="faq gap-top">
          <Faq question="My link expired or doesn't work">Sign-in links last 5 minutes and work once. Send <span className="cmd">/login</span> to the bot for a new one. If it's your first time, ask an admin for a new verification link, as those last 10 minutes.</Faq>
          <Faq question="I got a new phone">Install Telegram with the same account, then send <span className="cmd">/login</span> to the bot. Your membership stays linked to your Telegram account.</Faq>
          <Faq question="I'm using a different Telegram account now">Each roster profile links to one Telegram account. Ask an admin to unlink the old one, then they can send you a new verification link.</Faq>
          <Faq question="I don't use Telegram">Telegram is free to install and is how we confirm it's really you. If that's a problem, talk to an admin. You can still <Link to="/submit" viewTransition>submit a score</Link> without signing in.</Faq>
          <Faq question="Can I create an account?">Accounts are linked to the team roster, so an admin sets yours up once you've joined. Not on the team yet? <a href={SOCIALS[0].href} target="_blank" rel="noopener noreferrer">Send us a message</a> and say hello.</Faq>
        </div>
        <p className="admin-link">Team admin? <a href={ADMIN_LOGIN_URL}>Admin sign in</a></p>
      </section>
    </>
  );
}
