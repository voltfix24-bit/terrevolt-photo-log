import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";
import { Skeleton } from "@/components/ui/skeleton";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { downloadStationZip } from "@/lib/zip-download";
import { toast } from "sonner";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<number | null>(null);

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

  // Calculate overall completion stats
  const completedStations = stations?.filter(s => {
    const cats = new Set(s.fotos?.map((f: any) => f.categorie)).size;
    return cats === FOTO_CATEGORIEEN.length;
  }).length ?? 0;
  const overallPct = totalStations > 0 ? Math.round((completedStations / totalStations) * 100) : 0;

  return (
    <div className="min-h-screen bg-primary-container/15 pb-28 md:pb-8">
      <main className="pt-20 pb-8 px-4 max-w-7xl mx-auto animate-fade-up">
        {/* Hero header — Manrope, bold like Saudia's "Network Stations" */}
        <section className="mb-6 pt-5">
          <h1 className="font-display text-[34px] font-extrabold tracking-tight text-primary leading-[1.1]">
            Stations
          </h1>
          <p className="text-muted-foreground text-[15px] mt-1.5 leading-relaxed">
            Beheer en monitor alle technische opleveringen.
          </p>
        </section>

        {/* Search bar — large rounded pill like Saudia */}
        <div className="relative mb-7">
          <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-[22px]">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek station of behuizingsnummer..."
            className="w-full bg-surface-container/60 border-none rounded-[20px] py-4 pl-14 pr-5 text-[15px] shadow-none focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/50 font-medium"
          />
        </div>

        {/* Active Hub — featured station card (only if not searching) */}
        {!isLoading && filtered && filtered.length > 0 && !search && (
          <div className="bg-card rounded-[28px] p-6 shadow-sm border border-outline-variant/8 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-display font-extrabold uppercase tracking-[0.18em] text-primary">Actief Station</span>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/stations/${filtered[0].id}`)}
                  className="w-10 h-10 rounded-2xl bg-primary-container/25 flex items-center justify-center text-primary active:scale-90 transition-transform"
                >
                  <span className="material-symbols-outlined fill text-xl">flight_takeoff</span>
                </button>
                <button
                  onClick={() => navigate(`/stations/${filtered[0].id}`)}
                  className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <span className="material-symbols-outlined fill text-primary text-xl">verified</span>
                </button>
              </div>
            </div>
            <h2 className="font-display text-[28px] font-extrabold tracking-tight text-foreground mb-0.5 leading-tight">{filtered[0].naam_msr}</h2>
            <p className="text-[14px] text-muted-foreground mb-5">{filtered[0].type_ruimte || "Station"} · {filtered[0].behuizingsnummer || "—"}</p>

            {/* Stat boxes — 2 columns like Saudia's "Terminal Readiness" / "Ground Crew" */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container/40 rounded-[20px] p-4">
                <div className="text-[10px] font-display font-extrabold uppercase tracking-[0.12em] text-muted-foreground mb-2">Categorieën</div>
                <div className="font-display text-[20px] font-extrabold text-primary leading-tight">
                  {new Set(filtered[0].fotos?.map((f: any) => f.categorie)).size} / {FOTO_CATEGORIEEN.length}
                </div>
              </div>
              <div className="bg-surface-container/40 rounded-[20px] p-4">
                <div className="text-[10px] font-display font-extrabold uppercase tracking-[0.12em] text-muted-foreground mb-2">Foto's</div>
                <div className="font-display text-[20px] font-extrabold text-primary leading-tight">
                  {filtered[0].fotos?.length ?? 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Station Audits section */}
        <div className="bg-card rounded-[28px] overflow-hidden shadow-sm border border-outline-variant/8 mb-6">
          <div className="p-6 pb-4">
            <h2 className="font-display text-[22px] font-extrabold text-foreground mb-4">Station Audits</h2>

            {/* Operational Completion badge + progress — gold pill like Saudia */}
            {!isLoading && stations && stations.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-display font-extrabold uppercase tracking-[0.14em] text-amber-800 bg-amber-100 px-4 py-1.5 rounded-full">
                    Operationeel Overzicht
                  </span>
                  <span className="font-display text-[18px] font-extrabold text-primary">
                    {completedStations} / {totalStations}
                  </span>
                </div>
                {/* Progress bar with bolt icon — like Saudia's airplane on the bar */}
                <div className="relative h-2.5 bg-surface-container rounded-full overflow-visible">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700"
                    style={{ width: `${overallPct}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md z-10"
                    style={{ left: `${Math.max(6, overallPct)}%` }}
                  >
                    <span className="material-symbols-outlined fill text-primary-foreground text-[12px]">bolt</span>
                  </div>
                </div>
                <p className="text-[13px] text-muted-foreground mt-3 italic leading-relaxed">
                  {totalStations - completedStations} stations resterend voor volledige oplevering.
                </p>
              </div>
            )}
          </div>

          {/* Station list — clean rows like Saudia's Riyadh/London/Paris list */}
          {isLoading ? (
            <div className="px-6 pb-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-[20px] bg-surface-low/60">
                  <Skeleton className="w-5 h-5 rounded-full" />
                  <Skeleton className="h-5 flex-1" />
                </div>
              ))}
            </div>
          ) : filtered?.length === 0 ? (
            <div className="px-6 pb-10 text-center text-muted-foreground text-[15px]">
              {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
            </div>
          ) : (
            <div className="px-4 pb-4 space-y-2">
              {filtered?.map((station) => {
                const uniqueCategories = new Set(
                  station.fotos?.map((f: { categorie: string }) => f.categorie)
                );
                const cats = uniqueCategories.size;
                const pct = Math.round((cats / FOTO_CATEGORIEEN.length) * 100);
                const complete = cats === FOTO_CATEGORIEEN.length;
                const totalFotos = station.fotos?.length ?? 0;
                const isExpanded = expandedId === station.id;

                return (
                  <div key={station.id} className="overflow-hidden">
                    {/* Station row — like Saudia's station list items */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : station.id)}
                      className={`w-full flex items-center justify-between px-5 py-4 rounded-[20px] transition-all text-left active:scale-[0.99] ${
                        isExpanded
                          ? "bg-surface-container/50 rounded-b-none"
                          : "bg-surface-low/50 hover:bg-surface-container/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-display text-[16px] font-bold text-foreground">{station.naam_msr}</span>
                        {station.behuizingsnummer && (
                          <span className="text-[13px] text-muted-foreground ml-2">({station.behuizingsnummer})</span>
                        )}
                      </div>
                      {/* Status icon — filled green check like Saudia, or dots for incomplete */}
                      <span className={`material-symbols-outlined text-[22px] ${
                        complete ? "fill text-primary" : "text-muted-foreground/30"
                      }`}>
                        {complete ? "check_circle" : "more_horiz"}
                      </span>
                    </button>

                    {/* Expanded actions */}
                    {isExpanded && (
                      <div className="bg-surface-container/50 rounded-b-[20px] px-5 pb-4 pt-2 animate-fade-up">
                        {/* Stats row */}
                        <div className="flex items-center gap-4 mb-3 text-[12px] text-muted-foreground">
                          {station.datum && <span>{station.datum}</span>}
                          <span>{totalFotos} foto's</span>
                          <span>{cats}/{FOTO_CATEGORIEEN.length} categorieën</span>
                        </div>

                        {/* Progress bar */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-1 h-1.5 bg-outline-variant/15 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-display text-[12px] font-extrabold text-primary">{pct}%</span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/stations/${station.id}`)}
                            className="flex-1 min-h-[50px] bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-2xl font-display text-[15px] font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                          >
                            <span className="material-symbols-outlined text-lg">edit_note</span>
                            Invullen
                          </button>
                          <button
                            onClick={() => openPdf(station)}
                            className="h-[50px] w-[50px] flex items-center justify-center rounded-2xl bg-card border border-outline-variant/12 shadow-sm active:scale-[0.95] transition-transform flex-shrink-0"
                            title="Rapport downloaden"
                          >
                            <span className="material-symbols-outlined text-destructive/70 text-xl">picture_as_pdf</span>
                          </button>
                          <button
                            onClick={async () => {
                              const stationFotos = (station.fotos ?? []).map((f: any) => ({ id: f.id, categorie: f.categorie, url: f.url }));
                              if (stationFotos.length === 0) { toast("Geen foto's om te downloaden"); return; }
                              setZipProgress(0);
                              try {
                                await downloadStationZip(station.naam_msr, stationFotos, (pct) => setZipProgress(pct));
                                toast.success("ZIP gedownload ✓");
                              } catch { toast.error("ZIP downloaden mislukt"); }
                              setZipProgress(null);
                            }}
                            disabled={zipProgress !== null}
                            className="relative h-[50px] w-[50px] flex items-center justify-center rounded-2xl bg-card border border-outline-variant/12 shadow-sm active:scale-[0.95] transition-transform flex-shrink-0 disabled:opacity-60 overflow-hidden"
                            title="Foto's als ZIP downloaden"
                          >
                            {zipProgress !== null && (
                              <div className="absolute bottom-0 left-0 right-0 bg-primary/10 transition-all duration-300" style={{ height: `${zipProgress}%` }} />
                            )}
                            <span className="material-symbols-outlined text-tertiary text-xl relative z-10">
                              {zipProgress !== null ? "downloading" : "folder_zip"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
