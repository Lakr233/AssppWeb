import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The SAP signer worker loads unicorn.js dynamically, and a code-splitting
  // build cannot emit that as IIFE.
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/wisp": { target: "ws://localhost:8080", ws: true },
    },
  },
});
