import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The SAP signer worker dynamically imports the emscripten module, which
  // requires ES-module workers (code splitting is unsupported under iife).
  worker: {
    format: "es",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/wisp": { target: "ws://localhost:8080", ws: true },
    },
  },
});
