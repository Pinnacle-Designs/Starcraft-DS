import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { overlayEnabled } from "./featureFlags";
import { parseOverlayPanel } from "./overlayStorage";
import { prefetchUnitCatalog } from "./useUnitCatalog";
import "./index.css";

const App = lazy(() => import("./App"));
const Overlay = lazy(() => import("./Overlay"));

const overlayPanel = overlayEnabled ? parseOverlayPanel() : null;
prefetchUnitCatalog();

function AppShellFallback() {
  return (
    <div className="app-shell-loading" role="status" aria-live="polite">
      Loading Starcraft Coach…
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<AppShellFallback />}>
      {overlayPanel ? <Overlay panel={overlayPanel} /> : <App />}
    </Suspense>
  </StrictMode>
);
