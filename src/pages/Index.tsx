import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";
import { Skeleton } from "@/components/ui/skeleton";
import { generatePdfHtml } from "@/lib/pdf-generator";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*, fotos(categorie, id, url, storage_path)")
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

  const totalStations = stations?.length ?? 0;

  const openPdf = (station: any) => {
    const fotos = station.fotos ?? [];
    const html = generatePdfHtml(station, fotos);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

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

        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-on-surface">Stations</h2>
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
                const isExpanded = expandedId === station.id;

                return (
                  <div key={station.id} className="rounded-[2rem] overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : station.id)}
                      className={`station-card group w-full bg-surface-low hover:bg-card transition-all duration-200 p-5 flex items-center justify-between border border-transparent hover:border-outline-variant/20 hover:shadow-xl hover:shadow-primary/5 cursor-pointer text-left ${isExpanded ? "rounded-t-[2rem]" : "rounded-[2rem]"}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative w-20 h-20 flex-shrink-0">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path className="stroke-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="2.5" />
                            <path className={ringColor} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeDasharray={`${pct},100`} strokeLinecap="round" strokeWidth="2.5" style={{ transition: "stroke-dasharray 1s ease" }} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-xs font-bold ${complete ? "text-primary" : ""}`}>{complete ? "Klaar" : `${cats}/40`}</span>
                          </div>
                        </div>
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
                      <div className={`card-arrow w-10 h-10 rounded-full bg-surface-high flex items-center justify-center text-muted-foreground transition-all flex-shrink-0 ml-2 ${isExpanded ? "bg-primary text-primary-foreground rotate-90" : "group-hover:bg-primary group-hover:text-primary-foreground"}`}>
                        <span className="material-symbols-outlined">chevron_right</span>
                      </div>
                    </button>

                    {/* Action buttons — slide down */}
                    {isExpanded && (
                      <div className="bg-surface-low border-t border-outline-variant/15 px-5 py-3 flex gap-2.5 rounded-b-[2rem] animate-fade-up">
                        <button
                          onClick={() => navigate(`/stations/${station.id}`)}
                          className="flex-1 flex items-center justify-center gap-2 min-h-[48px] bg-gradient-to-br from-primary to-primary-light text-primary-foreground rounded-2xl text-sm font-bold shadow-md shadow-primary/25 active:scale-[0.97] transition-transform"
                        >
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                          Invullen
                        </button>
                        <button
                          onClick={() => openPdf(station)}
                          className="flex-1 flex items-center justify-center gap-2 min-h-[48px] bg-card border border-outline-variant/20 text-on-surface rounded-2xl text-sm font-bold shadow-sm active:scale-[0.97] transition-transform"
                        >
                          <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                          PDF rapport
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
