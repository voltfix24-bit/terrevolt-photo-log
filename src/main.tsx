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

createRoot(document.getElementById("root")!).render(<App />);
