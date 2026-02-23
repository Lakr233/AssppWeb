import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { initLibcurl } from "./apple/libcurl-init";

// Import i18n configuration to initialize it before rendering the app
import "./i18n";

// Start loading WASM early (non-blocking)
initLibcurl().catch((e) => console.warn("[libcurl] Init failed:", e));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
