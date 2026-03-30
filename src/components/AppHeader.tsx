import { useNavigate, useLocation } from "react-router-dom";

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      {/* Top header — Saudia style: hamburger + brand + avatar */}
      <header className="fixed top-0 w-full z-50 bg-surface-white/80 backdrop-blur-md border-b border-outline-variant/8">
        <div className="flex justify-between items-center px-5 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5 active:scale-95 transition-transform">
              <span className="font-display text-[22px] font-extrabold tracking-tight text-primary">TerreVolt</span>
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <button onClick={() => navigate("/")} className={`text-sm font-medium transition-all ${isActive("/") && !isActive("/stations") ? "text-primary font-bold" : "text-text-muted hover:text-primary-hover"}`}>
              Dashboard
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/instellingen")} className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground font-display text-sm font-bold active:scale-90 transition-transform shadow-sm">
              TV
            </button>
          </div>
        </div>
      </header>

      {/* Bottom nav (mobile) */}

      {/* FAB — rechtsonder op alle schermformaten, verborgen op stationsdetail */}
      {!location.pathname.startsWith("/stations/") || location.pathname === "/stations/new" ? null : null}
      <button
        onClick={() => navigate("/stations/new")}
        className={`fixed bottom-24 md:bottom-8 right-5 z-50 w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-[0_6px_24px_-4px_rgba(0,100,47,0.4)] flex items-center justify-center active:scale-90 transition-all ${
          location.pathname.startsWith("/stations/") ? "hidden" : ""
        }`}
        aria-label="Nieuw station toevoegen"
      >
        <span className="material-symbols-rounded text-[28px]">add</span>
      </button>
    </>
  );
}
