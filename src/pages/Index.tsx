import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { downloadStationZip } from "@/lib/zip-download";
import { toast } from "sonner";
import { useInstellingen } from "@/hooks/use-theme";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const queryClient = useQueryClient();

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

  const { data: instellingenData } = useInstellingen();

  const openPdf = (station: any) => {
    const fotos = station.fotos ?? [];
    const html = generatePdfHtml(station, fotos, instellingenData ?? undefined);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleDeleteStation = async (stationId: string) => {
    const { data: fotos } = await supabase.from("fotos").select("storage_path").eq("station_id", stationId);
    if (fotos && fotos.length > 0) {
      await supabase.storage.from("to-fotos").remove(fotos.map(f => f.storage_path));
      await supabase.from("fotos").delete().eq("station_id", stationId);
    }
    const { error } = await supabase.from("stations").delete().eq("id", stationId);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    toast.success("Station verwijderd");
    setExpandedId(null);
    queryClient.invalidateQueries({ queryKey: ["stations"] });
  };

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">

      {/* ── Branded hero canvas ── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-primary/[0.09] via-primary/[0.04] to-transparent pt-[88px] pb-12 px-6">
        {/* Decorative shapes */}
        <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-primary/[0.06] blur-xl" />
        <div className="absolute top-32 -left-24 w-40 h-40 rounded-full bg-primary-container/20 blur-2xl" />

        <div className="relative max-w-lg mx-auto animate-fade-up">
          {/* Eyebrow */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-2 h-2 rounded-full bg-accent-gold-bright" />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-accent-gold font-display">
              Technische Oplevering
            </span>
          </div>

          {/* Main title — editorial scale */}
          <h1 className="font-display text-[48px] font-extrabold tracking-[-0.035em] text-text-primary leading-[0.95] mb-4">
            TO-Foto's
          </h1>

          {/* Supporting text */}
          <p className="font-display text-[15px] font-medium text-text-secondary/50 leading-relaxed max-w-[280px]">
            Beheer en monitor alle technische opleveringen op één plek.
          </p>
        </div>
      </div>

      <main className="px-5 max-w-lg mx-auto animate-fade-up">

        {/* ── Search — editorial floating bar ── */}
        <div className="relative -mt-3 mb-9">
          <div className="relative bg-surface-white rounded-[22px] shadow-[0_8px_32px_-8px_rgba(19,30,18,0.08)] border border-outline-variant/6 overflow-hidden">
            <span className="material-symbols-rounded absolute left-5 top-1/2 -translate-y-1/2 text-primary/35 text-[22px]">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam of behuizingsnummer..."
              className="w-full bg-transparent border-none rounded-[22px] py-[18px] pl-14 pr-5 text-[15px] focus:ring-0 focus:outline-none transition-all placeholder:text-text-faint font-display font-medium text-text-primary"
            />
          </div>
        </div>

        {/* ── Station list ── */}
        {isLoading ? (
          <div className="space-y-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-[28px] bg-surface-white p-7 shadow-[0_4px_24px_-6px_rgba(19,30,18,0.06)]">
                <Skeleton className="h-4 w-2/5 mb-4 rounded-full" />
                <Skeleton className="h-6 w-4/5 mb-3 rounded-lg" />
                <Skeleton className="h-3 w-3/5 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-surface-low flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-rounded text-text-muted text-[32px]">search_off</span>
            </div>
            <p className="text-text-muted text-[15px] font-display font-medium">
              {search ? "Geen stations gevonden" : "Nog geen stations aangemaakt."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filtered?.map((station, idx) => {
              const uniqueCategories = new Set(
                station.fotos?.map((f: { categorie: string }) => f.categorie)
              );
              const cats = uniqueCategories.size;
              const pct = Math.round((cats / FOTO_CATEGORIEEN.length) * 100);
              const complete = cats === FOTO_CATEGORIEEN.length;
              const isExpanded = expandedId === station.id;

              return (
                <div key={station.id} className="rounded-[28px] overflow-hidden" style={{ animationDelay: `${idx * 50}ms` }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : station.id)}
                    className={`relative w-full text-left transition-all duration-300 active:scale-[0.99] overflow-hidden ${
                      isExpanded
                        ? "bg-surface-white shadow-[0_12px_48px_-12px_rgba(19,30,18,0.12)] rounded-t-[28px] rounded-b-none"
                        : "bg-surface-white hover:shadow-[0_12px_40px_-10px_rgba(19,30,18,0.10)] shadow-[0_4px_24px_-6px_rgba(19,30,18,0.06)] rounded-[28px]"
                    }`}
                  >
                    {/* Decorative background shapes */}
                    <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-primary/[0.03]" />
                    <div className="absolute bottom-0 right-16 w-24 h-24 rounded-full bg-accent-gold-soft/15" />

                    <div className="relative px-7 py-7">
                      {/* Top row: type label + completion badge */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="inline-flex items-center gap-1.5 bg-accent-gold/[0.07] rounded-full px-3.5 py-1.5">
                          <span className="material-symbols-rounded text-accent-gold text-[13px]">person</span>
                          <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-accent-gold font-display">
                            {station.ingevuld_door || "Monteur"}
                          </span>
                        </div>
                        {complete && (
                          <div className="w-9 h-9 rounded-full bg-accent-gold-bright/15 flex items-center justify-center">
                            <span className="material-symbols-rounded text-accent-gold text-[20px]">verified</span>
                          </div>
                        )}
                      </div>

                      {/* Station name — Manrope editorial */}
                      <h3 className="font-display text-[26px] font-extrabold text-text-primary leading-[1.08] tracking-[-0.02em] mb-1.5">
                        {station.naam_msr}
                      </h3>

                      {/* Subtitle */}
                      {station.behuizingsnummer && (
                        <p className="font-display text-[13px] text-text-muted font-medium mb-5">{station.behuizingsnummer}</p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-2">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-primary/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-display text-xs font-extrabold text-text-primary flex-shrink-0">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded action panel */}
                  {isExpanded && (
                    <div className="bg-surface-white rounded-b-[28px] px-7 pb-7 pt-3 shadow-[0_12px_48px_-12px_rgba(19,30,18,0.12)] animate-fade-up border-t border-outline-variant/5">
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => navigate(`/stations/${station.id}`)}
                          className="flex-1 min-w-0 min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[15px] font-bold shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
                        >
                          <span className="material-symbols-rounded text-[18px] flex-shrink-0">edit_note</span>
                          <span className="truncate">Invullen</span>
                        </button>
                        <button
                          onClick={() => openPdf(station)}
                          className="h-[52px] w-[48px] flex items-center justify-center rounded-2xl bg-surface-low hover:bg-surface transition-all active:scale-[0.93] flex-shrink-0"
                          title="PDF rapport"
                        >
                          <span className="material-symbols-rounded text-text-secondary text-[20px]">description</span>
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
                          className="relative h-[52px] w-[48px] flex items-center justify-center rounded-2xl bg-surface-low hover:bg-surface transition-all active:scale-[0.93] flex-shrink-0 disabled:opacity-60 overflow-hidden"
                          title="Foto's als ZIP"
                        >
                          {zipProgress !== null && (
                            <div className="absolute bottom-0 left-0 right-0 bg-primary/[0.12] transition-all duration-300 rounded-b-2xl" style={{ height: `${zipProgress}%` }} />
                          )}
                          <span className="material-symbols-rounded text-text-secondary text-[20px] relative z-10">
                            {zipProgress !== null ? "downloading" : "folder_zip"}
                          </span>
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="h-[52px] w-[48px] flex items-center justify-center rounded-2xl bg-destructive/[0.06] hover:bg-destructive/[0.12] active:scale-[0.93] transition-all flex-shrink-0"
                              title="Station verwijderen"
                            >
                              <span className="material-symbols-rounded text-destructive/70 text-[20px]">delete</span>
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Station verwijderen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Alle foto's en gegevens van <strong>{station.naam_msr}</strong> worden permanent verwijderd. Dit kan niet ongedaan worden gemaakt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteStation(station.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Verwijderen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Brand footer */}
        <div className="mt-16 pb-4 text-center">
          <span className="font-display text-[12px] font-extrabold text-primary/15 tracking-tight">TerreVolt</span>
          <div className="font-display text-[8px] font-medium uppercase tracking-[0.2em] text-text-faint/40 mt-0.5">Technische Oplevering</div>
        </div>
      </main>
    </div>
  );
}
