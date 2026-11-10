// Who's signed in. The sign-in cookie belongs to the API, so the site asks it once when it
// loads. Everything that changes for members (the menu, the portal) reads from here.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE, STATIC_SITE } from "../lib/team.js";

const MemberContext = createContext(null);

export async function memberApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, credentials: "include" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Something went wrong. Please try again.");
  return json;
}

export function MemberSessionProvider({ children }) {
  const [state, setState] = useState({ status: STATIC_SITE ? "out" : "loading", me: null });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/member/me`, { credentials: "include" });
      setState(response.ok ? { status: "in", me: await response.json() } : { status: "out", me: null });
    } catch {
      setState({ status: "out", me: null });
    }
  }, []);

  // A published website has no server to sign in to.
  useEffect(() => { if (!STATIC_SITE) refresh(); }, [refresh]);

  // `remember` is the member's answer to "keep me signed in on this device?"
  const signIn = useCallback(async (ticket, remember) => {
    await memberApi("/api/member/browser-login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, remember }),
    });
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch(`${API_BASE}/api/member/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setState({ status: "out", me: null });
  }, []);

  const value = useMemo(() => ({ ...state, refresh, signIn, signOut }), [state, refresh, signIn, signOut]);
  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
}

export const useMemberSession = () => useContext(MemberContext);
