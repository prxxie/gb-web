import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("root element is missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A stale service worker must never serve an old build to a player (`US-PWA-001`).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener("updatefound", () => {
        console.info("A new version is available — reload to update.");
      });
    });
  });
}
