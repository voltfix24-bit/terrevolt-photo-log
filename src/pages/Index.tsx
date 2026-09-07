import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getApplicableCategories } from "@/lib/categories";
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
import { requirePin } from "@/lib/require-pin";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMonteur, setFilterMonteur] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'datum_desc' | 'datum_asc' | 'naam'>('datum_desc');
  const [showFilters, setShowFilters] = useState(false);
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

  const uniqueMonteurs = useMemo(() => {
    const names = stations?.map(s => s.ingevuld_door).filter(Boolean) as string[] ?? [];
    return [...new Set(names)].sort();
  }, [stations]);

  const hasActiveFilters = filterType !== 'all' || filterMonteur !== 'all' || sortBy !== 'datum_desc';

  const filtered = useMemo(() => {
    if (!stations) return [];
    let result = stations.filter(s => {
      const matchSearch = !search ||
        s.naam_msr.toLowerCase().includes(search.toLowerCase()) ||
        s.behuizingsnummer?.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || s.type_ruimte === filterType;
      const matchMonteur = filterMonteur === 'all' || s.ingevuld_door === filterMonteur;
      return matchSearch && matchType && matchMonteur;
    });
    result = [...result].sort((a, b) => {
      if (sortBy === 'naam') return a.naam_msr.localeCompare(b.naam_msr);
      if (sortBy === 'datum_asc') return (a.datum || '').localeCompare(b.datum || '');
      return (b.datum || '').localeCompare(a.datum || '');
    });
    return result;
  }, [stations, search, filterType, filterMonteur, sortBy]);

  const { data: instellingenData } = useInstellingen();

  const openPdf = async (station: any) => {
    const fotos = station.fotos ?? [];
    const { data: opmerkingen } = await supabase.from('categorie_opmerkingen').select('categorie, opmerking').eq('station_id', station.id);
    const html = generatePdfHtml(station, fotos, instellingenData ?? undefined, opmerkingen ?? undefined);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const handleDeleteStation = async (stationId: string, naam?: string) => {
    const ok = await requirePin(
      "Station verwijderen",
      naam ? `Voer de toegangscode in om "${naam}" te verwijderen.` : "Voer de toegangscode in om dit station te verwijderen.",
    );
    if (!ok) return;
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

        {/* ── Search + Filter ── */}
        <div className="relative -mt-3 mb-5">
          <div className="flex gap-2">
            <div className="relative flex-1 bg-surface-white rounded-[22px] shadow-[0_8px_32px_-8px_rgba(19,30,18,0.08)] border border-outline-variant/6 overflow-hidden">
              <span className="material-symbols-rounded absolute left-5 top-1/2 -translate-y-1/2 text-primary/35 text-[22px]">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Zoek op naam of behuizingsnummer..."
                className="w-full bg-transparent border-none rounded-[22px] py-[18px] pl-14 pr-5 text-[15px] focus:ring-0 focus:outline-none transition-all placeholder:text-text-faint font-display font-medium text-text-primary"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-[52px] h-[52px] rounded-[18px] flex items-center justify-center flex-shrink-0 border transition-all active:scale-95 ${
                showFilters || hasActiveFilters
                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25'
                  : 'bg-surface-white text-muted-foreground border-outline-variant/20 shadow-sm'
              }`}
            >
              <span className="material-symbols-rounded text-xl">tune</span>
            </button>
          </div>

          {showFilters && (
            <div className="mt-2 bg-card rounded-2xl border border-outline-variant/15 shadow-sm p-4 space-y-4 animate-fade-up">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Type station</div>
                <div className="flex gap-2">
                  {[
                    { value: 'all', label: 'Alle' },
                    { value: 'Compact Station', label: 'Compact' },
                    { value: 'Betreedbaar station', label: 'Betreedbaar' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFilterType(opt.value)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        filterType === opt.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-surface-low text-muted-foreground hover:bg-surface-container'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {uniqueMonteurs.length > 0 && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Monteur</div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setFilterMonteur('all')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        filterMonteur === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-low text-muted-foreground'
                      }`}
                    >
                      Alle
                    </button>
                    {uniqueMonteurs.map(monteur => (
                      <button
                        key={monteur}
                        onClick={() => setFilterMonteur(monteur)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                          filterMonteur === monteur
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-low text-muted-foreground'
                        }`}
                      >
                        {monteur}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Sortering</div>
                <div className="flex gap-2">
                  {[
                    { value: 'datum_desc', label: 'Nieuwste eerst' },
                    { value: 'datum_asc', label: 'Oudste eerst' },
                    { value: 'naam', label: 'Naam A-Z' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value as typeof sortBy)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        sortBy === opt.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-low text-muted-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterType('all'); setFilterMonteur('all'); setSortBy('datum_desc'); }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-muted-foreground bg-surface-container hover:bg-surface-high transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-rounded text-base">filter_alt_off</span>
                  Filters wissen
                </button>
              )}
            </div>
          )}
        </div>

        {(search || hasActiveFilters) && filtered && (
          <div className="text-xs text-muted-foreground mb-4 px-1">
            <span className="font-bold text-on-surface">{filtered.length}</span> station{filtered.length !== 1 ? 's' : ''} gevonden
          </div>
        )}

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
          (() => {
            const enriched = filtered.map((station: any) => {
              const applicable = getApplicableCategories(station);
              const uniqueCategories = new Set(
                station.fotos?.map((f: { categorie: string }) => f.categorie).filter((c: string) => applicable.some(ac => ac.name === c))
              );
              const cats = uniqueCategories.size;
              const pct = Math.round((cats / applicable.length) * 100);
              return { station, cats, pct, complete: cats === applicable.length };
            });

            const groups = [
              { key: 'bezig', label: 'In uitvoering', hint: 'gestart, nog niet compleet', items: enriched.filter(e => !e.complete && e.cats > 0) },
              { key: 'concept', label: 'Concept', hint: 'nog geen foto\'s', items: enriched.filter(e => e.cats === 0) },
              { key: 'klaar', label: 'Afgerond', hint: 'alle categorieën compleet', items: enriched.filter(e => e.complete) },
            ].filter(g => g.items.length > 0);

            return (
              <div className="space-y-6">
                {groups.map(group => (
                  <section key={group.key}>
                    {/* Group header bar */}
                    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-t-xl bg-surface-low border border-outline-variant/15">
                      <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.14em] text-text-primary">
                        {group.label}
                      </span>
                      <span className="text-[10px] font-bold text-text-secondary bg-surface-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {group.items.length}
                      </span>
                      <span className="text-[11px] text-text-muted font-medium truncate">{group.hint}</span>
                    </div>

                    {/* Column headers */}
                    <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-surface-white border-x border-b border-outline-variant/12 text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">
                      <span className="flex-1">Station / Behuizingsnummer</span>
                      <span className="w-24 text-center">Voortgang</span>
                      <span className="w-32 text-center">Monteur</span>
                      <span className="w-24 text-right">Type</span>
                    </div>

                    {/* Rows */}
                    <div className="bg-surface-white border-x border-b border-outline-variant/12 rounded-b-xl overflow-hidden">
                      {group.items.map(({ station, cats, pct, complete }, idx) => {
                        const isExpanded = expandedId === station.id;
                        return (
                          <div key={station.id} className={idx > 0 ? "border-t border-outline-variant/10" : ""}>
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : station.id)}
                              className={`w-full text-left transition-colors ${isExpanded ? 'bg-surface-low/60' : 'hover:bg-surface-low/40'}`}
                            >
                              <div className="flex items-center gap-3 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-display text-[14px] font-extrabold text-text-primary leading-tight tracking-[-0.01em] truncate uppercase">
                                    {station.naam_msr}
                                  </h3>
                                  <div className="text-[11px] text-text-muted font-mono mt-0.5 truncate">
                                    {station.behuizingsnummer || '—'}
                                  </div>
                                </div>

                                {/* Progress pill */}
                                <div className="w-24 flex justify-center flex-shrink-0">
                                  <span className={`text-[9px] font-extrabold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full font-display ${
                                    complete
                                      ? 'bg-accent-gold/15 text-accent-gold'
                                      : cats === 0
                                        ? 'bg-surface-low text-text-muted'
                                        : 'bg-primary/10 text-primary'
                                  }`}>
                                    {complete ? 'Afgerond' : cats === 0 ? 'Concept' : `${pct}%`}
                                  </span>
                                </div>

                                {/* Monteur */}
                                <div className="hidden sm:block w-32 text-center text-[11px] font-medium text-text-secondary truncate flex-shrink-0">
                                  {station.ingevuld_door || '—'}
                                </div>

                                {/* Type */}
                                <div className="hidden sm:block w-24 text-right flex-shrink-0">
                                  {station.type_ruimte && (
                                    <span className={`text-[9px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-full font-display ${
                                      station.type_ruimte === 'Compact Station' ? 'bg-orange/10 text-orange' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                      {station.type_ruimte === 'Compact Station' ? 'Compact' : 'Betreedbaar'}
                                    </span>
                                  )}
                                </div>

                                <span className={`material-symbols-rounded text-text-muted text-[18px] flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                                  expand_more
                                </span>
                              </div>
                            </button>

                            {/* Expanded action panel */}
                            {isExpanded && (
                              <div className="bg-surface-low/40 px-4 pb-4 pt-3 animate-fade-up border-t border-outline-variant/10">
                                <div className="flex gap-2.5">
                                  <button
                                    onClick={() => navigate(`/stations/${station.id}`)}
                                    className="flex-1 min-w-0 min-h-[44px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[15px] font-bold shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
                                  >
                                    <span className="material-symbols-rounded text-[18px] flex-shrink-0">edit_note</span>
                                    <span className="truncate">Invullen</span>
                                  </button>
                                  <button
                                    onClick={() => openPdf(station)}
                                    className="h-[44px] w-[44px] flex items-center justify-center rounded-2xl bg-surface-white hover:bg-surface transition-all active:scale-[0.93] flex-shrink-0"
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
                                        await downloadStationZip(station.naam_msr, stationFotos, (p) => setZipProgress(p));
                                        toast.success("ZIP gedownload ✓");
                                      } catch { toast.error("ZIP downloaden mislukt"); }
                                      setZipProgress(null);
                                    }}
                                    disabled={zipProgress !== null}
                                    className="relative h-[44px] w-[44px] flex items-center justify-center rounded-2xl bg-surface-white hover:bg-surface transition-all active:scale-[0.93] flex-shrink-0 disabled:opacity-60 overflow-hidden"
                                    title="Foto's als ZIP"
                                  >
                                    {zipProgress !== null && (
                                      <div className="absolute bottom-0 left-0 right-0 bg-primary/[0.12] transition-all duration-300 rounded-b-2xl" style={{ height: `${zipProgress}%` }} />
                                    )}
                                    <span className="material-symbols-rounded text-text-secondary text-[20px] relative z-10">
                                      {zipProgress !== null ? "downloading" : "folder_zip"}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStation(station.id, station.naam_msr)}
                                    className="h-[44px] w-[44px] flex items-center justify-center rounded-2xl bg-destructive/[0.06] hover:bg-destructive/[0.12] active:scale-[0.93] transition-all flex-shrink-0"
                                    title="Station verwijderen"
                                  >
                                    <span className="material-symbols-rounded text-destructive/70 text-[20px]">delete</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()
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
