import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton, PageHead, useFeedback } from "../components/ui.jsx";
import { actionLabel, api, number } from "../lib/api.js";

function describeChange(x) {
  const signed = (n) => `${Number(n) > 0 ? "+" : ""}${number(n)}`;
  if (x.field === "scores" || x.field === "games") return `${x.field === "scores" ? "Pins" : "Games"} ${number(x.previousValue)} → ${number(x.newValue)} (${signed(x.amount)})`;
  if (x.gamesAdded !== undefined) return `+${number(x.gamesAdded)} games, +${number(x.scoresAdded)} pins`;
  if (x.games !== undefined && x.scores !== undefined) return `${number(x.games)} games, ${number(x.scores)} pins`;
  return x.reason || "—";
}

export default function Activity() {
  const { confirmAction, run, toast } = useFeedback();
  const [logs, setLogs] = useState(null);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    const data = await api("/api/admin/logs");
    setLogs(data.logs || []);
  }, []);
  useEffect(() => { load().catch((failure) => toast(failure.message, true)); }, [load, toast]);

  const actions = useMemo(() => [...new Set((logs || []).map((x) => x.action))].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b))), [logs]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (logs || []).filter((x) => (!action || x.action === action) && (!needle || `${actionLabel(x.action)} ${JSON.stringify(x)}`.toLowerCase().includes(needle)));
  }, [logs, query, action]);

  const wipe = async () => {
    const yes = await confirmAction({ title: "Delete all activity?", body: "The whole history goes, including score history on player profiles. This can't be undone.", confirm: "Delete all activity", cancel: "Keep activity", danger: true, typed: "DELETE" });
    if (!yes) return;
    const { ok } = await run(() => api("/api/admin/reset-logs", { method: "POST", body: {} }), "Activity deleted.");
    if (ok) await load();
  };

  return (
    <>
      <PageHead eyebrow="History" title="Activity" intro="Every change made by admins, newest first. Shows up to the last 1,000 records." />
      <div className="toolbar">
        <input id="logSearch" type="search" placeholder="Search player or action" aria-label="Search activity" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select id="actionFilter" aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="">All activity</option>
          {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Player</th><th>Change</th></tr></thead>
            <tbody id="logsBody">
              {logs === null ? <tr><td colSpan={5} className="dim">Loading…</td></tr>
                : !rows.length ? <tr><td colSpan={5} className="dim">No matching activity.</td></tr>
                  : rows.map((x) => (
                    <tr key={x.id}>
                      <td className="mono small">{new Date(x.timestamp).toLocaleString()}</td>
                      <td>{x.actor || "admin"}</td>
                      <td><span className="tag">{actionLabel(x.action)}</span></td>
                      <td>{x.memberName || x.requester || x.details || "—"}{x.team && <small>{x.team}</small>}</td>
                      <td>{describeChange(x)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="danger-zone gap-lg">
        <h3>Danger zone</h3>
        <p className="dim small">Deletes the whole activity history, which also clears score history on player profiles.</p>
        <div className="btn-row"><ActionButton className="btn btn-danger-quiet" id="resetLogs" onAction={wipe}>Delete all activity</ActionButton></div>
      </section>
    </>
  );
}
