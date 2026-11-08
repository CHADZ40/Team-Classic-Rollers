// Training sessions, attendance and face check-in. Every route here is for admins only.
//
// Camera frames are held in memory just long enough to analyse, then dropped. They must never
// go through the shared upload middleware, because the uploads folder is public. Only face
// embeddings are saved, in a private file, and only after an admin records the member's consent.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { Sightings, classify, dot, rankPeople, pickDiverse } = require("./face-match");

const FACE_SERVICE_URL = (process.env.FACE_SERVICE_URL || "http://127.0.0.1:3200").replace(/\/$/, "");
const MATCH_MARGIN = 0.08;
const override = (name, fallback) => {
  const value = process.env[name];
  return value && Number.isFinite(Number(value)) ? Number(value) : fallback;
};
// Each model scores differently, so the service reports its own limits with every frame.
// Set these in .env to tune them for your camera. See "Tuning" in face-service/README.md.
const limitsFrom = ({ thresholds }) => ({
  strong: override("FACE_STRONG_MATCH", thresholds.strong),
  unsure: override("FACE_UNSURE_MATCH", thresholds.unsure),
  same: override("FACE_SAME_PERSON", thresholds.same),
  margin: MATCH_MARGIN,
});

const SIGHTINGS_NEEDED = 3;
const SIGHTINGS_WINDOW_MS = 8000;
const PROMPT_AFTER_SIGHTINGS = 2;
const PROMPT_TTL_MS = 5 * 60 * 1000;
const PROMPTS_SHOWN = 6;
const PROMPTS_KEPT = 24;
const CAPTURE_TTL_MS = 15 * 60 * 1000;
const CAPTURE_MAX_VIEWS = 40;
const REGISTER_MIN_VIEWS = 5;
const REGISTER_SAVED_VIEWS = 8;
const PROFILE_MAX_VIEWS = 12;
const SECOND_FACE_RATIO = 0.6;
const SERVICE_TIMEOUT_MS = 8000;
// A photo of each person checked in by face is kept with the session for this many days,
// for admins only. Set CHECKIN_PHOTO_DAYS=0 to stop saving them.
const PHOTO_KEEP_DAYS = override("CHECKIN_PHOTO_DAYS", 90);

// Live scanning sends about one frame a second, which would use up the general API limit.
// server.js skips these paths there, and they get this limit of their own instead.
const FRAME_ROUTES = /^\/admin\/(training-sessions\/[^/]+\/scan|faces\/captures\/[^/]+\/frames)$/;
const frameLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 3000, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: (req) => String(req.headers["cf-connecting-ip"] || req.ip),
  message: { error: "Too many camera frames right now. Please wait a few minutes." },
  validate: { xForwardedForHeader: false },
});
const frameBody = express.raw({ type: "image/jpeg", limit: "2mb" });

class ServiceOffline extends Error {}

async function analyze(frame) {
  let response;
  try {
    response = await fetch(`${FACE_SERVICE_URL}/analyze`, {
      method: "POST", headers: { "Content-Type": "image/jpeg" }, body: frame, signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
  } catch { throw new ServiceOffline(); }
  if (response.status === 400) { const error = new Error("That camera frame couldn't be read."); error.status = 400; throw error; }
  if (!response.ok) throw new ServiceOffline();
  return response.json();
}

// A head-and-shoulders crop of one person, cut from a frame already in memory. A failed
// crop never blocks the check-in itself.
async function cropPhoto(frame, box) {
  if (PHOTO_KEEP_DAYS <= 0 || !frame) return null;
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/crop?box=${box.map((v) => Math.round(v)).join(",")}`, {
      method: "POST", headers: { "Content-Type": "image/jpeg" }, body: frame, signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    });
    return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
  } catch { return null; }
}

async function serviceStatus() {
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return { ready: false };
    const { model } = await response.json();
    return { ready: true, model };
  } catch { return { ready: false }; }
}

// Express 4 doesn't catch errors from async routes by itself.
const safely = (handler) => (req, res, next) => handler(req, res, next).catch((error) => {
  if (error instanceof ServiceOffline) return res.status(503).json({ error: "Face check-in is offline. You can still mark attendance by hand." });
  if (error.status) return res.status(error.status).json({ error: error.message });
  next(error);
});

const hasFrame = (req, res) => {
  if (Buffer.isBuffer(req.body) && req.body.length) return true;
  res.status(400).json({ error: "Send a JPEG camera frame." });
  return false;
};

const compact = (embedding) => embedding.map((value) => Number(value.toFixed(5)));

function registerAttendance(app, { requireAdmin, readList, writeList, readData, writeAuditLog, adminUser, photoDir }) {
  // Check-in photos live beside the other private member files, never in the public uploads.
  const PHOTO_DIR = path.resolve(photoDir);
  fs.mkdirSync(PHOTO_DIR, { recursive: true, mode: 0o700 });
  const photoPath = (row) => path.join(PHOTO_DIR, `${row.id}.jpg`);
  // Done before replying, so a photo is gone by the time the admin is told it was removed.
  const deletePhotos = (rows) => {
    for (const row of rows) {
      if (!row.photo) continue;
      try { fs.rmSync(photoPath(row), { force: true }); } catch (error) { console.error("Couldn't delete a check-in photo:", error.message); }
    }
  };

  // ---- Saved data ----
  let facesCache = null;
  const readFaces = () => { facesCache = facesCache || readList("faces"); return facesCache; };
  const writeFaces = (list) => { writeList("faces", list); facesCache = list; };

  const activeMembers = () => new Map(readData().members.filter((m) => m.active !== false).map((m) => [String(m.id), m]));
  const findSession = (id) => readList("training").find((s) => s.id === id);
  const sessionRows = (id) => readList("attendance").filter((row) => row.sessionId === id);

  // Embeddings from a different model can't be compared, so those people need registering again.
  const peopleFor = (model, members) => readFaces().filter((p) => p.model === model && members.has(p.memberId));

  function record(session, member, status, method, score, photo) {
    const memberId = String(member.id);
    const mine = (row) => row.sessionId === session.id && String(row.memberId) === memberId;
    const all = readList("attendance");
    deletePhotos(all.filter(mine));
    const rows = all.filter((row) => !mine(row));
    const row = { id: crypto.randomUUID(), sessionId: session.id, memberId, memberName: member.name, status, method, recordedAt: new Date().toISOString(), recordedBy: adminUser };
    if (score !== undefined) row.matchScore = Number(score.toFixed(3));
    if (photo) {
      fs.writeFileSync(photoPath(row), photo, { mode: 0o600 });
      row.photo = true;
    }
    rows.push(row);
    writeList("attendance", rows);
    writeAuditLog("training_attendance_recorded", { sessionId: session.id, memberId, memberName: member.name, status, method });
    return row;
  }

  function removeFaces(memberId) {
    const list = readFaces();
    const kept = list.filter((p) => p.memberId !== String(memberId));
    if (kept.length === list.length) return false;
    writeFaces(kept);
    return true;
  }

  // ---- State that only matters during a scan ----
  const live = new Map();
  const captures = new Map();
  const liveFor = (sessionId) => {
    if (!live.has(sessionId)) live.set(sessionId, { sightings: new Sightings({ needed: SIGHTINGS_NEEDED, windowMs: SIGHTINGS_WINDOW_MS }), held: new Set(), prompts: new Map() });
    return live.get(sessionId);
  };

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, capture] of captures) if (now - capture.createdAt > CAPTURE_TTL_MS) captures.delete(id);
    for (const state of live.values()) for (const [id, prompt] of state.prompts) if (now - prompt.lastSeen > PROMPT_TTL_MS) state.prompts.delete(id);
  }, 60 * 1000);
  sweep.unref();

  function expirePhotos() {
    if (PHOTO_KEEP_DAYS <= 0) return;
    const cutoff = Date.now() - PHOTO_KEEP_DAYS * 24 * 3600 * 1000;
    const rows = readList("attendance");
    const old = rows.filter((row) => row.photo && Date.parse(row.recordedAt) < cutoff);
    if (!old.length) return;
    deletePhotos(old);
    for (const row of old) delete row.photo;
    writeList("attendance", rows);
  }
  expirePhotos();
  setInterval(expirePhotos, 6 * 3600 * 1000).unref();

  // The same face turns up in frame after frame, so it updates one prompt rather than adding more.
  function promptFor(state, face, ranked, level, limits, now, frame) {
    let prompt = [...state.prompts.values()].find((item) => dot(item.embedding, face.embedding) >= limits.same);
    if (!prompt) {
      prompt = { id: crypto.randomUUID(), embedding: face.embedding, sightings: 0, dismissed: false, createdAt: now };
      state.prompts.set(prompt.id, prompt);
      if (state.prompts.size > PROMPTS_KEPT) state.prompts.delete(state.prompts.keys().next().value);
    }
    prompt.sightings += 1;
    prompt.lastSeen = now;
    // The latest frame, so a photo can be saved if the admin confirms who this is.
    prompt.frame = frame;
    prompt.box = face.box;
    prompt.kind = level === "unknown" ? "unknown" : "review";
    prompt.candidates = level === "unknown" ? [] : ranked.slice(0, 3).filter((item) => item.score >= limits.unsure);
    return prompt;
  }

  const dropPromptsLike = (state, embedding, limits) => {
    for (const [id, prompt] of state.prompts) if (dot(prompt.embedding, embedding) >= limits.same) state.prompts.delete(id);
  };

  function visiblePrompts(state, members) {
    return [...state.prompts.values()]
      .filter((prompt) => !prompt.dismissed && prompt.sightings >= PROMPT_AFTER_SIGHTINGS)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, PROMPTS_SHOWN)
      .map((prompt) => ({
        id: prompt.id, kind: prompt.kind,
        candidates: prompt.candidates.filter((item) => members.has(item.memberId)).map((item) => ({ memberId: item.memberId, name: members.get(item.memberId).name, score: Number(item.score.toFixed(3)) })),
      }));
  }

  // ---- Training sessions ----
  const withCounts = (session, rows) => {
    const own = rows.filter((row) => row.sessionId === session.id);
    return { ...session, open: session.open === true, presentCount: own.filter((row) => row.status === "present").length };
  };

  app.get("/api/admin/training-sessions", requireAdmin, (_req, res) => {
    const rows = readList("attendance");
    res.set("Cache-Control", "no-store");
    res.json({ sessions: readList("training").map((session) => withCounts(session, rows)) });
  });

  app.post("/api/admin/training-sessions", requireAdmin, (req, res) => {
    const title = String(req.body.title || "").trim().slice(0, 120);
    const date = String(req.body.date || "").slice(0, 30);
    const location = String(req.body.location || "").slice(0, 200);
    if (!title || !date) return res.status(400).json({ error: "Title and date are required." });
    const sessions = readList("training");
    const item = { id: crypto.randomUUID(), title, date, location, notes: String(req.body.notes || "").slice(0, 1000), active: true, open: true, createdAt: new Date().toISOString() };
    sessions.unshift(item);
    writeList("training", sessions);
    writeAuditLog("training_session_created", { sessionId: item.id, title, date });
    res.status(201).json({ ok: true, session: withCounts(item, []) });
  });

  app.get("/api/admin/training-sessions/:id", requireAdmin, (req, res) => {
    const session = findSession(req.params.id);
    if (!session) return res.status(404).json({ error: "Training session not found." });
    res.set("Cache-Control", "no-store");
    const rows = sessionRows(session.id);
    res.json({ session: withCounts(session, rows), attendance: rows });
  });

  app.patch("/api/admin/training-sessions/:id", requireAdmin, (req, res) => {
    const sessions = readList("training");
    const session = sessions.find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: "Training session not found." });
    if (typeof req.body.open !== "boolean") return res.status(400).json({ error: "Say whether the session should be open." });
    session.open = req.body.open;
    session[session.open ? "openedAt" : "closedAt"] = new Date().toISOString();
    writeList("training", sessions);
    if (!session.open) live.delete(session.id);
    writeAuditLog(session.open ? "training_session_opened" : "training_session_closed", { sessionId: session.id, title: session.title });
    res.json({ ok: true, session: withCounts(session, sessionRows(session.id)) });
  });

  app.delete("/api/admin/training-sessions/:id", requireAdmin, (req, res) => {
    const sessions = readList("training");
    const session = sessions.find((s) => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: "Training session not found." });
    writeList("training", sessions.filter((s) => s.id !== session.id));
    const rows = readList("attendance");
    deletePhotos(rows.filter((row) => row.sessionId === session.id));
    writeList("attendance", rows.filter((row) => row.sessionId !== session.id));
    live.delete(session.id);
    writeAuditLog("training_session_deleted", { sessionId: session.id, title: session.title });
    res.json({ ok: true });
  });

  // Attendance can only change while the session is open, so closing it locks the record.
  const openSession = (req, res) => {
    const session = findSession(req.params.id);
    if (!session) { res.status(404).json({ error: "Training session not found." }); return null; }
    if (session.open !== true) { res.status(409).json({ error: "This session is closed. Reopen it to change attendance." }); return null; }
    return session;
  };

  app.post("/api/admin/training-sessions/:id/attendance", requireAdmin, (req, res) => {
    const session = openSession(req, res);
    if (!session) return;
    const member = activeMembers().get(String(req.body.memberId || ""));
    if (!member) return res.status(400).json({ error: "Select a valid member." });
    const state = liveFor(session.id);
    state.held.delete(String(member.id));
    state.sightings.clear(String(member.id));
    res.json({ ok: true, row: record(session, member, req.body.present === false ? "absent" : "present", "manual") });
  });

  // Undo also stops the camera marking this member again, or a wrong match still standing
  // in front of it would come straight back. Marking them by hand lifts that.
  app.delete("/api/admin/training-sessions/:id/attendance/:memberId", requireAdmin, (req, res) => {
    const session = openSession(req, res);
    if (!session) return;
    const memberId = String(req.params.memberId);
    const rows = readList("attendance");
    const kept = rows.filter((row) => !(row.sessionId === session.id && String(row.memberId) === memberId));
    if (kept.length === rows.length) return res.status(404).json({ error: "No attendance to undo for this member." });
    deletePhotos(rows.filter((row) => !kept.includes(row)));
    writeList("attendance", kept);
    const state = liveFor(session.id);
    state.held.add(memberId);
    state.sightings.clear(memberId);
    writeAuditLog("training_attendance_undone", { sessionId: session.id, memberId, memberName: rows.find((row) => String(row.memberId) === memberId)?.memberName });
    res.json({ ok: true });
  });

  // ---- Live scanning ----
  app.post("/api/admin/training-sessions/:id/scan", frameLimit, requireAdmin, frameBody, safely(async (req, res) => {
    if (!hasFrame(req, res) || !openSession(req, res)) return;
    const result = await analyze(req.body);
    // The session may have been closed while that frame was being analysed.
    const session = openSession(req, res);
    if (!session) return;

    const limits = limitsFrom(result);
    const members = activeMembers();
    const people = peopleFor(result.model, members);
    const state = liveFor(session.id);
    const now = Date.now();
    const recorded = new Map(sessionRows(session.id).map((row) => [String(row.memberId), row]));

    const judged = result.faces.map((face) => {
      if (face.quality !== "ok") return { face };
      const ranked = rankPeople(face.embedding, people);
      return { face, ranked, level: classify(ranked, limits) };
    });
    // Two faces matching one member means one of them isn't that member, or it's a photo of them.
    const strongCount = new Map();
    for (const { ranked, level } of judged) if (level === "strong") strongCount.set(ranked[0].memberId, (strongCount.get(ranked[0].memberId) || 0) + 1);

    const toRecord = [];
    const faces = judged.map(({ face, ranked, level }) => {
      const base = { box: face.box };
      if (!level) return { ...base, state: "adjust", hint: face.quality };
      const best = ranked[0];
      const name = best ? members.get(best.memberId)?.name : undefined;
      const row = best && recorded.get(best.memberId);

      if (level === "strong" && strongCount.get(best.memberId) === 1) {
        if (row?.status === "present") return { ...base, state: "present", memberId: best.memberId, name };
        if (row || state.held.has(best.memberId)) return { ...base, state: "held", memberId: best.memberId, name };
        const seen = state.sightings.add(best.memberId, now);
        if (seen < SIGHTINGS_NEEDED) return { ...base, state: "confirming", memberId: best.memberId, name, progress: seen / SIGHTINGS_NEEDED };
        recorded.set(best.memberId, { status: "present" });
        state.sightings.clear(best.memberId);
        dropPromptsLike(state, face.embedding, limits);
        toRecord.push({ face, best, name });
        return { ...base, state: "checked-in", memberId: best.memberId, name };
      }

      // Someone already marked present often scores lower at an odd angle. Don't ask about them again.
      if (level !== "unknown" && row?.status === "present") return { ...base, state: "present", memberId: best.memberId, name };
      const prompt = promptFor(state, face, ranked, level === "strong" ? "unsure" : level, limits, now, req.body);
      return { ...base, state: prompt.kind, promptId: prompt.id };
    });

    const checkedIn = [];
    for (const { face, best, name } of toRecord) {
      const photo = await cropPhoto(req.body, face.box);
      if (findSession(session.id)?.open !== true) break;
      const saved = record(session, members.get(best.memberId), "present", "face", best.score, photo);
      checkedIn.push({ memberId: best.memberId, name, rowId: saved.id, photo: Boolean(saved.photo) });
    }

    res.set("Cache-Control", "no-store");
    res.json({ width: result.width, height: result.height, registered: people.length, faces, checkedIn, prompts: visiblePrompts(state, members) });
  }));

  const findPrompt = (req, res) => {
    const prompt = live.get(req.params.id)?.prompts.get(req.params.promptId);
    if (!prompt) res.status(410).json({ error: "That face is no longer in view. Mark them by hand if needed." });
    return prompt;
  };

  app.post("/api/admin/training-sessions/:id/prompts/:promptId/confirm", requireAdmin, safely(async (req, res) => {
    if (!openSession(req, res)) return;
    const prompt = findPrompt(req, res);
    if (!prompt) return;
    const memberId = String(req.body.memberId || "");
    const member = activeMembers().get(memberId);
    if (!member) return res.status(400).json({ error: "Select a valid member." });
    const photo = await cropPhoto(prompt.frame, prompt.box);
    const session = openSession(req, res);
    if (!session) return;
    record(session, member, "present", "face-confirmed", undefined, photo);
    const state = liveFor(session.id);
    state.held.delete(memberId);
    state.prompts.delete(prompt.id);

    // Only with the admin's say-so, and only for someone with consent on file. A saved wrong
    // match would make the member's profile worse every time it happened.
    let learned = false;
    if (req.body.addToProfile === true) {
      const list = readFaces();
      const person = list.find((p) => p.memberId === memberId);
      if (person) {
        person.embeddings = [...person.embeddings, compact(prompt.embedding)].slice(-PROFILE_MAX_VIEWS);
        person.updatedAt = new Date().toISOString();
        writeFaces(list);
        learned = true;
      }
    }
    res.json({ ok: true, learned });
  }));

  app.get("/api/admin/training-sessions/:id/photos/:rowId", requireAdmin, (req, res) => {
    const row = readList("attendance").find((item) => item.id === req.params.rowId && item.sessionId === req.params.id && item.photo);
    if (!row) return res.status(404).json({ error: "No photo for this check-in." });
    res.set("Cache-Control", "private, max-age=3600");
    res.sendFile(photoPath(row), (error) => { if (error && !res.headersSent) res.status(404).json({ error: "No photo for this check-in." }); });
  });

  app.delete("/api/admin/training-sessions/:id/prompts/:promptId", requireAdmin, (req, res) => {
    const prompt = findPrompt(req, res);
    if (!prompt) return;
    // Kept but hidden, so the same face doesn't ask again on the next frame.
    prompt.dismissed = true;
    res.json({ ok: true });
  });

  // ---- Face registration ----
  app.get("/api/admin/faces", requireAdmin, safely(async (_req, res) => {
    const service = await serviceStatus();
    res.set("Cache-Control", "no-store");
    res.json({
      service,
      registered: readFaces().map((p) => ({ memberId: p.memberId, views: p.embeddings.length, registeredAt: p.registeredAt, outdated: Boolean(service.model) && p.model !== service.model })),
    });
  }));

  app.post("/api/admin/faces/captures", requireAdmin, (_req, res) => {
    const id = crypto.randomUUID();
    captures.set(id, { embeddings: [], model: "", createdAt: Date.now() });
    res.status(201).json({ id });
  });

  const findCapture = (req, res) => {
    const capture = captures.get(req.params.id);
    if (!capture) res.status(410).json({ error: "This scan has expired. Please start again." });
    return capture;
  };

  app.post("/api/admin/faces/captures/:id/frames", frameLimit, requireAdmin, frameBody, safely(async (req, res) => {
    if (!hasFrame(req, res)) return;
    if (!findCapture(req, res)) return;
    const result = await analyze(req.body);
    const capture = findCapture(req, res);
    if (!capture) return;
    const reply = (hint, face) => res.json({ accepted: hint === "ok", hint, views: capture.embeddings.length, box: face?.box, width: result.width, height: result.height });

    const faces = result.faces.slice().sort((a, b) => b.box[2] - a.box[2]);
    const [face, next] = faces;
    if (!face) return reply("no_face");
    // People walking past far behind are fine. Two people at the front could mix up the profile.
    if (next && next.box[2] >= face.box[2] * SECOND_FACE_RATIO) return reply("two_faces", face);
    if (face.quality !== "ok") return reply(face.quality, face);
    if (capture.embeddings.length && Math.max(...capture.embeddings.map((saved) => dot(saved, face.embedding))) < limitsFrom(result).same) return reply("different_person", face);
    if (capture.embeddings.length >= CAPTURE_MAX_VIEWS) return reply("enough", face);
    capture.embeddings.push(face.embedding);
    capture.model = result.model;
    capture.limits = limitsFrom(result);
    reply("ok", face);
  }));

  app.post("/api/admin/faces/captures/:id/finish", requireAdmin, (req, res) => {
    const capture = findCapture(req, res);
    if (!capture) return;
    if (capture.embeddings.length < REGISTER_MIN_VIEWS) return res.status(400).json({ error: "Not enough clear views of the face. Please scan again." });
    capture.views = pickDiverse(capture.embeddings, REGISTER_SAVED_VIEWS);
    const members = activeMembers();
    // Compares every saved view, so a match on any head angle counts.
    const ranked = capture.views
      .flatMap((view) => rankPeople(view, peopleFor(capture.model, members)))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    capture.match = best && best.score >= capture.limits.strong ? best : null;
    res.json({ views: capture.views.length, match: capture.match && { memberId: capture.match.memberId, name: members.get(capture.match.memberId).name, score: Number(capture.match.score.toFixed(3)) } });
  });

  app.post("/api/admin/faces/captures/:id/link", requireAdmin, (req, res) => {
    const capture = findCapture(req, res);
    if (!capture) return;
    if (!capture.views) return res.status(400).json({ error: "Finish the scan first." });
    const memberId = String(req.body.memberId || "");
    const member = activeMembers().get(memberId);
    if (!member) return res.status(400).json({ error: "Select a valid member." });
    if (req.body.consent !== true) return res.status(400).json({ error: "Confirm the member agreed to face check-in first." });
    if (capture.match && capture.match.memberId !== memberId && req.body.force !== true) {
      return res.status(409).json({ error: "This face looks like someone already registered." });
    }
    const now = new Date().toISOString();
    const list = readFaces().filter((p) => p.memberId !== memberId);
    list.push({ memberId, model: capture.model, embeddings: capture.views.map(compact), registeredAt: now, updatedAt: now, consentAt: now, consentRecordedBy: adminUser });
    writeFaces(list);
    captures.delete(req.params.id);
    writeAuditLog("face_registered", { memberId, memberName: member.name, views: capture.views.length, forced: req.body.force === true });
    res.json({ ok: true });
  });

  app.delete("/api/admin/faces/captures/:id", requireAdmin, (req, res) => {
    captures.delete(req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/admin/faces/:memberId", requireAdmin, (req, res) => {
    const memberId = String(req.params.memberId);
    if (!removeFaces(memberId)) return res.status(404).json({ error: "No face data for this member." });
    writeAuditLog("face_removed", { memberId, memberName: activeMembers().get(memberId)?.name });
    res.json({ ok: true });
  });

  return { removeFaces };
}

module.exports = { registerAttendance, FRAME_ROUTES };
