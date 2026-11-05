import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For `npm run dev`, start the backend locally first. This never points at the
// live server, because the admin can change real scores.
const LOCAL_BACKEND = process.env.TCR_LOCAL_API || "http://127.0.0.1:3100";
const backend = { target: LOCAL_BACKEND, changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../backend/admin-dist",
    emptyOutDir: true,
    assetsDir: "admin-static",
  },
  server: {
    port: 5174,
    proxy: { "/api": backend, "/uploads": backend, "/assets": backend },
  },
});
