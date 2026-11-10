// Publishes the public website data from the admin on a laptop. After a change, it writes the
// public data (never faces, photos from check-ins, accounts or anything private) into the
// website folder, commits just that, and pushes to GitHub. Vercel then rebuilds the website.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const DATA_PATH = "frontend/public/data/site-data.json";
const UPLOADS_PATH = "frontend/public/uploads";

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) { error.output = String(stderr || stdout).trim(); reject(error); return; }
      resolve(String(stdout).trim());
    });
  });
}

function createPublisher({ repoDir, uploadDir, buildData, delayMs = 15000 }) {
  const state = { status: "idle", lastPublishedAt: null, error: "" };
  let timer = null;
  let running = false;
  let again = false;

  // Waits a little after the last change, so several quick edits go out together.
  function schedule() {
    if (!running) state.status = "waiting";
    clearTimeout(timer);
    timer = setTimeout(publish, delayMs);
  }

  // Member and leader photos uploaded in the admin need to be on the website too.
  function copyPhotos(data) {
    const wanted = new Set();
    const add = (photo) => { if (typeof photo === "string" && photo.startsWith("/uploads/")) wanted.add(path.basename(photo)); };
    (data.members || []).forEach((m) => add(m.photo));
    (data.introductions || []).forEach((i) => add(i.photo));
    const out = path.join(repoDir, UPLOADS_PATH);
    fs.mkdirSync(out, { recursive: true });
    for (const name of wanted) {
      const from = path.join(uploadDir, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(out, name));
    }
    for (const name of fs.readdirSync(out)) if (!wanted.has(name)) fs.rmSync(path.join(out, name), { force: true });
  }

  async function publish() {
    clearTimeout(timer);
    if (running) { again = true; return; }
    running = true;
    state.status = "publishing";
    state.error = "";
    try {
      const data = buildData();
      copyPhotos(data);
      const file = path.join(repoDir, DATA_PATH);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

      // Vercel publishes the main branch, so anything else wouldn't reach the website.
      const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoDir);
      if (branch !== "main") throw new Error(`The project is on the "${branch}" branch. Switch it to "main" to publish.`);
      await git(["add", "--all", "--", DATA_PATH, UPLOADS_PATH], repoDir);
      const changed = await git(["diff", "--cached", "--name-only", "--", DATA_PATH, UPLOADS_PATH], repoDir);
      // Only these paths are committed, so any other work in progress is left alone.
      if (changed) await git(["commit", "-m", "Update website data", "--", DATA_PATH, UPLOADS_PATH], repoDir);
      try {
        await git(["push"], repoDir);
      } catch {
        // Someone pushed code meanwhile. Catch up, then try once more.
        await git(["pull", "--rebase", "--autostash"], repoDir);
        await git(["push"], repoDir);
      }
      state.status = "done";
      state.lastPublishedAt = new Date().toISOString();
    } catch (error) {
      state.status = "error";
      state.error = error.output || error.message;
      console.error("Publishing failed:", state.error);
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }

  return { schedule, publish, state };
}

module.exports = { createPublisher };
