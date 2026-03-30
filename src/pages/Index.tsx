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

  return (
    <div className="min-h-screen bg-primary-container/15 pb-28 md:pb-8">
      <main className="pt-20 pb-8 px-4 max-w-7xl mx-auto animate-fade-up">
        {/* Hero section — inspired by Saudia's "Network Stations" header */}
        <section className="mb-5 pt-4">
          <h1 className="text-[32px] font-extrabold tracking-tight text-primary leading-tight">Stations</h1>
          <p className="text-on-surface-variant text-[15px] mt-1">
            Beheer en monitor alle technische opleveringen.
          </p>
        </section>

        {/* Search bar — full width, rounded, with icon */}
        <div className="relative mb-6">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xl">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek station of behuizingsnummer..."
            className="w-full bg-card border border-outline-variant/20 rounded-2xl py-3.5 pl-12 pr-4 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Active hub card — featured station (latest) */}
        {!isLoading && filtered && filtered.length > 0 && !search && (
          <div className="bg-card rounded-3xl p-5 shadow-sm border border-outline-variant/10 mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-primary">Actief Station</span>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/stations/${filtered[0].id}`)}
                  className="w-9 h-9 rounded-xl bg-primary-container/40 flex items-center justify-center text-primary active:scale-90 transition-transform"
                >
                  <span className="material-symbols-outlined text-xl">edit_note</span>
                </button>
                <button
                  onClick={() => navigate("/instellingen")}
                  className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform"
                >
                  <span className="material-symbols-outlined fill text-xl">settings</span>
                </button>
              </div>
            </div>
            <h2 className="text-[24px] font-extrabold tracking-tight text-on-surface mb-0.5">{filtered[0].naam_msr}</h2>
            <p className="text-[13px] text-muted-foreground mb-4">{filtered[0].type_ruimte || "Station"} · {filtered[0].behuizingsnummer || "—"}</p>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-primary-container/20 rounded-2xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Categorieën</div>
                <div className="text-[18px] font-extrabold text-primary">
                  {new Set(filtered[0].fotos?.map((f: any) => f.categorie)).size} / {FOTO_CATEGORIEEN.length}
                </div>
              </div>
              <div className="bg-primary-container/20 rounded-2xl p-3.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Foto's</div>
                <div className="text-[18px] font-extrabold text-primary">
                  {filtered[0].fotos?.length ?? 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Station Audits section */}
        <div className="bg-card rounded-3xl overflow-hidden shadow-sm border border-outline-variant/10 mb-5">
          <div className="p-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold text-on-surface">Alle Stations</h2>
              {!isLoading && (
                <span className="text-xs font-bold text-muted-foreground">{totalStations} totaal</span>
              )}
            </div>

            {/* Operational completion bar */}
            {!isLoading && stations && stations.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground bg-primary-container/30 px-3 py-1 rounded-full">
                    Operationeel Overzicht
                  </span>
                  <span className="text-sm font-extrabold text-primary">
                    {stations.filter(s => {
                      const cats = new Set(s.fotos?.map((f: any) => f.categorie)).size;
                      return cats === FOTO_CATEGORIEEN.length;
                    }).length} / {totalStations}
                  </span>
                </div>
                <div className="h-2 bg-primary-container/30 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700"
                    style={{
                      width: `${totalStations > 0 ? Math.round(
                        (stations.filter(s => new Set(s.fotos?.map((f: any) => f.categorie)).size === FOTO_CATEGORIEEN.length).length / totalStations) * 100
                      ) : 0}%`
                    }}
                  />
                  {/* Bolt icon on progress bar */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm"
                    style={{
                      left: `${totalStations > 0 ? Math.max(5, Math.round(
                        (stations.filter(s => new Set(s.fotos?.map((f: any) => f.categorie)).size === FOTO_CATEGORIEEN.length).length / totalStations) * 100
                      )) : 5}%`
                    }}
                  >
                    <span className="material-symbols-outlined fill text-primary-foreground text-[10px]">bolt</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Station list */}
          {isLoading ? (
            <div className="px-5 pb-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-surface-low">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered?.length === 0 ? (
            <div className="px-5 pb-8 text-center text-muted-foreground text-sm">
              {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
            </div>
          ) : (
            <div className="px-3 pb-3 space-y-1.5">
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
                    {/* Station row — clean list style like Saudia's station list */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : station.id)}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all text-left active:scale-[0.99] ${
                        isExpanded
                          ? "bg-primary-container/20 rounded-b-none"
                          : "bg-surface-low/60 hover:bg-surface-container"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-bold text-on-surface truncate">{station.naam_msr}</span>
                          {station.behuizingsnummer && (
                            <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">({station.behuizingsnummer})</span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            {station.datum && <span>{station.datum}</span>}
                            <span>{totalFotos} foto's</span>
                            <span>{cats}/{FOTO_CATEGORIEEN.length} cat.</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {!isExpanded && (
                          <span className="text-[11px] font-bold text-muted-foreground">{cats}/{FOTO_CATEGORIEEN.length}</span>
                        )}
                        <span className={`material-symbols-outlined text-xl transition-colors ${
                          complete ? "fill text-primary" : isExpanded ? "text-primary" : "text-muted-foreground/40"
                        }`}>
                          {complete ? "check_circle" : isExpanded ? "expand_less" : "more_horiz"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded actions */}
                    {isExpanded && (
                      <div className="bg-primary-container/20 rounded-b-2xl px-4 pb-3 pt-1 animate-fade-up">
                        {/* Progress bar */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1 h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] font-extrabold text-primary">{pct}%</span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/stations/${station.id}`)}
                            className="flex-1 min-h-[48px] bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-2xl text-[14px] font-bold shadow-md shadow-primary/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                          >
                            <span className="material-symbols-outlined text-lg">edit_note</span>
                            Invullen
                          </button>
                          <button
                            onClick={() => openPdf(station)}
                            className="h-12 w-12 flex items-center justify-center rounded-2xl bg-card border border-outline-variant/15 shadow-sm active:scale-[0.95] transition-transform flex-shrink-0"
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
                            className="relative h-12 w-12 flex items-center justify-center rounded-2xl bg-card border border-outline-variant/15 shadow-sm active:scale-[0.95] transition-transform flex-shrink-0 disabled:opacity-60 overflow-hidden"
                            title="Foto's als ZIP downloaden"
                          >
                            {zipProgress !== null && (
                              <div className="absolute bottom-0 left-0 right-0 bg-primary/10 transition-all duration-300 rounded-b-2xl" style={{ height: `${zipProgress}%` }} />
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
