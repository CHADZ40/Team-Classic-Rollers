require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "site-data.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const LOG_FILE = process.env.LOG_FILE || path.join(path.dirname(DATA_FILE), "logs.json");
const REQUESTS_FILE = process.env.REQUESTS_FILE || path.join(path.dirname(DATA_FILE), "game-requests.json");
const PUBLIC_SITE_ORIGIN = (process.env.PUBLIC_SITE_ORIGIN || "https://teamclassicrollers.club,https://www.teamclassicrollers.club").replace(/\/$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error("Set ADMIN_PASSWORD in .env to a strong password of at least 12 characters.");
  process.exit(1);
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error("Set SESSION_SECRET in .env to a random secret of at least 32 characters.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  const initial = path.join(__dirname, "..", "site-data.json");
  if (!fs.existsSync(initial)) throw new Error("Initial site-data.json not found");
  fs.copyFileSync(initial, DATA_FILE);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = (process.env.PUBLIC_SITE_ORIGIN || "").split(",").map(v => v.trim().replace(/\/$/, "")).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api", limiter);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Upload a PNG, JPG, or WEBP image."), ok);
  }
});

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeData(data) {
  data.updatedAt = new Date().toISOString();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function writeAuditLog(action, details = {}) {
  try {
    const logs = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, "utf8")) : [];
    logs.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: ADMIN_USER, action, ...details });
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const temp = `${LOG_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(logs.slice(0, 5000), null, 2));
    fs.renameSync(temp, LOG_FILE);
  } catch (error) { console.error("Failed to write audit log:", error.message); }
}
function cleanMember(m) {
  return {
    id: String(m.id), slug: String(m.slug || m.id), name: String(m.name || "").trim(),
    team: m.team, photo: m.photo || "", games: Math.max(0, Number(m.games) || 0),
    scores: Math.max(0, Number(m.scores) || 0), goal: Number(m.goal) || goalForTeam(m.team),
    sortOrder: Number(m.sortOrder) || 9999, active: m.active !== false
  };
}
function goalForTeam(team) {
  return team === "Team A" ? 200 : team === "Team B" ? 175 : 150;
}
function publicData() {
  const data = readData();
  data.members = data.members.filter(m => m.active !== false).map(m => ({...cleanMember(m), bio: String(m.bio||""), achievements: Array.isArray(m.achievements)?m.achievements:[]}))
    .sort((a,b) => teamIndex(a.team)-teamIndex(b.team) || a.sortOrder-b.sortOrder);
  data.news = Array.isArray(data.news) ? data.news.filter(n => n.published !== false).sort((a,b)=>String(b.date||b.createdAt||"").localeCompare(String(a.date||a.createdAt||""))) : [];
  return data;
}
function teamIndex(team) { return ({ "Team A": 0, "Team B": 1, "Team C": 2 })[team] ?? 3; }

function makeToken(username) {
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: Math.floor(Date.now()/1000)+TOKEN_TTL_SECONDS })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return body.sub === ADMIN_USER && body.exp > Math.floor(Date.now()/1000);
  } catch { return false; }
}
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : req.cookies?.tcr_admin;
  if (!verifyToken(token)) return res.status(401).json({ error: "Please log in again." });
  next();
}

// Minimal cookie parser for the signed admin token.
app.use((req, _res, next) => {
  req.cookies = {};
  (req.headers.cookie || "").split(";").forEach(pair => {
    const i = pair.indexOf("=");
    if (i > -1) req.cookies[pair.slice(0,i).trim()] = decodeURIComponent(pair.slice(i+1).trim());
  });
  next();
});

app.get("/api/health", (_req,res) => res.json({ ok: true, version: "0.1.4" }));
function readRequests() {
  try { return JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
function writeRequests(items) {
  fs.mkdirSync(path.dirname(REQUESTS_FILE), {recursive:true});
  const tmp = `${REQUESTS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, REQUESTS_FILE);
}
app.post("/api/public/game-requests", upload.array("proofs", 6), (req,res) => {
  const name = String(req.body.name || "").trim().slice(0,100);
  const games = Number(req.body.games);
  const scores = Number(req.body.scores);
  if (!name || !Number.isSafeInteger(games) || games < 1 || games > 10000 || !Number.isSafeInteger(scores) || scores < 0 || scores > 1000000) {
    (req.files || []).forEach(f => fs.existsSync(f.path) && fs.unlinkSync(f.path));
    return res.status(400).json({error:"Enter your name, at least 1 game, and a valid total score."});
  }
  const item = {id:crypto.randomUUID(),name,games,scores,status:"pending",proofs:(req.files||[]).map(f=>`/uploads/${path.basename(f.path)}`),createdAt:new Date().toISOString()};
  const items = readRequests(); items.unshift(item); writeRequests(items);
  writeAuditLog("game_request_submitted", {requestId:item.id, requester:item.name, games:item.games, scores:item.scores});
  res.status(201).json({ok:true,message:"Request submitted. The team admin will review it."});
});
app.get("/api/admin/game-requests", requireAdmin, (_req,res) => res.json({requests:readRequests()}));
app.post("/api/admin/game-requests/:id/review", requireAdmin, (req,res) => {
  const requests = readRequests();
  const item = requests.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({error:"Request not found."});
  if (item.status !== "pending") return res.status(409).json({error:"This request has already been reviewed."});
  const decision = String(req.body.decision || "");
  const reason = String(req.body.reason || "").trim().slice(0,300);
  if (decision === "reject") {
    item.status = "rejected"; item.reviewedAt = new Date().toISOString(); item.reviewReason = reason;
    writeRequests(requests); writeAuditLog("game_request_rejected", {requestId:item.id, requester:item.name, reason});
    return res.json({ok:true,request:item});
  }
  if (decision !== "approve") return res.status(400).json({error:"Choose approve or reject."});
  const memberId = String(req.body.memberId || "");
  const data = readData();
  const member = data.members.find(m => String(m.id) === memberId && m.active !== false);
  if (!member) return res.status(400).json({error:"Select an active member to receive these statistics."});
  const previousGames = Number(member.games)||0, previousScores = Number(member.scores)||0;
  member.games = previousGames + item.games;
  member.scores = previousScores + item.scores;
  writeData(data);
  item.status = "approved"; item.memberId = member.id; item.memberName = member.name; item.reviewedAt = new Date().toISOString(); item.reviewReason = reason;
  writeRequests(requests);
  writeAuditLog("game_request_approved", {requestId:item.id, requester:item.name, memberId:member.id, memberName:member.name, team:member.team, gamesAdded:item.games, previousGames, newGames:member.games, scoresAdded:item.scores, previousScores, newScores:member.scores, reason});
  res.json({ok:true,request:item,member:cleanMember(member)});
});
app.get("/api/public/site-data", (_req,res) => {
  res.set("Cache-Control", "no-store");
  res.json(publicData());
});
app.post("/api/admin/login", async (req,res) => {
  const { username, password } = req.body || {};
  const sameUser = typeof username === "string" && username === ADMIN_USER;
  const valid = sameUser && typeof password === "string" &&
    (await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH || await bcrypt.hash(ADMIN_PASSWORD, 10)));
  if (!valid) return res.status(401).json({ error: "Incorrect username or password." });
  const token = makeToken(ADMIN_USER);
  res.cookie("tcr_admin", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Strict", maxAge: TOKEN_TTL_SECONDS * 1000, path: "/" });
  res.json({ ok: true, username: ADMIN_USER, token });
});
app.post("/api/admin/logout", (_req,res) => {
  res.clearCookie("tcr_admin", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/admin/site-data", requireAdmin, (_req,res) => res.json(readData()));
app.get("/api/public/member-history/:id", (req,res) => {
  try {
    const logs = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE,"utf8")) : [];
    const history = logs.filter(l => String(l.memberId) === String(req.params.id) && ["score_added","score_removed","member_stats_set","game_request_approved"].includes(l.action)).map(l=>({timestamp:l.timestamp,action:l.action,previousScores:l.previousValue ?? l.previousScores,newScores:l.newValue ?? l.newScores ?? l.scores,amount:l.amount ?? l.scoresAdded,gamesAdded:l.gamesAdded,reason:l.reason||l.details||""}));
    res.set("Cache-Control","no-store"); res.json({history});
  } catch { res.status(500).json({error:"Unable to load score history."}); }
});
app.post("/api/admin/news", requireAdmin, (req,res) => {
  const title=String(req.body.title||"").trim().slice(0,160), body=String(req.body.body||"").trim().slice(0,5000), type=String(req.body.type||"Announcement").slice(0,40), date=String(req.body.date||new Date().toISOString().slice(0,10)).slice(0,10);
  if(!title||!body) return res.status(400).json({error:"Enter a title and update details."});
  const data=readData(); data.news=Array.isArray(data.news)?data.news:[];
  const item={id:crypto.randomUUID(),title,body,type,date,published:req.body.published!==false,createdAt:new Date().toISOString()}; data.news.unshift(item); writeData(data); writeAuditLog("news_published",{details:`${type}: ${title}`}); res.status(201).json({ok:true,item});
});
app.patch("/api/admin/news/:id", requireAdmin, (req,res) => {
  const data=readData(); data.news=Array.isArray(data.news)?data.news:[]; const item=data.news.find(n=>n.id===req.params.id); if(!item)return res.status(404).json({error:"Update not found."});
  for(const key of ["title","body","type","date"]) if(typeof req.body[key]==="string") item[key]=req.body[key].trim().slice(0,key==="body"?5000:160);
  if(req.body.published!==undefined)item.published=!!req.body.published; writeData(data); writeAuditLog("news_updated",{details:`Updated: ${item.title}`}); res.json({ok:true,item});
});
app.delete("/api/admin/news/:id", requireAdmin, (req,res) => {const data=readData();data.news=Array.isArray(data.news)?data.news:[];const item=data.news.find(n=>n.id===req.params.id);if(!item)return res.status(404).json({error:"Update not found."});data.news=data.news.filter(n=>n.id!==req.params.id);writeData(data);writeAuditLog("news_deleted",{details:`Deleted: ${item.title}`});res.json({ok:true});});
app.get("/api/admin/logs", requireAdmin, (_req,res) => {
  try {
    const logs = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, "utf8")) : [];
    res.set("Cache-Control", "no-store");
    res.json({ logs: logs.slice(0, 1000) });
  } catch (error) { res.status(500).json({ error: "Unable to read audit logs." }); }
});
app.get("/logs", (_req,res) => res.sendFile(path.join(__dirname, "public", "logs.html")));
app.get("/request", (_req,res) => res.sendFile(path.join(__dirname, "public", "request.html")));

app.patch("/api/admin/content", requireAdmin, (req,res) => {
  const allowed = ["homeTitle","homeDescription","aboutTitle","aboutDescription","aboutHeading","aboutBody","aboutBody2"];
  const data = readData();
  for (const key of allowed) {
    if (typeof req.body[key] === "string") data.content[key] = req.body[key].trim().slice(0, 5000);
  }
  writeData(data);
  writeAuditLog("website_content_updated", { details: "Updated website page content" });
  res.json({ ok: true, content: data.content });
});

app.post("/api/admin/members", requireAdmin, upload.single("photo"), (req,res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const team = req.body.team;
  if (!name || !["Team A","Team B","Team C"].includes(team)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Enter a member name and choose Team A, Team B, or Team C." });
  }
  const data = readData();
  const id = `${name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${crypto.randomBytes(3).toString("hex")}`;
  const teamMembers = data.members.filter(m => m.team === team);
  const photo = req.file ? `/uploads/${path.basename(req.file.path)}` : "/assets/member-placeholder.svg";
  const member = cleanMember({ id, slug:id, name, team, photo, games:0, scores:0, goal:goalForTeam(team), sortOrder: teamMembers.length+1, active:true });
  data.members.push(member);
  writeData(data);
  writeAuditLog("member_added", { memberId: member.id, memberName: member.name, team: member.team });
  res.status(201).json({ ok:true, member });
});

app.patch("/api/admin/members/:id", requireAdmin, upload.single("photo"), (req,res) => {
  const data = readData();
  const member = data.members.find(m => m.id === req.params.id);
  if (!member) { if(req.file) fs.unlinkSync(req.file.path); return res.status(404).json({error:"Member not found."}); }
  if (typeof req.body.name === "string" && req.body.name.trim()) member.name = req.body.name.trim().slice(0,100);
  if (typeof req.body.bio === "string") member.bio = req.body.bio.trim().slice(0,2000);
  if (typeof req.body.achievements === "string") member.achievements = req.body.achievements.split("\n").map(x=>x.trim()).filter(Boolean).slice(0,30);
  if (Array.isArray(req.body.achievements)) member.achievements = req.body.achievements.map(x=>String(x).trim()).filter(Boolean).slice(0,30);
  if (["Team A","Team B","Team C"].includes(req.body.team)) {
    member.team = req.body.team;
    member.goal = goalForTeam(member.team);
  }
  if (req.body.games !== undefined) member.games = Math.max(0, Math.floor(Number(req.body.games) || 0));
  const previousGames = Number(member.games) || 0;
  const previousScores = Number(member.scores) || 0;
  if (req.body.scores !== undefined) member.scores = Math.max(0, Math.floor(Number(req.body.scores) || 0));
  if (req.body.active !== undefined) member.active = req.body.active === "true" || req.body.active === true;
  if (req.body.sortOrder !== undefined) member.sortOrder = Math.max(1, Math.floor(Number(req.body.sortOrder) || 1));
  if (req.file) member.photo = `/uploads/${path.basename(req.file.path)}`;
  Object.assign(member, cleanMember(member));
  writeData(data);
  if (previousScores !== (Number(member.scores) || 0) || previousGames !== (Number(member.games) || 0)) writeAuditLog("member_stats_set", { memberId: member.id, memberName: member.name, team: member.team, previousGames, games: member.games, previousScores, scores: member.scores });
  else writeAuditLog("member_updated", { memberId: member.id, memberName: member.name, team: member.team });
  res.json({ ok:true, member });
});

app.post("/api/admin/members/:id/adjust", requireAdmin, (req,res) => {
  const data = readData();
  const member = data.members.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({error:"Member not found."});
  const field = req.body.field;
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason||"").trim().slice(0,300);
  if (!["games","scores"].includes(field) || !Number.isInteger(amount) || Math.abs(amount) > 1000000) {
    return res.status(400).json({error:"Invalid score adjustment."});
  }
  const previousValue = Number(member[field]) || 0;
  member[field] = Math.max(0, previousValue + amount);
  writeData(data);
  writeAuditLog(field === "scores" ? (amount >= 0 ? "score_added" : "score_removed") : "games_adjusted", { memberId: member.id, memberName: member.name, team: member.team, field, amount, previousValue, newValue: member[field], reason });
  res.json({ok:true, member:cleanMember(member)});
});


app.post("/api/admin/members/:id/reset-stats", requireAdmin, (req,res) => {
  const data = readData(); const member = data.members.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({error:"Member not found."});
  const previousGames = Number(member.games)||0, previousScores = Number(member.scores)||0;
  member.games = 0; member.scores = 0;
  writeData(data); writeAuditLog("member_stats_reset", {memberId:member.id,memberName:member.name,team:member.team,previousGames,previousScores,newGames:0,newScores:0,details:"Member statistics reset to zero"});
  res.json({ok:true,member:cleanMember(member)});
});
app.post("/api/admin/reset-all-scores", requireAdmin, (_req,res) => {
  const data=readData(); const affected=[];
  data.members.forEach(m=>{if(m.active!==false){affected.push({memberId:m.id,memberName:m.name,team:m.team,previousGames:Number(m.games)||0,previousScores:Number(m.scores)||0});m.games=0;m.scores=0;}});
  writeData(data); writeAuditLog("all_member_stats_reset",{details:`Reset games and scores for ${affected.length} active members`,affectedCount:affected.length});
  res.json({ok:true,affectedCount:affected.length});
});
app.post("/api/admin/reset-logs", requireAdmin, (_req,res) => {
  try { const count=fs.existsSync(LOG_FILE)?JSON.parse(fs.readFileSync(LOG_FILE,"utf8")).length:0; fs.mkdirSync(path.dirname(LOG_FILE),{recursive:true}); fs.writeFileSync(LOG_FILE,"[]"); res.json({ok:true,deletedCount:count}); }
  catch(error){res.status(500).json({error:"Unable to reset activity logs."});}
});

app.delete("/api/admin/members/:id", requireAdmin, (req,res) => {
  const data = readData();
  const member = data.members.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({error:"Member not found."});
  member.active = false;
  writeData(data);
  writeAuditLog("member_removed", { memberId: member.id, memberName: member.name, team: member.team });
  res.json({ok:true});
});


// TCR v0.1.4 member system: persistent account, verification, profile, attendance and notification APIs.
const MEMBER_DIR = path.join(path.dirname(DATA_FILE), '');
const MEMBER_FILES = {
 accounts: path.join(MEMBER_DIR, 'member-accounts.json'),
 tokens: path.join(MEMBER_DIR, 'verification-tokens.json'),
 notifications: path.join(MEMBER_DIR, 'member-notifications.json'),
 sessions: path.join(MEMBER_DIR, 'member-sessions.json'),
 training: path.join(MEMBER_DIR, 'training-sessions.json'),
 attendance: path.join(MEMBER_DIR, 'training-attendance.json'),
 changes: path.join(MEMBER_DIR, 'member-profile-changes.json'),
 audit: path.join(MEMBER_DIR, 'member-audit-log.json'),
 events: path.join(MEMBER_DIR, 'score-request-events.json'),
 browserTickets: path.join(MEMBER_DIR, 'browser-login-tickets.json')
};
function readList(key) { try { const v=JSON.parse(fs.readFileSync(MEMBER_FILES[key],'utf8')); return Array.isArray(v)?v:[]; } catch(e) { if(e.code==='ENOENT') return []; throw e; } }
function writeList(key, list) { const f=MEMBER_FILES[key], tmp=f+'.tmp'; fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(tmp,JSON.stringify(list,null,2),{mode:0o600}); fs.renameSync(tmp,f); }
for (const key of Object.keys(MEMBER_FILES)) if (!fs.existsSync(MEMBER_FILES[key])) writeList(key,[]);
const PORTAL_ORIGIN = (process.env.MEMBER_PORTAL_ORIGIN || 'https://admin.teamclassicrollers.club').replace(/\/$/,'');
const BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME||'').replace(/^@/,'');
const INTERNAL_SECRET = process.env.TELEGRAM_INTERNAL_SECRET || '';
function memberAuth(req,res,next){ const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('tcr_member=')); const raw=(req.headers.authorization||'').replace(/^Bearer /,'') || (cookie?decodeURIComponent(cookie.slice('tcr_member='.length)):''); if(!raw) return res.status(401).json({error:'Please verify your Telegram account first.'}); const hash=crypto.createHash('sha256').update(raw).digest('hex'); const sess=readList('sessions').find(x=>x.hash===hash&&x.expiresAt>Date.now()); if(!sess) return res.status(401).json({error:'Member session expired. Verify again.'}); const account=readList('accounts').find(x=>String(x.telegramId)===String(sess.telegramId)&&x.memberId===sess.memberId); if(!account) return res.status(401).json({error:'Member account is not linked.'}); req.memberAccount=account; req.memberSession=sess; next(); }
function safeAccount(a){return {telegramId:a.telegramId,telegramUsername:a.telegramUsername||'',memberId:a.memberId,verifiedAt:a.verifiedAt||null,profile:a.profile||{},notificationsEnabled:a.notificationsEnabled!==false};}
app.get('/api/health', (_req,res)=>res.json({ok:true,version:'0.1.4'}));
app.get('/api/admin/member-accounts',requireAdmin,(_req,res)=>{const data=readData();const accounts=readList('accounts').map(a=>({...safeAccount(a),member:data.members.find(m=>String(m.id)===String(a.memberId))?cleanMember(data.members.find(m=>String(m.id)===String(a.memberId))):null}));res.json({accounts,members:data.members.filter(m=>m.active!==false).map(cleanMember)});});
app.post('/api/admin/member-accounts/verification',requireAdmin,async(req,res)=>{try{const memberId=String(req.body.memberId||'');const member=readData().members.find(m=>String(m.id)===memberId&&m.active!==false);if(!member)return res.status(400).json({error:'Select a valid active member.'});if(!BOT_USERNAME)return res.status(500).json({error:'Set TELEGRAM_BOT_USERNAME in backend .env first.'});const raw=crypto.randomBytes(24).toString('base64url');const now=Date.now();const tokens=readList('tokens').filter(t=>t.expiresAt>now&&!t.usedAt);tokens.push({id:crypto.randomUUID(),hash:crypto.createHash('sha256').update(raw).digest('hex'),memberId,createdAt:now,expiresAt:now+600000,createdBy:ADMIN_USER});writeList('tokens',tokens);const link=`https://t.me/${BOT_USERNAME}?start=${raw}`;const qr=await require('qrcode').toDataURL(link);writeAuditLog('member_verification_created',{memberId,memberName:member.name,expiresAt:new Date(now+600000).toISOString()});res.json({ok:true,memberId,expiresAt:new Date(now+600000).toISOString(),link,qr});}catch(e){console.error(e);res.status(500).json({error:'Unable to create verification link.'});}});
app.post('/api/admin/member-accounts/:telegramId/unlink',requireAdmin,(req,res)=>{const id=String(req.params.telegramId);const list=readList('accounts');const a=list.find(x=>String(x.telegramId)===id);if(!a)return res.status(404).json({error:'Account not found.'});writeList('accounts',list.filter(x=>String(x.telegramId)!==id));writeList('sessions',readList('sessions').filter(x=>String(x.telegramId)!==id));writeAuditLog('member_account_unlinked',{telegramId:id,memberId:a.memberId});res.json({ok:true});});
app.post('/api/internal/telegram/verify',async(req,res)=>{if(!INTERNAL_SECRET||req.headers['x-tcr-internal-secret']!==INTERNAL_SECRET)return res.status(401).json({error:'Unauthorized'});const startToken=String(req.body.startToken||'');const telegramId=String(req.body.telegramId||'');const username=String(req.body.username||'').slice(0,100);if(!startToken||!telegramId)return res.status(400).json({error:'Missing verification details.'});const hash=crypto.createHash('sha256').update(startToken).digest('hex');const tokens=readList('tokens');const t=tokens.find(x=>x.hash===hash&&!x.usedAt&&x.expiresAt>Date.now());if(!t)return res.status(400).json({error:'Verification link is expired or already used.'});const member=readData().members.find(m=>String(m.id)===String(t.memberId)&&m.active!==false);if(!member)return res.status(400).json({error:'Member profile is no longer active.'});t.usedAt=Date.now();t.telegramId=telegramId;writeList('tokens',tokens);const accounts=readList('accounts');const old=accounts.find(x=>String(x.telegramId)===telegramId);const conflict=accounts.find(x=>String(x.memberId)===String(t.memberId)&&String(x.telegramId)!==telegramId);if(conflict)return res.status(409).json({error:'This member profile is already linked to another Telegram account. Ask an admin to unlink it first.'});const account={telegramId,telegramUsername:username,memberId:String(t.memberId),verifiedAt:new Date().toISOString(),profile:old?.profile||{},notificationsEnabled:true};const next=accounts.filter(x=>String(x.telegramId)!==telegramId);next.push(account);writeList('accounts',next);const loginTicket=crypto.randomBytes(32).toString('base64url');const browserTickets=readList('browserTickets').filter(x=>x.expiresAt>Date.now()&&!x.usedAt);browserTickets.push({hash:crypto.createHash('sha256').update(loginTicket).digest('hex'),telegramId,memberId:String(t.memberId),createdAt:Date.now(),expiresAt:Date.now()+5*60*1000});writeList('browserTickets',browserTickets);writeList('notifications',[{id:crypto.randomUUID(),memberId:String(t.memberId),telegramId,title:'Telegram verified',message:'Your Telegram account is linked to your TCR member profile.',createdAt:new Date().toISOString(),read:false},...readList('notifications')].slice(0,5000));writeAuditLog('member_account_verified',{memberId:String(t.memberId),memberName:member.name,telegramId});res.json({ok:true,member:{id:String(member.id),name:member.name,team:member.team,games:member.games||0,scores:member.scores||0,average:member.games?Math.round((Number(member.scores)||0)/(Number(member.games)||1)):0},loginUrl:`${PORTAL_ORIGIN}/member-portal.html?ticket=${loginTicket}`});});
app.post('/api/member/browser-login',(req,res)=>{
 const raw=String(req.body.ticket||'');
 if(!raw) return res.status(400).json({error:'Missing sign-in ticket. Open the latest link sent by the TCR bot.'});
 const hash=crypto.createHash('sha256').update(raw).digest('hex');
 const tickets=readList('browserTickets');
 const ticket=tickets.find(x=>x.hash===hash&&!x.usedAt&&x.expiresAt>Date.now());
 if(!ticket) return res.status(401).json({error:'This sign-in link expired or was already used. Ask an admin for a new link.'});
 ticket.usedAt=Date.now();
 writeList('browserTickets',tickets);
 const sessionToken=crypto.randomBytes(32).toString('base64url');
 const sessions=readList('sessions').filter(x=>x.expiresAt>Date.now()&&String(x.telegramId)!==String(ticket.telegramId));
 sessions.push({hash:crypto.createHash('sha256').update(sessionToken).digest('hex'),telegramId:String(ticket.telegramId),memberId:String(ticket.memberId),createdAt:Date.now(),expiresAt:Date.now()+30*24*3600*1000});
 writeList('sessions',sessions);
 res.setHeader('Set-Cookie',`tcr_member=${encodeURIComponent(sessionToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
 res.json({ok:true});
});
app.post('/api/member/logout',(req,res)=>{
 res.setHeader('Set-Cookie','tcr_member=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
 res.json({ok:true});
});
app.post('/api/member/session',memberAuth,(req,res)=>res.json({ok:true,account:safeAccount(req.memberAccount)}));
app.get('/api/member/me',memberAuth,(req,res)=>{const data=readData();const m=data.members.find(x=>String(x.id)===String(req.memberAccount.memberId));if(!m)return res.status(404).json({error:'Member profile not found.'});const games=Number(m.games)||0,scores=Number(m.scores)||0;res.json({account:safeAccount(req.memberAccount),member:{...cleanMember(m),average:games?Math.round(scores/games):0,profile:req.memberAccount.profile||{}},notifications:readList('notifications').filter(n=>String(n.memberId)===String(m.id)).slice(0,100),attendance:readList('attendance').filter(a=>String(a.memberId)===String(m.id)).slice(0,100),training:readList('training').filter(t=>t.active!==false).slice(0,100)});});
app.patch('/api/member/profile',memberAuth,upload.single('photo'),(req,res)=>{const accounts=readList('accounts');const a=accounts.find(x=>String(x.telegramId)===String(req.memberAccount.telegramId));if(!a)return res.status(404).json({error:'Account not found.'});const before={...(a.profile||{})};const allowed=['name','phone','dateOfBirth','gender','cityProvince'];a.profile=a.profile||{};for(const k of allowed)if(typeof req.body[k]==='string')a.profile[k]=req.body[k].trim().slice(0,120);if(req.file)a.profile.photo='/uploads/'+path.basename(req.file.path);writeList('accounts',accounts);writeList('changes',[{id:crypto.randomUUID(),memberId:a.memberId,telegramId:a.telegramId,before,after:a.profile,createdAt:new Date().toISOString()},...readList('changes')].slice(0,5000));writeAuditLog('member_profile_self_updated',{memberId:a.memberId,telegramId:a.telegramId});res.json({ok:true,profile:a.profile});});
app.post('/api/member/score-requests',memberAuth,upload.array('proofs',6),(req,res)=>{const games=Math.floor(Number(req.body.games)),scores=Math.floor(Number(req.body.scores));if(!Number.isInteger(games)||games<1||games>100||!Number.isInteger(scores)||scores<0||scores>100000)return res.status(400).json({error:'Enter valid games and total score.'});const data=readData();const member=data.members.find(m=>String(m.id)===String(req.memberAccount.memberId));const item={id:crypto.randomUUID(),name:member?.name||'Member',telegramId:req.memberAccount.telegramId,memberId:req.memberAccount.memberId,games,scores,notes:String(req.body.notes||'').slice(0,500),proofs:(req.files||[]).map(f=>'/uploads/'+path.basename(f.path)),status:'pending',createdAt:new Date().toISOString(),source:'member-portal'};const requests=readRequests();requests.unshift(item);writeRequests(requests);writeList('events',[{id:crypto.randomUUID(),requestId:item.id,memberId:item.memberId,event:'submitted',at:item.createdAt},...readList('events')].slice(0,5000));writeAuditLog('member_portal_score_request_submitted',{requestId:item.id,memberId:item.memberId,games,scores});res.json({ok:true,request:item});});
app.get('/api/member/score-requests',memberAuth,(req,res)=>res.json({requests:readRequests().filter(r=>String(r.memberId)===String(req.memberAccount.memberId)).map(r=>({id:r.id,games:r.games,scores:r.scores,status:r.status,createdAt:r.createdAt,reviewedAt:r.reviewedAt,reviewReason:r.reviewReason}))}));
app.post('/api/admin/member-notifications',requireAdmin,(req,res)=>{const memberId=String(req.body.memberId||'');const title=String(req.body.title||'').trim().slice(0,120),message=String(req.body.message||'').trim().slice(0,2000);if(!title||!message)return res.status(400).json({error:'Title and message are required.'});const targets=memberId?readList('accounts').filter(a=>String(a.memberId)===memberId):readList('accounts');const rows=targets.map(a=>({id:crypto.randomUUID(),memberId:a.memberId,telegramId:a.telegramId,title,message,createdAt:new Date().toISOString(),read:false}));writeList('notifications',[...rows,...readList('notifications')].slice(0,5000));writeAuditLog('member_notification_created',{memberId:memberId||'all',count:rows.length,title});res.json({ok:true,count:rows.length});});
app.post('/api/admin/training-sessions',requireAdmin,(req,res)=>{const title=String(req.body.title||'').trim().slice(0,120),date=String(req.body.date||'').slice(0,30),location=String(req.body.location||'').slice(0,200);if(!title||!date)return res.status(400).json({error:'Title and date are required.'});const sessions=readList('training');const item={id:crypto.randomUUID(),title,date,location,notes:String(req.body.notes||'').slice(0,1000),active:true,createdAt:new Date().toISOString()};sessions.unshift(item);writeList('training',sessions);writeAuditLog('training_session_created',{sessionId:item.id,title,date});res.json({ok:true,session:item});});
app.post('/api/admin/training-sessions/:id/attendance',requireAdmin,(req,res)=>{const session=readList('training').find(x=>x.id===req.params.id);if(!session)return res.status(404).json({error:'Training session not found.'});const memberId=String(req.body.memberId||'');const member=readData().members.find(m=>String(m.id)===memberId&&m.active!==false);if(!member)return res.status(400).json({error:'Select a valid member.'});const rows=readList('attendance').filter(x=>!(x.sessionId===session.id&&String(x.memberId)===memberId));rows.push({id:crypto.randomUUID(),sessionId:session.id,memberId,memberName:member.name,status:req.body.present===false?'absent':'present',recordedAt:new Date().toISOString(),recordedBy:ADMIN_USER});writeList('attendance',rows);writeAuditLog('training_attendance_recorded',{sessionId:session.id,memberId,memberName:member.name,status:rows[rows.length-1].status});res.json({ok:true});});
app.post('/api/admin/member-accounts/:telegramId/resend',requireAdmin,async(req,res)=>{const account=readList('accounts').find(a=>String(a.telegramId)===String(req.params.telegramId));if(!account)return res.status(404).json({error:'Account not found.'});const member=readData().members.find(m=>String(m.id)===String(account.memberId));if(!member)return res.status(404).json({error:'Member not found.'});const raw=crypto.randomBytes(24).toString('base64url'),now=Date.now(),tokens=readList('tokens').filter(t=>t.expiresAt>now&&!t.usedAt);tokens.push({id:crypto.randomUUID(),hash:crypto.createHash('sha256').update(raw).digest('hex'),memberId:String(member.id),createdAt:now,expiresAt:now+600000,createdBy:ADMIN_USER});writeList('tokens',tokens);const link=`https://t.me/${BOT_USERNAME}?start=${raw}`;const qr=await require('qrcode').toDataURL(link);res.json({ok:true,link,qr,expiresAt:new Date(now+600000).toISOString()});});

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "1d", immutable: true }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req,res) => res.redirect("/login.html"));
app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Request failed." });
});

app.listen(PORT, HOST, () => console.log(`TCR v0.1.4 backend listening on http://${HOST}:${PORT}`));
