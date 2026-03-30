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
    <div className="min-h-screen bg-surface pb-28 md:pb-8">
      <main className="pt-20 pb-8 px-5 max-w-lg mx-auto animate-fade-up">
        {/* Hero header — Saudia style */}
        <section className="mb-8 pt-6">
          <h1 className="font-display text-[38px] font-extrabold tracking-tight text-primary leading-[1.05]">
            Stations
          </h1>
          <p className="text-on-surface-variant text-[15px] mt-2 leading-relaxed">
            Beheer en monitor alle technische opleveringen.
          </p>
        </section>

        {/* Search — large pill */}
        <div className="relative mb-8">
          <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[22px]">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek station of behuizingsnummer..."
            className="w-full bg-primary-container/12 border-none rounded-2xl py-4.5 pl-14 pr-5 text-[15px] focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all placeholder:text-on-surface-variant/40 font-medium text-on-surface"
          />
        </div>

        {/* Station cards */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-5 rounded-3xl bg-primary-container/8">
                <Skeleton className="h-5 w-3/4 mb-3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="py-20 text-center text-on-surface-variant text-[15px]">
            {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
          </div>
        ) : (
          <div className="space-y-3">
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
                <div key={station.id} className="rounded-3xl overflow-hidden">
                  {/* Station card */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : station.id)}
                    className={`w-full text-left px-5 py-5 transition-all active:scale-[0.99] ${
                      isExpanded
                        ? "bg-card shadow-md rounded-t-3xl rounded-b-none"
                        : "bg-primary-container/10 hover:bg-primary-container/18 rounded-3xl"
                    }`}
                  >
                    {/* Top: label + badge */}
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
                        {station.type_ruimte || "Station"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {complete && (
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined fill text-primary text-[18px]">check_circle</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Name — large */}
                    <h3 className="font-display text-[22px] font-extrabold text-on-surface leading-tight tracking-tight">
                      {station.naam_msr}
                    </h3>

                    {/* Subtitle */}
                    {station.behuizingsnummer && (
                      <p className="text-[13px] text-on-surface-variant mt-0.5">{station.behuizingsnummer}</p>
                    )}

                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 h-1.5 bg-on-surface/8 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-extrabold text-primary font-display">{pct}%</span>
                    </div>
                  </button>

                  {/* Expanded action panel */}
                  {isExpanded && (
                    <div className="bg-card rounded-b-3xl px-5 pb-5 pt-1 shadow-md animate-fade-up">
                      {/* Meta row */}
                      <div className="flex items-center gap-3 mb-4 text-[12px] text-on-surface-variant">
                        {station.datum && <span>{station.datum}</span>}
                        <span>{totalFotos} foto's</span>
                        <span>{cats}/{FOTO_CATEGORIEEN.length} cat.</span>
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/stations/${station.id}`)}
                          className="flex-1 min-h-[52px] bg-primary text-primary-foreground rounded-2xl font-display text-[15px] font-bold shadow-lg shadow-primary/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-lg">edit_note</span>
                          Invullen
                        </button>
                        <button
                          onClick={() => openPdf(station)}
                          className="h-[52px] w-[52px] flex items-center justify-center rounded-2xl bg-primary-container/15 active:scale-[0.95] transition-transform flex-shrink-0"
                          title="PDF rapport"
                        >
                          <span className="material-symbols-outlined text-primary/70 text-xl">picture_as_pdf</span>
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
                          className="relative h-[52px] w-[52px] flex items-center justify-center rounded-2xl bg-primary-container/15 active:scale-[0.95] transition-transform flex-shrink-0 disabled:opacity-60 overflow-hidden"
                          title="Foto's als ZIP"
                        >
                          {zipProgress !== null && (
                            <div className="absolute bottom-0 left-0 right-0 bg-primary/15 transition-all duration-300" style={{ height: `${zipProgress}%` }} />
                          )}
                          <span className="material-symbols-outlined text-primary/70 text-xl relative z-10">
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
