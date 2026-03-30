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

  const openPdf = (station: any) => {
    const fotos = station.fotos ?? [];
    const html = generatePdfHtml(station, fotos);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="min-h-screen bg-primary-container/15 pb-28 md:pb-8">
      <main className="pt-20 pb-8 px-4 max-w-7xl mx-auto animate-fade-up">
        {/* Header */}
        <section className="mb-5 pt-4">
          <h1 className="text-[28px] font-extrabold tracking-tight text-primary leading-tight">Stations</h1>
          <p className="text-muted-foreground text-[14px] mt-1">
            Beheer en monitor alle technische opleveringen.
          </p>
        </section>

        {/* Search */}
        <div className="relative mb-5">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xl">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek station of behuizingsnummer..."
            className="w-full bg-card border border-outline-variant/20 rounded-2xl py-3 pl-12 pr-4 text-sm shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Station cards */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-outline-variant/10">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
          </div>
        ) : (
          <div className="space-y-2.5">
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
                <div
                  key={station.id}
                  className="bg-card rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden"
                >
                  {/* Station card header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : station.id)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between active:bg-accent/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-foreground truncate">{station.naam_msr}</span>
                        {complete && (
                          <span className="material-symbols-outlined fill text-primary text-lg">check_circle</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[12px] text-muted-foreground">
                        {station.behuizingsnummer && <span className="font-mono">{station.behuizingsnummer}</span>}
                        {station.type_ruimte && <span>· {station.type_ruimte}</span>}
                        <span>· {totalFotos} foto's</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 ml-3 flex-shrink-0">
                      <span className="text-[12px] font-bold text-muted-foreground">{cats}/{FOTO_CATEGORIEEN.length}</span>
                      <span className={`material-symbols-outlined text-lg transition-transform ${isExpanded ? "rotate-180 text-primary" : "text-muted-foreground/50"}`}>
                        expand_more
                      </span>
                    </div>
                  </button>

                  {/* Progress bar — always visible */}
                  <div className="px-4 pb-1">
                    <div className="h-1 bg-primary-container/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Expanded actions */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 animate-fade-up">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/stations/${station.id}`)}
                          className="flex-1 min-h-[46px] bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-xl text-[14px] font-bold shadow-md shadow-primary/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                          Invullen
                        </button>
                        <button
                          onClick={() => openPdf(station)}
                          className="h-[46px] w-[46px] flex items-center justify-center rounded-xl bg-surface-low border border-outline-variant/15 active:scale-[0.95] transition-transform flex-shrink-0"
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
                          className="relative h-[46px] w-[46px] flex items-center justify-center rounded-xl bg-surface-low border border-outline-variant/15 active:scale-[0.95] transition-transform flex-shrink-0 disabled:opacity-60 overflow-hidden"
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
      </main>
    </div>
  );
}
