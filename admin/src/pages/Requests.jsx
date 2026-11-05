import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActionButton, Loading, PageHead, SPRING, Tabs, useFeedback } from "../components/ui.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName, number, plural, suggestedMember } from "../lib/api.js";

function Summary({ request }) {
  const proofs = request.proofs || [];
  const verified = request.source === "member-portal";
  const status = { pending: "Waiting", approved: "Approved", rejected: "Rejected" }[request.status];
  return (
    <>
      <div className="request-top">
        <div>
          <h2>{niceName(request.name)}</h2>
          <p className="dim small">{new Date(request.createdAt).toLocaleString()} · {verified ? "Member Portal (verified)" : "Public form (name not verified)"}</p>
        </div>
        <span className={`pill-state ${request.status}`}>{status}</span>
      </div>
      <div className="figures">
        <div><span>Games</span><b>{number(request.games)}</b></div>
        <div><span>Total pins</span><b>{number(request.scores)}</b></div>
        <div><span>Average</span><b>{request.games ? (request.scores / request.games).toFixed(1) : "0.0"}</b></div>
      </div>
      {request.notes && <p className="gap">{request.notes}</p>}
      {proofs.length
        ? <div className="proofs">{proofs.map((proof, i) => <a key={proof} href={proof} target="_blank" rel="noopener noreferrer"><img src={proof} alt={`Proof ${i + 1}`} loading="lazy" /></a>)}</div>
        : <p className="dim small gap">No proof photos.</p>}
    </>
  );
}

function PendingCard({ request, members, onDecided }) {
  const { confirmAction, run } = useFeedback();
  const match = useMemo(() => suggestedMember(request, members), [request, members]);
  const [memberId, setMemberId] = useState(match?.id || "");
  const [reason, setReason] = useState("");
  const member = members.find((m) => m.id === memberId);
  const what = `${plural(request.games, "game")} and ${number(request.scores)} pins`;
  const review = (decision, success) => run(
    () => api(`/api/admin/game-requests/${encodeURIComponent(request.id)}/review`, { method: "POST", body: { decision, memberId, reason } }),
    success,
  ).then(({ ok }) => onDecided(ok));
  const reject = async () => {
    const yes = await confirmAction({ title: `Reject ${niceName(request.name)}'s request?`, body: "Their games and pins won't be added.", confirm: "Reject request", cancel: "Go back", danger: true });
    if (yes) await review("reject", "Request rejected.");
  };
  return (
    <>
      <Summary request={request} />
      {!match && <p className="warn">This name doesn't match the roster. Choose who it belongs to.</p>}
      <div className="review">
        <label className="field">Add to player
          <select data-member value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Choose a player…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.team}</option>)}
          </select>
        </label>
        <label className="field">Note <small>Optional</small><input data-note maxLength={300} placeholder="Reason or note" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <div className="btn-row">
          <ActionButton data-approve disabled={!member} busyText="Approving…" onAction={() => review("approve", `Added to ${member.name}.`)}>
            {member ? `Approve: add ${what} to ${member.name}` : "Choose a player to approve"}
          </ActionButton>
          <ActionButton className="btn btn-danger-quiet" data-reject onAction={reject}>Reject</ActionButton>
        </div>
      </div>
    </>
  );
}

export default function Requests() {
  const { loaded, requests, members, refresh } = useAdmin();
  const [tab, setTab] = useState("pending");
  const count = (status) => { const n = requests.filter((r) => r.status === status).length; return n ? ` (${n})` : ""; };
  const list = requests.filter((r) => r.status === tab);
  return (
    <>
      <PageHead eyebrow="Review" title="Score requests" intro="Check the proof, confirm who it belongs to, then approve or reject. New requests appear here by themselves." />
      <div className="toolbar">
        <Tabs id="requests" label="Filter requests" value={tab} onChange={setTab} options={[
          { value: "pending", label: `Waiting${count("pending")}` },
          { value: "approved", label: `Approved${count("approved")}` },
          { value: "rejected", label: `Rejected${count("rejected")}` },
        ]} />
      </div>
      {!loaded ? <Loading /> : (
        <div id="requests">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((request) => (
              <motion.article
                layout
                key={request.id}
                className={`request${request.status === "pending" ? " is-pending" : ""}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 60, scale: 0.97 }}
                transition={SPRING}
              >
                {request.status === "pending"
                  ? <PendingCard request={request} members={members} onDecided={refresh} />
                  : (
                    <>
                      <Summary request={request} />
                      <p className="dim small gap">
                        {request.status === "approved" ? `Added to ${request.memberName || "the player"}` : "Rejected"}
                        {request.reviewedAt ? ` on ${new Date(request.reviewedAt).toLocaleString()}` : ""}
                        {request.reviewReason ? ` · ${request.reviewReason}` : ""}
                      </p>
                    </>
                  )}
              </motion.article>
            ))}
          </AnimatePresence>
          {!list.length && <div className="panel empty">{tab === "pending" ? "All caught up. Nothing is waiting." : "Nothing here yet."}</div>}
        </div>
      )}
    </>
  );
}
