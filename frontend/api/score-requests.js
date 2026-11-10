// Score requests from the website, kept in Vercel Blob storage until the admin on the laptop
// collects them. Members send here; only the admin, with SCORE_INBOX_KEY, can read or delete.
//
// Setup in Vercel: Storage → create a Blob store and connect it to this project (that adds
// BLOB_READ_WRITE_TOKEN), and add SCORE_INBOX_KEY under Settings → Environment Variables.
import crypto from "node:crypto";
import { del, list, put } from "@vercel/blob";

const PREFIX = "score-requests/";
const MAX_PHOTOS = 4;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // Vercel functions accept about 4.5 MB per request.
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PIN_AVERAGE = 300; // A perfect game. Anything above is a typo.

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function isAdmin(request) {
  const key = process.env.SCORE_INBOX_KEY || "";
  const given = request.headers.get("x-inbox-key") || "";
  return key.length >= 24 && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

const ready = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const notReady = () => reply({ error: "Sending scores isn't set up yet. Please message the team instead." }, 503);

export async function POST(request) {
  if (!ready()) return notReady();
  let form;
  try { form = await request.formData(); } catch { return reply({ error: "That didn't send. Please try again." }, 400); }
  // A hidden field people never see. Bots fill it in.
  if (String(form.get("website") || "")) return reply({ ok: true, message: "Sent." }, 201);

  const name = String(form.get("name") || "").trim().slice(0, 100);
  const games = Number(form.get("games"));
  const scores = Number(form.get("scores"));
  if (!name || !Number.isInteger(games) || games < 1 || games > 100 || !Number.isInteger(scores) || scores < 0 || scores > games * MAX_PIN_AVERAGE) {
    return reply({ error: "Enter your name, at least 1 game, and a total that's possible for those games." }, 400);
  }
  const photos = form.getAll("proofs").filter((file) => file && typeof file === "object" && file.size > 0);
  if (photos.length > MAX_PHOTOS) return reply({ error: `Please send no more than ${MAX_PHOTOS} photos.` }, 400);
  if (photos.some((file) => !PHOTO_TYPES[file.type])) return reply({ error: "Photos must be JPG, PNG or WEBP." }, 400);
  if (photos.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return reply({ error: "Those photos are too big together. Try fewer." }, 400);

  const id = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  try {
    // Random names, so a photo's address can't be guessed.
    const proofs = [];
    for (const [i, file] of photos.entries()) {
      const blob = await put(`${PREFIX}${id}/proof-${i}.${PHOTO_TYPES[file.type]}`, file, { access: "public", contentType: file.type, addRandomSuffix: true });
      proofs.push(blob.url);
    }
    const item = { id, name, games, scores, proofs, createdAt: new Date().toISOString() };
    await put(`${PREFIX}${id}/request.json`, JSON.stringify(item), { access: "public", contentType: "application/json", addRandomSuffix: true });
  } catch (error) {
    console.error("Saving a score request failed:", error);
    return reply({ error: "That didn't send. Please try again in a minute." }, 502);
  }
  return reply({ ok: true, message: "Sent! An admin will review it soon." }, 201);
}

// The admin collects waiting requests.
export async function GET(request) {
  if (!ready()) return notReady();
  if (!isAdmin(request)) return reply({ error: "Not allowed." }, 401);
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const files = blobs.filter((blob) => /\/request[^/]*\.json$/.test(blob.pathname));
  const requests = [];
  for (const file of files) {
    try { requests.push(await (await fetch(file.url, { cache: "no-store" })).json()); } catch { /* skip one that can't be read */ }
  }
  return reply({ requests });
}

// Once the admin has a request saved on the laptop, it's removed here.
export async function DELETE(request) {
  if (!ready()) return notReady();
  if (!isAdmin(request)) return reply({ error: "Not allowed." }, 401);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^\d+-[a-f0-9]{12}$/.test(id)) return reply({ error: "Unknown request." }, 400);
  const { blobs } = await list({ prefix: `${PREFIX}${id}/` });
  if (blobs.length) await del(blobs.map((blob) => blob.url));
  return reply({ ok: true });
}
