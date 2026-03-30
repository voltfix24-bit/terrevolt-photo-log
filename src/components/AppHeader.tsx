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
      {/* Desktop header */}
      <header className="fixed top-0 w-full z-50 bg-white/75 backdrop-blur-md shadow-[0_8px_32px_rgba(25,28,30,0.05)] border-b border-slate-200/20">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground shadow-md shadow-primary/30">
              <span className="material-symbols-outlined fill text-lg">bolt</span>
            </div>
            <span className="text-xl font-black tracking-tighter text-primary">TerreVolt</span>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <button onClick={() => navigate("/")} className={`text-sm font-medium transition-all ${isActive("/") && !isActive("/stations") ? "text-primary font-bold" : "text-muted-foreground hover:text-on-surface"}`}>
              Dashboard
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/instellingen")} className="w-9 h-9 rounded-full overflow-hidden border-2 border-primary-container bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground text-sm font-bold active:scale-90 transition-transform">
              TV
            </button>
          </div>
        </div>
      </header>

      {/* Bottom nav (mobile) */}
      <nav className={`md:hidden fixed bottom-0 w-full z-50 bg-white/85 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.06)] rounded-t-3xl ${location.pathname.startsWith("/stations/") && location.pathname !== "/stations/new" ? "hidden" : ""}`}>
        <div className="flex justify-around items-center h-20 px-4">
          <button onClick={() => navigate("/")} className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all ${isActive("/") && !isActive("/stations") ? "bg-primary-container/30 text-primary" : "text-muted-foreground"}`}>
            <span className={`material-symbols-outlined ${isActive("/") && !isActive("/stations") ? "fill" : ""} text-2xl`}>dashboard</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Dashboard</span>
          </button>
          <button onClick={() => navigate("/stations/new")} className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all ${isActive("/stations/new") ? "bg-primary-container/30 text-primary" : "text-muted-foreground"}`}>
            <span className={`material-symbols-outlined ${isActive("/stations/new") ? "fill" : ""} text-2xl`}>add_circle</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Nieuw</span>
          </button>
        </div>
      </nav>
    </>
  );
}
