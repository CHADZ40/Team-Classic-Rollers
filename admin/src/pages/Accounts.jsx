import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActionButton, EASE, Loading, PageHead, useFeedback } from "../components/ui.jsx";
import { api } from "../lib/api.js";

export default function Accounts() {
  const { confirmAction, run, toast } = useFeedback();
  const [data, setData] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [link, setLink] = useState(null);

  const load = useCallback(async () => {
    const result = await api("/api/admin/member-accounts");
    setData(result);
    setMemberId((current) => current || result.members[0]?.id || "");
  }, []);
  useEffect(() => { load().catch((failure) => toast(failure.message, true)); }, [load, toast]);

  const generate = async () => {
    const { ok, result } = await run(() => api("/api/admin/member-accounts/verification", { method: "POST", body: { memberId } }));
    if (ok) setLink(result);
  };
  const unlink = async (account) => {
    const name = account.member?.name || "this player";
    const yes = await confirmAction({ title: `Unlink ${name}?`, body: "They won't be able to sign in until you send them a new link.", confirm: "Unlink account", cancel: "Keep linked", danger: true });
    if (!yes) return;
    const { ok } = await run(() => api(`/api/admin/member-accounts/${encodeURIComponent(account.telegramId)}/unlink`, { method: "POST", body: {} }), "Account unlinked.");
    if (ok) await load();
  };
  const copy = () => navigator.clipboard.writeText(link.link).then(() => toast("Link copied."), () => toast("Couldn't copy. Use Open in Telegram.", true));

  return (
    <>
      <PageHead eyebrow="Telegram" title="Member accounts" intro="Link a player's Telegram so they can use the Member Portal. After that, they can sign in themselves by sending /login to the bot." />
      {!data ? <Loading /> : (
        <>
          <section className="panel">
            <h2>Create a verification link</h2>
            <p className="dim">Pick the player, then send them the link. It works once and lasts 10 minutes.</p>
            <div className="form gap">
              <label className="field">Player
                <select id="member" value={memberId} onChange={(event) => { setMemberId(event.target.value); setLink(null); }}>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.team}</option>)}
                </select>
              </label>
              <div className="btn-row"><ActionButton id="generate" busyText="Creating…" onAction={generate}>Create link</ActionButton></div>
            </div>
            <AnimatePresence>
              {link && (
                <motion.div id="result" className="gap reveal-box" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                  <p>Expires {new Date(link.expiresAt).toLocaleTimeString()}. Send this to the player, or let them scan the code.</p>
                  <div className="btn-row gap">
                    <button type="button" className="btn btn-primary" onClick={copy}>Copy link</button>
                    <a className="btn btn-secondary" href={link.link} target="_blank" rel="noopener noreferrer">Open in Telegram</a>
                  </div>
                  <img className="gap qr" src={link.qr} alt="Verification QR code" />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
          <section className="panel">
            <h2>Linked accounts</h2>
            <div className="gap">
              {data.accounts.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Player</th><th>Telegram</th><th>Linked on</th><th /></tr></thead>
                    <tbody>
                      {data.accounts.map((account) => (
                        <tr key={account.telegramId}>
                          <td>{account.member?.name || "Missing player"}<small>{account.member?.team || ""}</small></td>
                          <td>{account.telegramUsername ? `@${account.telegramUsername}` : account.telegramId}</td>
                          <td>{account.verifiedAt ? new Date(account.verifiedAt).toLocaleDateString() : "—"}</td>
                          <td><ActionButton className="btn btn-danger-quiet" onAction={() => unlink(account)}>Unlink</ActionButton></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="empty">No linked accounts yet.</p>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
