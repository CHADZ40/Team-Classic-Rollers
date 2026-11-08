// Registers a face: a 10 second scan, then the admin links it to the right member.
import { useEffect, useRef, useState } from "react";
import { ActionButton, Modal, useFeedback } from "./ui.jsx";
import CameraView from "./CameraView.jsx";
import { useAdmin } from "../data/store.jsx";
import { api, niceName } from "../lib/api.js";
import { CameraPicker, pause, useCamera, useFrameGrabber } from "../lib/camera.jsx";

const SCAN_MS = 10000;
const FRAME_GAP_MS = 450;
const MIN_VIEWS = 5;
const POSES = ["Look straight at the camera", "Turn your head slightly left", "Turn your head slightly right", "Tilt your chin up a little", "Look straight again"];
const HINTS = {
  no_face: "Step into the frame", two_faces: "One person at a time", too_small: "Come closer", blurry: "Hold still",
  dark: "Find more light", turned: "Turn back towards the camera", different_person: "A different face appeared",
};
const URL = "/api/admin/faces/captures";

export default function FaceRegister({ memberId: presetMember = "", onClose, onDone }) {
  const { members } = useAdmin();
  const { confirmAction, run } = useFeedback();
  const videoRef = useRef(null);
  const camera = useCamera(videoRef);
  const { ready, error: cameraError } = camera;
  const grab = useFrameGrabber(videoRef);
  const captureId = useRef("");
  const stopScan = useRef(false);
  const [phase, setPhase] = useState("ready");
  const [progress, setProgress] = useState(0);
  const [views, setViews] = useState(0);
  const [hint, setHint] = useState("");
  const [frame, setFrame] = useState(null);
  const [box, setBox] = useState(null);
  const [problem, setProblem] = useState("");
  const [match, setMatch] = useState(null);
  const [memberId, setMemberId] = useState(presetMember);
  const [consent, setConsent] = useState(false);

  // Nothing is kept from a scan that's abandoned.
  const discard = () => {
    const id = captureId.current;
    captureId.current = "";
    if (id) api(`${URL}/${id}`, { method: "DELETE" }).catch(() => {});
  };
  useEffect(() => () => { stopScan.current = true; discard(); }, []);

  const scan = async () => {
    setProblem(""); setViews(0); setBox(null); setMatch(null); setProgress(0);
    stopScan.current = false;
    setPhase("scanning");
    try {
      discard();
      const { id } = await api(URL, { method: "POST" });
      captureId.current = id;
      const started = performance.now();
      let saved = 0;
      while (performance.now() - started < SCAN_MS) {
        if (stopScan.current) return;
        const shot = await grab();
        if (shot) {
          const result = await api(`${URL}/${id}/frames`, { method: "POST", body: shot.blob });
          if (stopScan.current) return;
          saved = result.views;
          setViews(saved);
          setHint(result.accepted ? "" : HINTS[result.hint] || "");
          setFrame({ width: result.width, height: result.height });
          setBox(result.box ? { box: result.box, tone: result.accepted ? "good" : "ask" } : null);
        }
        setProgress(Math.min(1, (performance.now() - started) / SCAN_MS));
        await pause(FRAME_GAP_MS);
      }
      if (saved < MIN_VIEWS) {
        discard();
        setProblem("We couldn't get enough clear views. Check the light, stand closer and try again.");
        setPhase("ready");
        return;
      }
      const finished = await api(`${URL}/${id}/finish`, { method: "POST" });
      setMatch(finished.match);
      setPhase("match");
    } catch (failure) {
      if (stopScan.current) return;
      discard();
      setProblem(failure.message);
      setPhase("ready");
    }
  };

  const link = async () => {
    let force = false;
    if (match && match.memberId !== memberId) {
      const name = niceName(members.find((m) => m.id === memberId)?.name);
      force = await confirmAction({
        title: "This face is already registered",
        body: `It looks like ${niceName(match.name)}. Only continue if this really is ${name}, such as a twin or close relative.`,
        confirm: "Link anyway", danger: true,
      });
      if (!force) return;
    }
    const name = niceName(members.find((m) => m.id === memberId)?.name);
    const { ok } = await run(() => api(`${URL}/${captureId.current}/link`, { method: "POST", body: { memberId, consent, force } }), `Face registered for ${name}.`);
    if (ok) { captureId.current = ""; onDone(); }
  };

  const pose = POSES[Math.min(POSES.length - 1, Math.floor(progress * POSES.length))];
  return (
    <Modal onClose={onClose}>
      <div className="dialog-body">
        <h2 className="dialog-title">Register a face</h2>
        {phase !== "match" && (
          <CameraView ref={videoRef} mirrored={camera.mirrored} frame={frame} boxes={box ? [box] : []}>
            {!ready && !cameraError && <p className="camera-note">Opening camera…</p>}
            {cameraError && <p className="camera-note" role="alert">{cameraError}</p>}
          </CameraView>
        )}
        {problem && <p className="warn" role="alert">{problem}</p>}

        {phase === "ready" && (
          <>
            <CameraPicker camera={camera} />
            <p className="dim">Check the member is happy to use face check-in, then ask them to stand alone in the frame. The scan takes about 10 seconds.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!ready} onClick={scan}>Start scan</button>
            </div>
          </>
        )}

        {phase === "scanning" && (
          <>
            <p className="scan-pose" aria-live="polite">{hint || pose}</p>
            <div className="bar" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${progress * 100}%` }} /></div>
            <p className="dim mono">{views} clear {views === 1 ? "view" : "views"}</p>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </>
        )}

        {phase === "match" && (
          <>
            <p className="dim">Scan complete. Who was this?</p>
            {match && <p className="warn">This face looks like {niceName(match.name)}, who's already registered. Choosing them replaces their saved face.</p>}
            <label className="field">Member
              <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                <option value="">Choose a member…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{niceName(m.name)}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> This member agreed to face check-in, including a photo saved with each check-in</label>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Discard</button>
              <ActionButton disabled={!memberId || !consent} busyText="Saving…" onAction={link}>Link face</ActionButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
