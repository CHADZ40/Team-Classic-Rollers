// One shared copy of team data. Pages read from here, so moving between them is instant.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const Store = createContext(null);
const REFRESH_MS = 45000;

export function AdminDataProvider({ children }) {
  const [site, setSite] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [siteData, requestData] = await Promise.all([api("/api/admin/site-data"), api("/api/admin/game-requests")]);
      setSite(siteData);
      setRequests(requestData.requests || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Only while the tab is being looked at, to stay well inside the server's request limit.
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    const onFocus = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);

  const updateMember = useCallback((member) => {
    setSite((current) => current && { ...current, members: current.members.map((m) => (m.id === member.id ? { ...m, ...member } : m)) });
  }, []);

  const value = useMemo(() => {
    const members = (site?.members || []).filter((m) => m.active !== false);
    return {
      loaded: Boolean(site), error, site, members, requests, refresh, updateMember, setSite,
      pending: requests.filter((r) => r.status === "pending"),
    };
  }, [site, requests, error, refresh, updateMember]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export const useAdmin = () => useContext(Store);
