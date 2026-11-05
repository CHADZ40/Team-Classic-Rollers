import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { getToken, setToken } from "../lib/api.js";
import { EASE } from "../components/ui.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Admin Sign In | Team Classic Rollers";
    if (getToken()) navigate("/dashboard", { replace: true });
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ username, password }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Sign-in failed. Please try again.");
      setToken(json.token);
      navigate("/dashboard", { replace: true, viewTransition: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-body">
      <motion.main className="login-card" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <img src="/assets/opt/logo.webp" alt="Team Classic Rollers" />
        <p className="eyebrow">Team admin</p>
        <h1>Sign in</h1>
        <form onSubmit={submit}>
          <label className="field">Username<input name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label className="field">Password<input type="password" name="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className="btn btn-primary btn-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="error" role="alert">{error}</p>
        </form>
        <a className="back" href="https://teamclassicrollers.club">Back to the website</a>
      </motion.main>
    </div>
  );
}
