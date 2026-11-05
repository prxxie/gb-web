import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles.css";

/**
 * The service worker is registered by `UpdatePrompt` (`US-PWA-001` AC1, AC5): registration and the
 * "Cập nhật" prompt are one lifecycle, and the prompt is the only thing that ever swaps the bundle.
 */

const container = document.getElementById("root");
if (!container) throw new Error("root element is missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
