import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Overlay from "./Overlay";
import "./index.css";

const isOverlay =
  window.location.hash === "#/overlay" ||
  new URLSearchParams(window.location.search).get("overlay") === "1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isOverlay ? <Overlay /> : <App />}</StrictMode>
);
