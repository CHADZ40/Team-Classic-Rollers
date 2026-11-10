import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Lines } from "../components/motion.jsx";
import { useSiteData } from "../data/SiteData.jsx";
import { API_BASE, SOCIALS, STATIC_SITE, activeMembers } from "../lib/team.js";

const MAX_FILES = 6;
const MAX_BYTES = 5 * 1024 * 1024;
const digits = (value) => String(value || "").replace(/\D/g, "");

function Burst() {
  const bits = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    i, angle: (i / 22) * Math.PI * 2, distance: 90 + (i % 5) * 34, color: ["var(--yellow)", "var(--red)", "var(--sky)", "#fff"][i % 4],
  })), []);
  return (
    <div className="burst" aria-hidden="true">
      {bits.map(({ i, angle, distance, color }) => (
        <motion.i
          key={i}
          style={{ background: color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 0, rotate: 240 }}
          transition={{ duration: 1, ease: [0.1, 0.7, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

// The published website has no server to receive scores, so members send them to the team.
function SendToTeam() {
  return (
    <section className="wrap submit">
      <div className="submit-intro">
        <p className="label label--accent">Scores</p>
        <Lines as="h1" className="mega mega--page" lines={["Send your", "score"]} immediate />
        <p className="lede">Message the team with your games, total pins and a photo of the lane screen. An admin adds it to the scoreboard.</p>
        <div className="actions">
          {SOCIALS.slice(0, 1).map(({ label, href }) => <a key={label} className="pill" href={href} target="_blank" rel="noopener noreferrer">Message us on {label}</a>)}
        </div>
      </div>
    </section>
  );
}

export default function Submit() {
  return STATIC_SITE ? <SendToTeam /> : <SubmitForm />;
}

function SubmitForm() {
  const { data } = useSiteData();
  const [params] = useSearchParams();
  const formRef = useRef(null);
  const [name, setName] = useState("");
  const [games, setGames] = useState(digits(params.get("games")));
  const [pins, setPins] = useState(digits(params.get("scores")));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const previews = useMemo(() => files.slice(0, MAX_FILES).map((file) => ({ name: file.name, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  const average = Number(games) > 0 && pins !== "" ? Number(pins) / Number(games) : null;

  const submit = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (files.length > MAX_FILES) { setNotice({ kind: "error", text: "Please upload no more than 6 pictures." }); return; }
    if (files.some((file) => file.size > MAX_BYTES)) { setNotice({ kind: "error", text: "Each picture must be 5 MB or smaller." }); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/public/game-requests`, { method: "POST", body: new FormData(formRef.current) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Unable to submit request.");
      formRef.current.reset();
      setName(""); setGames(""); setPins(""); setFiles([]);
      setNotice({ kind: "success", text: json.message || "Request submitted successfully." });
    } catch (error) {
      setNotice({ kind: "error", text: error.message === "Failed to fetch" ? "Connection error. Please try again." : error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wrap submit">
      <div className="submit-intro">
        <p className="label label--accent">Team members</p>
        <Lines as="h1" className="mega mega--page" lines={["Submit", "a score"]} immediate />
        <p className="lede">Send in your games and an admin will review them. Once approved, your average and rankings update.</p>
      </div>

      <motion.form
        ref={formRef}
        className="form"
        onSubmit={submit}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.text}
              className="notice"
              data-kind={notice.kind}
              role="status"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <p>{notice.text}</p>
              {notice.kind === "success" && <Burst />}
            </motion.div>
          )}
        </AnimatePresence>

        <label className="field">
          <span>Your name</span>
          <input name="name" type="text" list="roster" required maxLength={100} autoComplete="name" placeholder="Start typing your name" value={name} onChange={(event) => setName(event.target.value)} />
          <datalist id="roster">{activeMembers(data).map((member) => <option key={member.id} value={member.name} />)}</datalist>
        </label>

        <div className="field-row">
          <label className="field">
            <span>Games bowled</span>
            <input name="games" type="number" inputMode="numeric" min="1" max="10000" step="1" required placeholder="3" value={games} onChange={(event) => setGames(event.target.value)} />
          </label>
          <label className="field">
            <span>Total pins</span>
            <input name="scores" type="number" inputMode="numeric" min="0" max="1000000" step="1" required placeholder="487" value={pins} onChange={(event) => setPins(event.target.value)} />
          </label>
        </div>

        <AnimatePresence>
          {average !== null && (
            <motion.div className="avg" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <div><span>Average for these games</span><b data-testid="avg">{average.toFixed(1)}</b></div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="field">
          <span>Proof photos <small>(optional)</small></span>
          <label className="drop">
            <span>{files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} added. Tap to change.` : "Tap to add a photo of the lane screen"}</span>
            <input name="proofs" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="Proof photos" onChange={(event) => setFiles([...event.target.files])} />
          </label>
          <small>Up to 6 JPG, PNG or WEBP images, 5 MB each.</small>
          {previews.length > 0 && <div className="previews">{previews.map((preview) => <img key={preview.url} src={preview.url} alt={preview.name} />)}</div>}
        </div>

        <button className="pill pill--full" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
        <p className="fine">Your stats don't change straight away. An admin checks each request first.</p>
      </motion.form>
    </section>
  );
}
