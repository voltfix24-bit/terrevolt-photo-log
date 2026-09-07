import { useNavigate, useLocation } from "react-router-dom";
import { useInstellingen } from "@/hooks/use-theme";
import { useOnline } from "@/hooks/use-online";
import { getQueueCount } from "@/lib/offline-queue";
import { useState, useEffect } from "react";

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: instellingen } = useInstellingen();
  const isOnline = useOnline();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    getQueueCount().then(setQueueCount);
  }, [isOnline]);

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  if (location.pathname === "/") return null;

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-surface-white/80 backdrop-blur-md border-b border-outline-variant/8">
        <div className="flex justify-between items-center px-5 h-14 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5 active:scale-95 transition-transform">
              {instellingen?.logo_url ? (
                <img src={instellingen.logo_url} alt="Logo" className="h-8 max-w-[120px] object-contain" />
              ) : (
                <span className="font-display text-[22px] font-extrabold tracking-tight text-primary">
                  {instellingen?.bedrijfsnaam || 'TerreVolt'}
                </span>
              )}
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-7">
            <button onClick={() => navigate("/")} className={`text-sm font-medium transition-all ${isActive("/") && !isActive("/stations") ? "text-primary font-bold" : "text-text-muted hover:text-primary-hover"}`}>
              Dashboard
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/instellingen")} className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground font-display text-sm font-bold active:scale-90 transition-transform shadow-sm">
              {instellingen?.profielfoto_url ? (
                <img src={instellingen.profielfoto_url} alt="Profiel" className="w-full h-full object-cover" />
              ) : (
                'TV'
              )}
            </button>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-orange/90 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <span className="material-symbols-rounded text-base">wifi_off</span>
          <span>Offline — foto's worden opgeslagen en later geüpload</span>
          {queueCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">{queueCount} wachtend</span>
          )}
        </div>
      )}

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
