import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Overlay from "./Overlay";
import { overlayEnabled } from "./featureFlags";
import { parseOverlayPanel } from "./overlayStorage";
import "./index.css";

const overlayPanel = overlayEnabled ? parseOverlayPanel() : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {overlayPanel ? <Overlay panel={overlayPanel} /> : <App />}
  </StrictMode>
);
