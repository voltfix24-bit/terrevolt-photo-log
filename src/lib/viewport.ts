// Zichtbaar deel van het scherm (iOS-toetsenbord, korte liggende viewport) als CSS-variabelen
// --vvh (hoogte) en --vvt (offset), zodat dialogen altijd binnen het zichtbare deel blijven.
export function installeerViewportVars() {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const zet = () => {
    const vv = window.visualViewport;
    root.style.setProperty("--vvh", `${vv ? vv.height : window.innerHeight}px`);
    root.style.setProperty("--vvt", `${vv ? vv.offsetTop : 0}px`);
    root.style.setProperty("--vvb", `${vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0}px`);
  };
  zet();
  window.visualViewport?.addEventListener("resize", zet);
  window.visualViewport?.addEventListener("scroll", zet);
  window.addEventListener("resize", zet);
}
