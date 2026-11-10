import { createContext, useContext, useEffect, useMemo, useState } from "react";
import seed from "../../../backend/seed/site-data.json";
import { API_BASE, STATIC_SITE } from "../lib/team.js";

const CACHE_KEY = "tcr-site-data";

// Stock text still stored in older data files. The site's own copy is used
// instead; anything an admin writes in the content editor always wins.
const STOCK_CONTENT = new Set([
  "Welcome to Team Classic Rollers. A bowling team built around training, competition, friendship, and Cambodian pride.",
  "Built around the love of bowling.",
  "Team Classic Rollers brings competitive bowling and team spirit together in Cambodia.",
  "A team with a purpose.",
  "Team Classic Rollers is a bowling team focused on developing players, supporting teammates, and taking part in competitive bowling.",
  "We value discipline, respect, teamwork, and steady improvement. Whether you are training for your next tournament or learning the basics, every player has a place to grow.",
]);

const SiteDataContext = createContext(null);

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}

export function SiteDataProvider({ children }) {
  const [state, setState] = useState(() => {
    const cached = readCache();
    // "loading" with cached data still shows real stats straight away.
    return { data: cached || seed, status: "loading", hasStats: Boolean(cached) };
  });

  useEffect(() => {
    let cancelled = false;
    fetch(STATIC_SITE ? "/data/site-data.json" : `${API_BASE}/api/public/site-data`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
        setState({ data, status: "live", hasStats: true });
      })
      .catch(() => {
        if (cancelled) return;
        setState((current) => ({ ...current, status: current.hasStats ? "cached" : "offline" }));
      });
    return () => { cancelled = true; };
  }, []);

  return <SiteDataContext.Provider value={state}>{children}</SiteDataContext.Provider>;
}

export const useSiteData = () => useContext(SiteDataContext);

export function useContent(key, fallback) {
  const { data } = useSiteData();
  return useMemo(() => {
    const value = String(data.content?.[key] || "").replace(/\s+/g, " ").trim();
    return !value || STOCK_CONTENT.has(value) ? fallback : value;
  }, [data, key, fallback]);
}

export function statusNote({ status, data }) {
  if (status === "offline") return "Live stats are unavailable right now. Check back soon.";
  if (status === "cached") return "Showing the last stats we loaded.";
  if (status === "loading") return "Loading live stats…";
  const when = data.updatedAt ? new Date(data.updatedAt) : null;
  return when && !Number.isNaN(+when)
    ? `Official team records · updated ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "Live from official team records";
}
