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
      <header className="fixed top-0 w-full z-50 bg-primary-container/20 backdrop-blur-md border-b border-outline-variant/8">
        <div className="flex justify-between items-center px-5 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button className="w-9 h-9 flex items-center justify-center text-on-surface-variant md:hidden">
              <span className="material-symbols-outlined text-2xl">menu</span>
            </button>
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5 active:scale-95 transition-transform">
              <span className="font-display text-[22px] font-extrabold tracking-tight text-primary">TerreVolt</span>
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <button onClick={() => navigate("/")} className={`text-sm font-medium transition-all ${isActive("/") && !isActive("/stations") ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"}`}>
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
      <nav className={`md:hidden fixed bottom-0 w-full z-50 bg-card/95 backdrop-blur-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.06)] border-t border-outline-variant/8 ${location.pathname.startsWith("/stations/") && location.pathname !== "/stations/new" ? "hidden" : ""}`}>
        <div className="flex justify-around items-center h-[68px] px-2">
          <button onClick={() => navigate("/")} className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all min-w-[72px] ${isActive("/") && !isActive("/stations") ? "text-primary" : "text-muted-foreground"}`}>
            <span className={`material-symbols-outlined ${isActive("/") && !isActive("/stations") ? "fill" : ""} text-[24px]`}>dashboard</span>
            <span className="font-display text-[9px] font-extrabold uppercase tracking-[0.12em]">Dashboard</span>
          </button>
          <button onClick={() => navigate("/stations/new")} className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all min-w-[72px] ${isActive("/stations/new") ? "bg-primary text-primary-foreground rounded-xl px-5 py-2.5" : "text-muted-foreground"}`}>
            <span className={`material-symbols-outlined ${isActive("/stations/new") ? "fill" : ""} text-[24px]`}>add_circle</span>
            <span className="font-display text-[9px] font-extrabold uppercase tracking-[0.12em]">Nieuw</span>
          </button>
        </div>
      </nav>
    </>
  );
}
