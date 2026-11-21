// Tournaments: lanes filled from a training session's present members, scores per game, and a
// ranking. Every route here is for admins only. Lanes and scores are saved exactly as the admin
// left them, so reloading never reshuffles anyone.
const crypto = require("crypto");

const MAX_LANES = 40;
const MAX_PER_LANE = 10;
const MAX_GAMES = 10;
const MAX_SCORE = 300;

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const whole = (value, min, max) => {
  const n = Math.floor(Number(value));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// Same rules as the admin page: highest average first, more pins wins a tie.
function stats(scores, gamesPerBowler) {
  const played = (scores || []).slice(0, gamesPerBowler).filter((s) => Number.isInteger(s));
  const pins = played.reduce((sum, s) => sum + s, 0);
  return { games: played.length, pins, average: played.length ? pins / played.length : 0 };
}

function rank(tournament) {
  return tournament.bowlers
    .map((b) => ({ memberId: b.memberId, name: b.name, team: b.team, ...stats(tournament.scores[b.memberId], tournament.gamesPerBowler) }))
    .filter((row) => row.games > 0)
    .sort((a, b) => b.average - a.average || b.pins - a.pins || a.name.localeCompare(b.name))
    .map((row, i) => ({ place: i + 1, ...row, average: Number(row.average.toFixed(1)) }));
}

const summary = (t) => {
  const top = t.ranking?.[0];
  return {
    id: t.id, name: t.name, date: t.date, location: t.location, sessionId: t.sessionId, sessionTitle: t.sessionTitle,
    laneCount: t.laneCount, perLane: t.perLane, gamesPerBowler: t.gamesPerBowler,
    bowlerCount: t.bowlers.length, generated: t.lanes.length > 0,
    top: top ? { name: top.name, team: top.team, average: top.average } : null,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
  };
};

function registerTournaments(app, { requireAdmin, readList, writeList, readData, writeAuditLog }) {
  const findSession = (id) => readList("training").find((s) => s.id === id);

  // Present members of a session, with the team and photo they have right now.
  function presentBowlers(sessionId) {
    const members = new Map(readData().members.map((m) => [String(m.id), m]));
    const seen = new Set();
    return readList("attendance")
      .filter((row) => row.sessionId === sessionId && row.status === "present")
      .filter((row) => !seen.has(String(row.memberId)) && seen.add(String(row.memberId)))
      .map((row) => {
        const m = members.get(String(row.memberId));
        return { memberId: String(row.memberId), name: m?.name || row.memberName || "Member", team: m?.team || "", photo: m?.photo || "" };
      });
  }

  // Settings shared by create and save. Returns an error message or the clean values.
  function readSettings(body) {
    const name = text(body.name, 120);
    const date = text(body.date, 30);
    const location = text(body.location, 200);
    const laneCount = whole(body.laneCount, 1, MAX_LANES);
    const perLane = whole(body.perLane, 1, MAX_PER_LANE);
    const gamesPerBowler = whole(body.gamesPerBowler, 1, MAX_GAMES);
    const sessionId = text(body.sessionId, 80);
    if (!name || !date) return { error: "Enter a tournament name and a date." };
    if (!laneCount) return { error: `Lanes must be between 1 and ${MAX_LANES}.` };
    if (!perLane) return { error: `Bowlers per lane must be between 1 and ${MAX_PER_LANE}.` };
    if (!gamesPerBowler) return { error: `Games per bowler must be between 1 and ${MAX_GAMES}.` };
    if (!sessionId) return { error: "Select a session." };
    return { values: { name, date, location, laneCount, perLane, gamesPerBowler, sessionId } };
  }

  // Lanes come in as [{ slots: [memberId | null], edited }]. Every bowler may appear once;
  // anyone not in a lane ends up in the "not assigned" list, so nobody is ever lost.
  function readLanes(rawLanes, settings, bowlerIds) {
    const used = new Set();
    const take = (id) => {
      const key = id == null || id === "" ? null : String(id);
      if (!key || !bowlerIds.has(key) || used.has(key)) return null;
      used.add(key);
      return key;
    };
    if (!Array.isArray(rawLanes) || !rawLanes.length) return { lanes: [], unassigned: [...bowlerIds] };
    const lanes = Array.from({ length: settings.laneCount }, (_, i) => {
      const raw = rawLanes[i] || {};
      const slots = Array.from({ length: settings.perLane }, (_, j) => take(Array.isArray(raw.slots) ? raw.slots[j] : null));
      return { name: `Lane ${i + 1}`, slots, edited: raw.edited === true };
    });
    return { lanes, unassigned: [...bowlerIds].filter((id) => !used.has(id)) };
  }

  function readScores(raw, settings, bowlerIds) {
    const scores = {};
    for (const id of bowlerIds) {
      const list = Array.isArray(raw?.[id]) ? raw[id] : [];
      scores[id] = Array.from({ length: settings.gamesPerBowler }, (_, g) => {
        const value = list[g];
        if (value === null || value === undefined || value === "") return null;
        const n = whole(value, 0, MAX_SCORE);
        if (n === null) throw Object.assign(new Error(`Scores must be whole numbers from 0 to ${MAX_SCORE}.`), { status: 400 });
        return n;
      });
    }
    return scores;
  }

  const send = (res, t) => { res.set("Cache-Control", "no-store"); res.json({ tournament: t }); };
  const fail = (res, error) => res.status(error.status || 500).json({ error: error.status ? error.message : "Couldn't save the tournament." });

  app.get("/api/admin/tournaments", requireAdmin, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ tournaments: readList("tournaments").map(summary) });
  });

  app.post("/api/admin/tournaments", requireAdmin, (req, res) => {
    const { error, values } = readSettings(req.body || {});
    if (error) return res.status(400).json({ error });
    const session = findSession(values.sessionId);
    if (!session) return res.status(400).json({ error: "That session no longer exists." });
    const bowlers = presentBowlers(session.id);
    if (!bowlers.length) return res.status(400).json({ error: "Nobody is marked present in that session yet." });
    const now = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(), ...values, sessionTitle: session.title, bowlers, lanes: [], unassigned: bowlers.map((b) => b.memberId),
      scores: Object.fromEntries(bowlers.map((b) => [b.memberId, Array(values.gamesPerBowler).fill(null)])),
      ranking: [], createdAt: now, updatedAt: now,
    };
    const list = readList("tournaments");
    list.unshift(item);
    writeList("tournaments", list);
    writeAuditLog("tournament_created", { tournamentId: item.id, name: item.name, date: item.date, bowlers: bowlers.length });
    res.status(201).json({ ok: true, tournament: item });
  });

  app.get("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
    const item = readList("tournaments").find((t) => t.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Tournament not found." });
    send(res, item);
  });

  // Saves everything at once: settings, lanes, scores, and the ranking they produce.
  app.put("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
    try {
      const list = readList("tournaments");
      const item = list.find((t) => t.id === req.params.id);
      if (!item) return res.status(404).json({ error: "Tournament not found." });
      const { error, values } = readSettings(req.body || {});
      if (error) return res.status(400).json({ error });

      // A different session brings its own present members. Lanes keep anyone still there.
      let bowlers = item.bowlers;
      let sessionTitle = item.sessionTitle;
      if (values.sessionId !== item.sessionId) {
        const session = findSession(values.sessionId);
        if (!session) return res.status(400).json({ error: "That session no longer exists." });
        bowlers = presentBowlers(session.id);
        sessionTitle = session.title;
        if (!bowlers.length) return res.status(400).json({ error: "Nobody is marked present in that session yet." });
      }
      const ids = new Set(bowlers.map((b) => b.memberId));
      const { lanes, unassigned } = readLanes(req.body.lanes, values, ids);
      const scores = readScores(req.body.scores, values, ids);
      Object.assign(item, values, { sessionTitle, bowlers, lanes, unassigned, scores, updatedAt: new Date().toISOString() });
      item.ranking = rank(item);
      writeList("tournaments", list);
      writeAuditLog("tournament_updated", { tournamentId: item.id, name: item.name, top: item.ranking[0]?.name || "" });
      res.json({ ok: true, tournament: item });
    } catch (error) { fail(res, error); }
  });

  app.delete("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
    const list = readList("tournaments");
    const item = list.find((t) => t.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Tournament not found." });
    writeList("tournaments", list.filter((t) => t.id !== item.id));
    writeAuditLog("tournament_deleted", { tournamentId: item.id, name: item.name });
    res.json({ ok: true });
  });
}

module.exports = { registerTournaments, rank, stats };
