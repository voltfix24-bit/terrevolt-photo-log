import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isLightboxGesture = (event: Event) =>
  event.composedPath().some(
    (target) => target instanceof Element && target.classList.contains("yarl__root"),
  );

document.addEventListener("gesturestart", (event) => {
  if (!isLightboxGesture(event)) event.preventDefault();
}, { passive: false });
document.addEventListener("gesturechange", (event) => {
  if (!isLightboxGesture(event)) event.preventDefault();
}, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (event) => {
  if (isLightboxGesture(event)) return;
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Guard: unregister service workers in iframe/preview contexts
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);
