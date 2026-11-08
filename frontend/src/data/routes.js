// Page titles and descriptions. Used at runtime and by scripts/prerender.mjs.
export const SITE_URL = "https://teamclassicrollers.club";

export const PAGES = {
  "/": {
    title: "Team Classic Rollers | Bowling in Cambodia",
    description: "Team Classic Rollers is a Cambodian bowling team of three squads. See live stats, rankings and bowler profiles, and learn the game.",
  },
  "/team": {
    title: "The Team | Team Classic Rollers",
    description: "Meet the bowlers of Team Classic Rollers. Search the roster, filter by squad and open any profile for live stats.",
  },
  "/rankings": {
    title: "Rankings | Team Classic Rollers",
    description: "Live Team Classic Rollers rankings by average, games and total pins, for the whole team and each squad.",
  },
  "/learn": {
    title: "Learn to Bowl | Team Classic Rollers",
    description: "New to bowling? Learn how scoring works, tips for your first game and the words bowlers use, and try a tap-to-score calculator.",
  },
  "/about": {
    title: "About | Team Classic Rollers",
    description: "Team Classic Rollers is a Cambodian bowling team built on teamwork, discipline, competition and pride.",
  },
  "/login": {
    title: "Member Sign In | Team Classic Rollers",
    description: "Team Classic Rollers members sign in with Telegram to see their stats, profile, notifications and training.",
  },
  "/portal": {
    title: "My Portal | Team Classic Rollers",
    description: "Your games, average, training attendance and progress towards the next squad.",
  },
  "/submit": {
    title: "Submit a Score | Team Classic Rollers",
    description: "Team Classic Rollers members: send in your games and total pins for admin review.",
  },
};

export const memberMeta = (name, team) => ({
  title: `${name} | Team Classic Rollers`,
  description: `${name} bowls for ${team} of Team Classic Rollers. See live games, total pins and average.`,
});
