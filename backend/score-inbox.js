// Laptop mode: collects score requests sent from the website (they wait in Vercel storage
// while the laptop is off) and adds them to Score requests in the admin. Each one is saved
// here first and only then removed from Vercel, so nothing is lost if a step fails.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PHOTO_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function createInbox({ url, key, uploadDir, readRequests, writeRequests, onAdded, intervalMs = 60000 }) {
  const state = { lastCheckedAt: null, error: "", added: 0 };
  const headers = { "x-inbox-key": key };
  let running = false;

  async function savePhoto(address) {
    const response = await fetch(address);
    if (!response.ok) throw new Error(`photo download failed (${response.status})`);
    const ext = PHOTO_EXT[response.headers.get("content-type")] || ".jpg";
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(uploadDir, name), Buffer.from(await response.arrayBuffer()));
    return `/uploads/${name}`;
  }

  async function check() {
    if (running) return state;
    running = true;
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || `The website said ${response.status}.`);
      for (const remote of json.requests || []) {
        const items = readRequests();
        // Saved before but not yet removed from the website: just remove it now.
        if (!items.some((item) => item.remoteId === remote.id)) {
          const proofs = [];
          for (const address of remote.proofs || []) proofs.push(await savePhoto(address));
          const item = {
            id: crypto.randomUUID(), remoteId: remote.id, name: String(remote.name || "").slice(0, 100),
            games: Number(remote.games) || 0, scores: Number(remote.scores) || 0, proofs,
            status: "pending", createdAt: remote.createdAt || new Date().toISOString(), source: "website",
          };
          writeRequests([item, ...readRequests()]);
          state.added += 1;
          onAdded(item);
        }
        await fetch(`${url}?id=${encodeURIComponent(remote.id)}`, { method: "DELETE", headers });
      }
      state.error = "";
    } catch (error) {
      state.error = error.name === "TimeoutError" ? "The website didn't answer. Check the internet connection." : error.message;
    } finally {
      state.lastCheckedAt = new Date().toISOString();
      running = false;
    }
    return state;
  }

  check();
  setInterval(check, intervalMs).unref();
  return { check, state };
}

module.exports = { createInbox };
