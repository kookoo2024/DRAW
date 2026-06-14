import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

// Unregister any service worker left over from previous PWA-enabled builds so
// that classroom browsers always load the latest app and never get stuck on a
// stale cached shell (the classic "blank page after update" symptom).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
      if (registrations.length) {
        // reload once so the unregistered SW stops controlling the page
        window.location.reload();
      }
    })
    .catch((error) => {
      console.warn("service worker cleanup failed", error);
    });
}

root.render(
  <StrictMode>
    <ExcalidrawApp />
  </StrictMode>,
);
