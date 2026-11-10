#!/usr/bin/env node
// Runs after `vite build`. Writes a copy of the app shell for every known address,
// each with its own title and description, so deep links and social previews work
// on any static host. Old .html addresses get a copy too; the app redirects them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, SITE_URL, memberMeta } from "../src/data/routes.js";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
// The published data has members added in the admin since the seed was written.
const published = join(here, "../public/data/site-data.json");
const seed = JSON.parse(readFileSync(existsSync(published) ? published : join(here, "../../backend/seed/site-data.json"), "utf8"));
const shell = readFileSync(join(dist, "index.html"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function page(path, { title, description }) {
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  return shell
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`);
}
function write(file, html) {
  const target = join(dist, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

let count = 0;
for (const [path, meta] of Object.entries(PAGES)) {
  const html = page(path, meta);
  if (path === "/") { write("index.html", html); count += 1; continue; }
  write(`${path.slice(1)}/index.html`, html);
  if (path !== "/submit" && path !== "/login" && path !== "/portal") write(`${path.slice(1)}.html`, html);
  count += 1;
}
write("member.html", page("/team", PAGES["/team"]));
write("member-portal.html", page("/portal", PAGES["/portal"]));
for (const member of seed.members) {
  const html = page(`/members/${member.slug}`, memberMeta(member.name, member.team));
  write(`members/${member.slug}/index.html`, html);
  write(`members/${member.slug}.html`, html);
  count += 1;
}
// Unknown addresses (and members added later) still load the app.
write("404.html", page("/", PAGES["/"]));
console.log(`Prerendered ${count} addresses into dist/`);
