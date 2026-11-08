import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const LIVE_API = "https://admin.teamclassicrollers.club";

// During `npm run dev`, reads go to the live API so real stats show locally.
// Anything that isn't a GET is blocked, so local testing can't write to production.
const liveReadOnly = {
  target: LIVE_API,
  changeOrigin: true,
  bypass: (req) => (req.method === "GET" ? undefined : false),
};

// To try member sign-in and the portal against a local backend, set TCR_LOCAL_API,
// e.g. http://127.0.0.1:3100. Everything then goes there, including writes.
const LOCAL_API = process.env.TCR_LOCAL_API;
const api = LOCAL_API ? { target: LOCAL_API, changeOrigin: true } : liveReadOnly;

export default defineConfig({
  plugins: [react()],
  build: {
    // public/assets holds member photos, so bundled files need their own folder.
    assetsDir: "static",
    chunkSizeWarningLimit: 900,
  },
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": api, "/uploads": api },
  },
});
