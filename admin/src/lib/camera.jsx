// The camera for face check-in. Frames are only sent to the backend for analysis and never saved.
import { useEffect, useRef, useState } from "react";

const MAX_FRAME_SIDE = 1280;
const JPEG_QUALITY = 0.82;

function cameraProblem(error) {
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't open the camera here. The admin must be opened over HTTPS.";
  if (error?.name === "NotAllowedError") return "Camera access is blocked. Allow it in your browser's site settings, then try again.";
  if (error?.name === "NotFoundError") return "No camera was found on this device.";
  if (error?.name === "NotReadableError") return "The camera is being used by another app.";
  return "The camera couldn't be opened.";
}

const CAMERA_KEY = "tcrCamera";
const savedCamera = () => { try { return localStorage.getItem(CAMERA_KEY) || ""; } catch { return ""; } };
const saveCamera = (id) => { try { if (id) localStorage.setItem(CAMERA_KEY, id); else localStorage.removeItem(CAMERA_KEY); } catch { /* private mode: just not remembered */ } };

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "videoinput").map((device, i) => ({ id: device.deviceId, label: device.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

// Opens the camera for as long as the component is on screen, and always switches it off after.
// The chosen camera is remembered on this device. If it's been unplugged, the default is used.
export function useCamera(videoRef) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [wanted, setWanted] = useState(savedCamera);
  const [cameras, setCameras] = useState([]);
  const [current, setCurrent] = useState("");
  const [mirrored, setMirrored] = useState(true);

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    setReady(false);
    setError("");
    const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const open = (id) => navigator.mediaDevices.getUserMedia({ audio: false, video: id ? { deviceId: { exact: id }, ...size } : { facingMode: { ideal: "user" }, ...size } });
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
        let opened;
        try {
          opened = await open(wanted);
        } catch (failure) {
          if (!wanted || failure?.name === "NotAllowedError") throw failure;
          saveCamera("");
          opened = await open("");
        }
        if (cancelled) { opened.getTracks().forEach((track) => track.stop()); return; }
        stream = opened;
        const settings = stream.getVideoTracks()[0]?.getSettings() || {};
        // A camera facing away shows the scene as it is. One facing the admin reads better mirrored.
        setMirrored(settings.facingMode !== "environment");
        setCurrent(settings.deviceId || "");
        // Camera names only appear once permission is granted, so list them after opening.
        setCameras(await listCameras());
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch (failure) {
        if (!cancelled) setError(cameraProblem(failure));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [videoRef, wanted]);

  // A webcam plugged in or out while the page is open.
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return undefined;
    const refresh = async () => setCameras(await listCameras());
    devices.addEventListener("devicechange", refresh);
    return () => devices.removeEventListener("devicechange", refresh);
  }, []);

  const choose = (id) => { saveCamera(id); setWanted(id); };
  return { ready, error, cameras, current, choose, mirrored };
}

export function CameraPicker({ camera }) {
  if (camera.cameras.length < 2) return null;
  return (
    <label className="camera-pick">
      <span>Camera</span>
      <select value={camera.current} onChange={(event) => camera.choose(event.target.value)}>
        {camera.cameras.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}

export function useFrameGrabber(videoRef) {
  const canvas = useRef(null);
  return async function grab() {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight));
    canvas.current = canvas.current || document.createElement("canvas");
    const target = canvas.current;
    target.width = Math.round(video.videoWidth * scale);
    target.height = Math.round(video.videoHeight * scale);
    target.getContext("2d").drawImage(video, 0, 0, target.width, target.height);
    const blob = await new Promise((resolve) => { target.toBlob(resolve, "image/jpeg", JPEG_QUALITY); });
    return blob && { blob, canvas: target };
  };
}

// A small picture of one face, so the admin can see who a question is about. Stays in this page.
export function cropFace(source, [x, y, width, height], frameWidth) {
  const scale = source.width / frameWidth;
  const pad = width * 0.35 * scale;
  const side = Math.max(width, height) * scale + pad * 2;
  const left = x * scale - pad;
  const top = y * scale - pad;
  const crop = document.createElement("canvas");
  crop.width = 128;
  crop.height = 128;
  crop.getContext("2d").drawImage(source, left, top, side, side, 0, 0, 128, 128);
  return crop.toDataURL("image/jpeg", 0.8);
}

export const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
