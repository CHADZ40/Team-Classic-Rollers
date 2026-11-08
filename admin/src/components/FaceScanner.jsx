// Live check-in. Strong matches mark themselves present. Anything less certain asks the admin.
import { useEffect, useRef, useState } from "react";
import { ActionButton, useFeedback } from "./ui.jsx";
import CameraView from "./CameraView.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName } from "../lib/api.js";
import { CameraPicker, cropFace, pause, useCamera, useFrameGrabber } from "../lib/camera.jsx";

const FRAME_GAP_MS = 1000;
const RECENT_SHOWN = 5;
const HINTS = { too_small: "Come closer", blurry: "Hold still", dark: "More light", turned: "Face the camera" };

function faceLabel(face) {
  if (face.state === "adjust") return { tone: "muted", label: HINTS[face.hint] || "Adjust" };
  if (face.state === "checked-in" || face.state === "present") return { tone: "good", label: `${niceName(face.name)} ✓` };
  if (face.state === "confirming") return { tone: "busy", label: `${niceName(face.name)}…` };
  if (face.state === "held") return { tone: "muted", label: `${niceName(face.name)} · set by admin` };
  if (face.state === "review") return { tone: "ask", label: "Needs a check" };
  return { tone: "ask", label: "Not recognized" };
}

function Prompt({ prompt, crop, sessionUrl, onSolved, onRegister }) {
  const { members } = useAdmin();
  const { run } = useFeedback();
  const [learn, setLearn] = useState(false);
  const url = `${sessionUrl}/prompts/${encodeURIComponent(prompt.id)}`;

  const confirm = async (memberId) => {
    const name = niceName(members.find((m) => m.id === memberId)?.name);
    const { ok } = await run(() => api(`${url}/confirm`, { method: "POST", body: { memberId, addToProfile: learn } }), `${name} marked present.`);
    if (ok) onSolved(prompt.id, true);
  };
  const dismiss = async () => {
    const { ok } = await run(() => api(url, { method: "DELETE" }));
    if (ok) onSolved(prompt.id, false);
  };

  return (
    <article className="prompt">
      {crop ? <img src={crop} alt="Face from the camera" /> : <div className="prompt-blank" />}
      <div className="prompt-body">
        <strong>{prompt.candidates.length ? "Who is this?" : "Not recognized"}</strong>
        <div className="btn-row">
          {prompt.candidates.map((item) => (
            <ActionButton key={item.memberId} className="btn btn-primary btn-small" onAction={() => confirm(item.memberId)}>{niceName(item.name)}</ActionButton>
          ))}
          <select aria-label="Choose another member" value="" onChange={(event) => { if (event.target.value) confirm(event.target.value); }}>
            <option value="">{prompt.candidates.length ? "Someone else…" : "Choose a member…"}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{niceName(m.name)}</option>)}
          </select>
        </div>
        {prompt.candidates.length > 0 && (
          <label className="check check-small"><input type="checkbox" checked={learn} onChange={(event) => setLearn(event.target.checked)} /> Add this view to their face profile</label>
        )}
        <div className="btn-row">
          {!prompt.candidates.length && <button type="button" className="btn btn-secondary btn-small" onClick={onRegister}>Register face</button>}
          <ActionButton className="btn btn-secondary btn-small" onAction={dismiss}>Ignore</ActionButton>
        </div>
      </div>
    </article>
  );
}

export default function FaceScanner({ sessionUrl, onChange, onRegister, onUndo }) {
  const { toast } = useFeedback();
  const videoRef = useRef(null);
  const crops = useRef(new Map());
  const camera = useCamera(videoRef);
  const { ready, error: cameraError } = camera;
  const grab = useFrameGrabber(videoRef);
  const [view, setView] = useState({ faces: [], frame: null, prompts: [], registered: null });
  const [recent, setRecent] = useState([]);
  const [problem, setProblem] = useState("");
  const [solved, setSolved] = useState(() => new Set());
  const latest = useRef({ onChange, toast });
  useEffect(() => { latest.current = { onChange, toast }; });

  useEffect(() => {
    if (!ready || problem) return undefined;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const started = performance.now();
        if (!document.hidden) {
          try {
            const shot = await grab();
            if (shot && !stopped) {
              const result = await api(`${sessionUrl}/scan`, { method: "POST", body: shot.blob });
              if (stopped) return;
              for (const face of result.faces) {
                if (face.promptId && !crops.current.has(face.promptId)) crops.current.set(face.promptId, cropFace(shot.canvas, face.box, result.width));
              }
              setView({ faces: result.faces, frame: { width: result.width, height: result.height }, prompts: result.prompts, registered: result.registered });
              if (result.checkedIn.length) {
                setRecent((current) => [...result.checkedIn, ...current].slice(0, RECENT_SHOWN));
                result.checkedIn.forEach((item) => latest.current.toast(`${niceName(item.name)} checked in.`));
                latest.current.onChange();
              }
            }
          } catch (failure) {
            if (!stopped) setProblem(failure.message);
            return;
          }
        }
        await pause(Math.max(150, FRAME_GAP_MS - (performance.now() - started)));
      }
    })();
    return () => { stopped = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, problem, sessionUrl]);

  const solve = (id, marked) => {
    setSolved((current) => new Set(current).add(id));
    crops.current.delete(id);
    if (marked) onChange();
  };
  const undo = async (item) => {
    if (await onUndo(item.memberId)) setRecent((current) => current.filter((x) => x.memberId !== item.memberId));
  };

  const prompts = view.prompts.filter((prompt) => !solved.has(prompt.id));
  return (
    <section className="panel scanner" aria-label="Face check-in">
      <div className="scanner-view">
        <CameraView ref={videoRef} mirrored={camera.mirrored} frame={view.frame} boxes={view.faces.map((face) => ({ box: face.box, ...faceLabel(face) }))}>
          {!ready && !cameraError && <p className="camera-note">Opening camera…</p>}
          {cameraError && <p className="camera-note" role="alert">{cameraError}</p>}
        </CameraView>
        <div className="btn-row gap">
          <CameraPicker camera={camera} />
          {problem && <button type="button" className="btn btn-primary btn-small" onClick={() => setProblem("")}>Try again</button>}
        </div>
      </div>
      <div className="scanner-side" aria-live="polite">
        {problem && <p className="warn" role="alert">{problem}</p>}
        {view.registered === 0 && <p className="warn">Nobody has a registered face yet. Register members first, or mark them by hand below.</p>}
        {recent.length > 0 && (
          <div>
            <h3>Just checked in</h3>
            <ul className="recent">
              {recent.map((item) => (
                <li key={item.memberId}><span className="recent-who">{item.photo && <img src={`${sessionUrl}/photos/${encodeURIComponent(item.rowId)}`} alt="" />}{niceName(item.name)}</span><ActionButton className="btn btn-secondary btn-small" onAction={() => undo(item)}>Undo</ActionButton></li>
              ))}
            </ul>
          </div>
        )}
        {prompts.map((prompt) => (
          <Prompt key={prompt.id} prompt={prompt} crop={crops.current.get(prompt.id)} sessionUrl={sessionUrl} onSolved={solve} onRegister={onRegister} />
        ))}
        {!recent.length && !prompts.length && !problem && <p className="dim">Ask each member to stand in front of the camera for a few seconds.</p>}
      </div>
    </section>
  );
}
