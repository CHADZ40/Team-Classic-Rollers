// Team data helpers shared across pages.

export const API_BASE = import.meta.env.DEV ? "" : "https://admin.teamclassicrollers.club";
export const SOCIALS = [
  { label: "Facebook", href: "https://web.facebook.com/teamclassicrollers" },
  { label: "Instagram", href: "https://www.instagram.com/teamclassicrollers/" },
  { label: "TikTok", href: "https://www.tiktok.com/@teamclassicrollers" },
];
export const TEAMS = ["Team A", "Team B", "Team C"];
export const TEAM_COLOR = { "Team A": "var(--yellow)", "Team B": "var(--red)", "Team C": "var(--sky)" };

// Member photos live in stored records as "assets/members/NAME.png", and those
// paths and filenames must stay as they are. Uploads are served by the API.
export function fullPhoto(path) {
  const value = String(path || "");
  if (value.startsWith("/uploads/")) return API_BASE + value;
  if (/^(https?:)?\/\//.test(value) || value.startsWith("/")) return value;
  return value ? `/${value}` : "/assets/member-placeholder.svg";
}
export const thumbPhoto = (path) => fullPhoto(path).replace(/assets\/members\/([^/]+)\.png$/, "assets/members/thumbs/$1.webp");
export const posterPhoto = (path) => fullPhoto(path).replace(/assets\/members\/([^/]+)\.png$/, "assets/members/thumbs/$1-poster.webp");

export function stats(member) {
  const games = Number(member.games) || 0;
  const scores = Number(member.scores) || 0;
  const avg = games > 0 ? scores / games : 0;
  const base = Math.max(25, Number(member.goal) || 175);
  const goal = avg >= base ? base + (Math.floor((avg - base) / 25) + 1) * 25 : base;
  return { games, scores, avg, goal, percent: Math.min(100, Math.max(0, (avg / goal) * 100)) };
}

export const byAverage = (a, b) => stats(b).avg - stats(a).avg || stats(b).games - stats(a).games;
export const activeMembers = (data) => data.members.filter((member) => member.active !== false);
export const rankedMembers = (data) => activeMembers(data).filter((member) => stats(member).games > 0).sort(byAverage);
export const bySortOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
export const memberPath = (member) => `/members/${encodeURIComponent(member.slug || member.id)}`;
export const niceName = (name) => String(name || "").toLowerCase().replace(/(^|[\s.-])\S/g, (c) => c.toUpperCase());
export const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

// The people introduced on the home page, in the order set in the admin. Anyone still
// without a name is a role waiting to be filled in, so they stay off the site.
export function leaderList(data) {
  const members = activeMembers(data);
  return (data.introductions || []).filter((leader) => leader.name).map((leader) => ({
    ...leader, member: members.find((member) => member.id === leader.memberId) || null,
  }));
}
export const leaderPicture = (leader) => (leader.photo ? fullPhoto(leader.photo) : leader.member ? posterPhoto(leader.member.photo) : "");
export const leaderThumb = (leader) => (leader.photo ? fullPhoto(leader.photo) : leader.member ? thumbPhoto(leader.member.photo) : "");

export function teamSummary(data, team) {
  const list = activeMembers(data).filter((member) => member.team === team).sort(bySortOrder);
  const games = list.reduce((sum, member) => sum + stats(member).games, 0);
  const scores = list.reduce((sum, member) => sum + stats(member).scores, 0);
  return { team, list, games, scores, avg: games ? scores / games : 0 };
}

export function teamTotals(data) {
  const members = activeMembers(data);
  const games = members.reduce((sum, member) => sum + stats(member).games, 0);
  const pins = members.reduce((sum, member) => sum + stats(member).scores, 0);
  return { bowlers: members.length, games, pins, average: games ? pins / games : 0 };
}
