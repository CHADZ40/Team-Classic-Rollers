// Talks to the backend and holds the small helpers shared across pages.
// Signing in sets a cookie the browser keeps for 30 days. Scripts can't read it, so it
// can't be stolen from the page. Every request just sends it along.
export async function api(url, options = {}) {
  const opts = { ...options, credentials: "include", headers: { ...(options.headers || {}) } };
  if (opts.body && !(opts.body instanceof FormData) && !(opts.body instanceof Blob) && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const response = await fetch(url, opts);
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Please sign in again.");
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "That didn't work. Please try again.");
  return json;
}

// True when this browser is still signed in. Also renews the sign-in.
export async function hasSession() {
  try {
    const response = await fetch("/api/admin/session", { credentials: "include" });
    return response.ok;
  } catch {
    return false;
  }
}

export const memberUrl = (id) => `/api/admin/members/${encodeURIComponent(id)}`;
export const number = (value) => Number(value || 0).toLocaleString("en-US");
export const niceName = (name) => String(name || "").toLowerCase().replace(/(^|[\s.-])\S/g, (c) => c.toUpperCase());
export const average = (m) => (Number(m.games) > 0 ? Number(m.scores) / Number(m.games) : 0);
export const plural = (n, word) => `${number(n)} ${word}${Number(n) === 1 ? "" : "s"}`;

// Stored photo paths must stay as they are. The small copies sit beside them.
const absolute = (path) => { const p = String(path || ""); return p.startsWith("/") ? p : `/${p}`; };
export const fullPhoto = (path) => (path ? absolute(path) : "/assets/member-placeholder.svg");
export const thumbPhoto = (path) => fullPhoto(path).replace(/assets\/members\/([^/]+)\.png$/, "assets/members/thumbs/$1.webp");

// Phone photos are often far bigger than the website needs, so shrink them before
// uploading. That keeps the home page fast and gets them under the 5 MB limit.
const MAX_PHOTO_SIDE = 1400;
const SMALL_PHOTO_BYTES = 800 * 1024;
export async function shrinkPhoto(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("That image couldn't be read. Use a PNG, JPG or WEBP."); }
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_PHOTO_BYTES) { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#0a0e1c"; // JPEG has no transparency, so match the site's photo frame.
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, "image/jpeg", 0.86); });
  if (!blob) throw new Error("That image couldn't be prepared. Try a different one.");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

const cleanName = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function suggestedMember(request, members) {
  if (request.memberId) return members.find((m) => m.id === request.memberId) || null;
  const matches = members.filter((m) => cleanName(m.name) === cleanName(request.name));
  return matches.length === 1 ? matches[0] : null;
}

export const ACTION_LABELS = {
  game_request_submitted: "Score request sent", game_request_approved: "Score request approved", game_request_rejected: "Score request rejected",
  score_added: "Pins added", score_removed: "Pins removed", games_adjusted: "Games changed", member_stats_set: "Stats corrected", member_stats_reset: "Stats reset",
  member_added: "Player added", member_removed: "Player removed", member_updated: "Player updated", introduction_added: "Leader added", introduction_updated: "Leader updated", introduction_removed: "Leader removed", introductions_reordered: "Leaders reordered", website_content_updated: "Website text updated",
  member_notification_created: "Message sent to members", training_session_created: "Session opened", training_session_opened: "Session reopened", training_session_closed: "Session closed", training_session_deleted: "Session deleted",
  training_attendance_recorded: "Attendance marked", training_attendance_undone: "Attendance undone", face_registered: "Face registered", face_removed: "Face data deleted",
  news_published: "News published", news_updated: "News updated", news_deleted: "News deleted",
};
export const actionLabel = (action) => ACTION_LABELS[action] || String(action || "").replaceAll("_", " ");
