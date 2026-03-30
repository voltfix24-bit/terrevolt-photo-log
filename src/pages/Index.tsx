import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*, fotos(categorie)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = stations?.filter(
    (s) =>
      s.naam_msr.toLowerCase().includes(search.toLowerCase()) ||
      s.behuizingsnummer?.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate stats
  const totalStations = stations?.length ?? 0;
  const compactCount = stations?.filter(s => s.type_ruimte === "Compact Station").length ?? 0;
  const betreedbaarCount = stations?.filter(s => s.type_ruimte === "Betreedbaar station").length ?? 0;
  const avgProgress = totalStations > 0
    ? Math.round(stations!.reduce((sum, s) => {
        const cats = new Set(s.fotos?.map((f: { categorie: string }) => f.categorie)).size;
        return sum + (cats / FOTO_CATEGORIEEN.length) * 100;
      }, 0) / totalStations)
    : 0;

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-6 max-w-7xl mx-auto animate-fade-up">
        {/* Hero */}
        <section className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-sm text-on-surface-variant font-medium mb-0.5">Welkom terug,</p>
            <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">TO Foto's</h1>
            <p className="text-on-surface-variant font-medium mt-1">Liander Zuidoost · {totalStations} actieve stations</p>
          </div>
          <div className="relative w-full md:w-80 group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors text-xl">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam of behuizingsnummer..."
              className="w-full bg-card border border-outline-variant/30 rounded-2xl py-3 pl-12 pr-4 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
            />
          </div>
        </section>

        {/* Bento stats */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="col-span-2 bg-gradient-to-br from-primary to-primary-light p-7 rounded-3xl text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-white/75 font-semibold text-xs uppercase tracking-widest mb-2">Totale voortgang</p>
              <h2 className="text-5xl font-black mb-3">{avgProgress}%</h2>
              <p className="text-white/85 text-sm max-w-[180px] leading-relaxed">Gemiddelde completering over alle actieve stations</p>
            </div>
            <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[110px] opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-700">analytics</span>
          </div>
          <div className="bg-card p-5 rounded-3xl shadow-sm border border-outline-variant/10 flex flex-col justify-between">
            <div className="w-11 h-11 rounded-2xl bg-primary-container flex items-center justify-center text-primary mb-3">
              <span className="material-symbols-outlined">ev_station</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-on-surface">{compactCount}</div>
              <div className="text-muted-foreground text-sm font-medium">Compact Station</div>
            </div>
          </div>
          <div className="bg-card p-5 rounded-3xl shadow-sm border border-outline-variant/10 flex flex-col justify-between">
            <div className="w-11 h-11 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 mb-3">
              <span className="material-symbols-outlined">door_front</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-on-surface">{betreedbaarCount}</div>
              <div className="text-muted-foreground text-sm font-medium">Betreedbaar station</div>
            </div>
          </div>
        </section>

        {/* Station list */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-on-surface">Stations</h2>
            <button
              onClick={() => navigate("/stations/new")}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl shadow-md shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-base">add</span> Nieuw station
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface-low p-5 rounded-[2rem] flex items-center gap-4">
                  <Skeleton className="w-20 h-20 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="mb-2 h-4 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered?.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-on-surface-variant text-sm">
              {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered?.map((station) => {
                const uniqueCategories = new Set(
                  station.fotos?.map((f: { categorie: string }) => f.categorie)
                );
                const cats = uniqueCategories.size;
                const pct = Math.round((cats / FOTO_CATEGORIEEN.length) * 100);
                const isCS = station.type_ruimte === "Compact Station";
                const complete = cats === FOTO_CATEGORIEEN.length;
                const totalFotos = station.fotos?.length ?? 0;
                const ringColor = complete ? "stroke-primary-light" : pct > 50 ? "stroke-primary" : "stroke-amber-500";

                return (
                  <button
                    key={station.id}
                    onClick={() => navigate(`/stations/${station.id}`)}
                    className="station-card group bg-surface-low hover:bg-card transition-all duration-200 p-5 rounded-[2rem] flex items-center justify-between border border-transparent hover:border-outline-variant/20 hover:shadow-xl hover:shadow-primary/5 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-4">
                      {/* Progress ring */}
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <path className="stroke-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="2.5" />
                          <path className={ringColor} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeDasharray={`${pct},100`} strokeLinecap="round" strokeWidth="2.5" style={{ transition: "stroke-dasharray 1s ease" }} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-xs font-bold ${complete ? "text-primary" : ""}`}>{complete ? "Klaar" : `${cats}/40`}</span>
                        </div>
                      </div>
                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-base text-on-surface">{station.naam_msr}</h3>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide"
                            style={isCS
                              ? { background: "rgba(181,237,184,0.5)", color: "#003a14" }
                              : { background: "rgba(233,213,255,0.5)", color: "#6B2D8B" }
                            }
                          >
                            {station.type_ruimte}
                          </span>
                        </div>
                        {station.behuizingsnummer && (
                          <p className="text-muted-foreground text-xs font-mono tracking-tight mb-1.5">{station.behuizingsnummer}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium flex-wrap">
                          {station.datum && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">calendar_today</span>{station.datum}
                            </span>
                          )}
                          {station.ingevuld_door && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">person</span>{station.ingevuld_door}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">photo_camera</span>{totalFotos} foto's
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="card-arrow w-10 h-10 rounded-full bg-surface-high flex items-center justify-center text-muted-foreground transition-all flex-shrink-0 ml-2 group-hover:bg-primary group-hover:text-primary-foreground">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* FAB (mobile) */}
      <button
        onClick={() => navigate("/stations/new")}
        className="md:hidden fixed bottom-24 right-5 z-40 flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3.5 rounded-2xl shadow-[0_12px_40px_rgba(0,110,45,0.4)] active:scale-95 transition-transform font-bold text-sm"
      >
        <span className="material-symbols-outlined text-xl">add</span> Nieuw station
      </button>
    </div>
  );
}
