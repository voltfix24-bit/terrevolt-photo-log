import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getApplicableCategories, type Category } from "@/lib/categories";
import { getPendingPhotos } from "@/lib/offline-queue";
import { useOnline } from "@/hooks/use-online";
import { useInstellingen } from "@/hooks/use-theme";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { requirePin } from "@/lib/require-pin";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type Filter = "mijn" | "bijna" | "klaar";
type SortOption = "bijna" | "recent" | "naam";
type PendingCounts = Record<string, number>;
const requiredPhotos = (category: Category) => category.id === 31 ? 3 : 1;
const SORT_STORAGE_KEY = "dashboard-sort";
const abbreviations = new Set(["ls", "ms", "to", "atr"]);

const formatStationName = (name: string) => name
  .toLocaleLowerCase("nl-NL")
  .replace(/(^|[\s\-/])([\p{L}\p{N}]+)/gu, (_match, prefix: string, word: string) => {
    if (abbreviations.has(word)) return `${prefix}${word.toUpperCase()}`;
    return `${prefix}${word.charAt(0).toLocaleUpperCase("nl-NL")}${word.slice(1)}`;
  });

const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnline();
  const { data: instellingenData } = useInstellingen();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("mijn");
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    const stored = localStorage.getItem(SORT_STORAGE_KEY);
    return stored === "recent" || stored === "naam" ? stored : "bijna";
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*, fotos(categorie, id, url, storage_path, created_at, uploaded_at)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    let mounted = true;
    const updatePending = async () => {
      const pending = await getPendingPhotos();
      if (!mounted) return;
      setPendingCounts(pending.reduce<PendingCounts>((counts, photo) => {
        counts[photo.stationId] = (counts[photo.stationId] ?? 0) + 1;
        return counts;
      }, {}));
    };
    updatePending();
    const interval = window.setInterval(updatePending, 3000);
    window.addEventListener("focus", updatePending);
    return () => { mounted = false; window.clearInterval(interval); window.removeEventListener("focus", updatePending); };
  }, [isOnline]);

  const enriched = useMemo(() => (stations ?? []).map((station) => {
    const applicable = getApplicableCategories(station);
    const photosByCategory = new Map<string, number>();
    for (const photo of station.fotos ?? []) photosByCategory.set(photo.categorie, (photosByCategory.get(photo.categorie) ?? 0) + 1);
    const total = applicable.reduce((sum, category) => sum + requiredPhotos(category), 0);
    const done = applicable.reduce((sum, category) => sum + Math.min(photosByCategory.get(category.name) ?? 0, requiredPhotos(category)), 0);
    const missing = applicable.map((category) => ({ ...category, missing: Math.max(requiredPhotos(category) - (photosByCategory.get(category.name) ?? 0), 0) })).filter((category) => category.missing > 0);
    const lastEdited = Math.max(dateValue(station.updated_at), dateValue(station.created_at), ...(station.fotos ?? []).map((photo) => Math.max(dateValue(photo.uploaded_at), dateValue(photo.created_at))));
    const stale = lastEdited > 0 && Date.now() - lastEdited > 7 * 24 * 60 * 60 * 1000;
    return { station, done, total, remaining: total - done, complete: done === total, progress: total > 0 ? Math.round((done / total) * 100) : 0, missing, pending: pendingCounts[station.id] ?? 0, lastEdited, stale };
  }), [stations, pendingCounts]);

  const counts = useMemo(() => ({ mijn: enriched.length, bijna: enriched.filter((item) => item.remaining > 0 && item.remaining <= 3).length, klaar: enriched.filter((item) => item.complete).length }), [enriched]);
  const filtered = useMemo(() => enriched.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || item.station.naam_msr.toLowerCase().includes(query) || item.station.behuizingsnummer?.toLowerCase().includes(query);
    const matchesFilter = activeFilter === "mijn" || (activeFilter === "bijna" && item.remaining > 0 && item.remaining <= 3) || (activeFilter === "klaar" && item.complete);
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortOption === "recent") return b.lastEdited - a.lastEdited;
    if (sortOption === "naam") return formatStationName(a.station.naam_msr).localeCompare(formatStationName(b.station.naam_msr), "nl-NL");
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return a.remaining - b.remaining || b.lastEdited - a.lastEdited;
  }), [activeFilter, enriched, search, sortOption]);
  const totalPending = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortOption);
  }, [sortOption]);

  useEffect(() => {
    if (counts[activeFilter] === 0 && activeFilter !== "mijn") setActiveFilter("mijn");
  }, [activeFilter, counts]);

  const openPdf = async (station: any) => {
    const { data: opmerkingen } = await supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", station.id);
    const html = generatePdfHtml(station, station.fotos ?? [], instellingenData ?? undefined, opmerkingen ?? undefined);
    const reportWindow = window.open("", "_blank");
    if (reportWindow) { reportWindow.document.write(html); reportWindow.document.close(); }
  };

  const shareStation = async (station: any) => {
    const url = `${window.location.origin}/stations/${station.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: `TO-foto's · ${station.naam_msr}`, text: `Bekijk station ${station.naam_msr}`, url }); } catch { /* geannuleerd */ }
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link gekopieerd");
  };

  const handleDeleteStation = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const unlocked = await requirePin("Station verwijderen", `Voer de toegangscode in om “${target.naam}” definitief te verwijderen.`);
    if (!unlocked) return;
    const { data: photos } = await supabase.from("fotos").select("storage_path").eq("station_id", target.id);
    if (photos?.length) {
      await supabase.storage.from("to-fotos").remove(photos.map((photo) => photo.storage_path));
      await supabase.from("fotos").delete().eq("station_id", target.id);
    }
    const { error } = await supabase.from("stations").delete().eq("id", target.id);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    setExpandedId(null);
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    toast.success("Station verwijderd");
  };

  const formatCreatedAt = (value?: string | null) => !value ? "Datum onbekend" : new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(value));

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-surface-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-rounded text-[21px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <h1 className="font-display text-[15px] font-semibold text-on-surface">TO-foto&apos;s</h1>
          </div>
          <div className={`flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-xs font-bold ${!isOnline ? "bg-surface-container text-text-secondary" : totalPending > 0 ? "bg-orange/10 text-orange" : "bg-primary/10 text-primary"}`}>
            <span className="material-symbols-rounded text-[17px]">{!isOnline ? "cloud_off" : totalPending > 0 ? "upload" : "cloud_done"}</span>
            <span>{!isOnline ? "Offline" : totalPending > 0 ? `${totalPending} wachten` : "Gesynct"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <div className="space-y-1.5 px-4 py-2">
          <label className="relative block">
            <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-text-muted">search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Naam of behuizingsnummer" className="min-h-[44px] w-full rounded-lg border border-outline-variant/25 bg-surface-white py-[7px] pl-10 pr-3 text-sm font-medium text-on-surface outline-none placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
          </label>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex shrink-0 gap-2">
              {([["mijn", "Mijn stations"], ["bijna", "Bijna klaar"], ["klaar", "Klaar"]] as const).filter(([value]) => counts[value] > 0).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setActiveFilter(value)} className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-bold transition-colors ${activeFilter === value ? "border-on-surface bg-on-surface text-primary-foreground" : "border-outline-variant/40 bg-transparent text-text-secondary"}`}>
                  {label}<span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${activeFilter === value ? "bg-surface-white/15" : "bg-surface-container"}`}>{counts[value]}</span>
                </button>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ml-auto flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-white px-3 text-xs font-bold text-text-secondary" aria-label="Sortering wijzigen">
                  <span className="material-symbols-rounded text-[18px]">sort</span>
                  {sortOption === "bijna" ? "Bijna klaar" : sortOption === "recent" ? "Laatst bewerkt" : "Naam A-Z"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSortOption("bijna")} className="min-h-[44px]">Bijna klaar</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortOption("recent")} className="min-h-[44px]">Laatst bewerkt</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSortOption("naam")} className="min-h-[44px]">Naam A-Z</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <section aria-label="Stations" className="border-y border-outline-variant/20 bg-surface-white">
          {isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-b border-outline-variant/15 px-4 py-3 last:border-b-0"><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-2/3" /></div>
          )) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm font-medium text-text-muted">Geen stations gevonden</div>
          ) : filtered.map(({ station, done, total, remaining, complete, progress, missing, pending, stale }) => {
            const isExpanded = expandedId === station.id;
            const displayName = formatStationName(station.naam_msr);
            return (
              <article key={station.id} className="border-b-[0.5px] border-border last:border-b-0">
                <button type="button" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : station.id)} className={`min-h-[68px] w-full px-4 pb-2 pt-2.5 text-left transition-colors ${isExpanded ? "bg-accent" : "bg-surface-white active:bg-surface-low"}`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_24px] items-center gap-2.5">
                    <div className="min-w-0"><h2 className="line-clamp-2 font-display text-sm font-extrabold leading-[18px] text-on-surface">{displayName}</h2><p className="mt-0.5 truncate text-[11px] text-text-muted"><span className="font-mono">{station.behuizingsnummer || "Geen nummer"}</span><span className="font-sans"> · {station.ingevuld_door || "Geen monteur"}</span></p></div>
                    <div className="text-right">
                      <div className={`flex items-center justify-end gap-1 text-xs font-extrabold ${pending > 0 ? "text-sync-pending" : complete ? "text-primary" : remaining >= 4 ? "text-attention" : "text-text-secondary"}`}>
                        {(pending > 0 || complete || stale) && <span className="material-symbols-rounded text-[16px]">{pending > 0 ? "upload" : complete ? "check_circle" : "schedule"}</span>}
                        <span>{pending > 0 ? `${pending} wachten` : complete ? "Klaar" : `${remaining} te gaan`}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] font-medium text-text-muted">{done} / {total}</div>
                    </div>
                    <span className={`material-symbols-rounded text-[20px] text-text-secondary transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
                  </div>
                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                </button>

                {isExpanded && (
                  <div className="border-t border-primary/10 bg-accent px-4 pb-4 pt-3 animate-fade-up">
                    <div className="mb-3"><div className="h-1.5 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs font-semibold text-text-secondary">{done} van {total} foto&apos;s · {complete ? "alles compleet" : `${remaining} te gaan`}</p></div>
                    {!complete && (
                      <div className="mb-4 overflow-hidden rounded-lg border border-primary/15 bg-surface-white">
                        <h3 className="px-3 pb-1 pt-3 text-xs font-extrabold text-on-surface">Nog nodig</h3>
                        <div className="divide-y divide-outline-variant/15">{missing.map((category) => (
                          <button key={category.id} type="button" onClick={() => navigate(`/stations/${station.id}?categorie=${category.id}`)} className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-xs font-semibold text-text-secondary active:bg-surface-low"><span className="truncate">{category.name} · {category.missing} {category.missing === 1 ? "foto" : "foto's"}</span><span className="material-symbols-rounded shrink-0 text-[18px] text-primary">arrow_forward</span></button>
                        ))}</div>
                      </div>
                    )}
                    <button type="button" onClick={() => complete ? openPdf(station) : navigate(`/stations/${station.id}`)} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-[13px] font-display text-sm font-bold text-primary-foreground active:bg-primary-hover"><span className="material-symbols-rounded text-[20px]">{complete ? "description" : "photo_camera"}</span>{complete ? "Rapport bekijken" : "Verder invullen"}</button>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => openPdf(station)} className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-white text-xs font-bold text-text-secondary active:bg-surface-low"><span className="material-symbols-rounded text-[18px]">description</span>Rapport</button>
                      <button type="button" onClick={() => shareStation(station)} className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-white text-xs font-bold text-text-secondary active:bg-surface-low"><span className="material-symbols-rounded text-[18px]">ios_share</span>Delen</button>
                    </div>
                    <div className="mt-3 flex min-h-[44px] items-center justify-between border-t border-primary/10 pt-2">
                      <p className="min-w-0 truncate pr-2 text-[10px] text-text-muted">Aangemaakt {formatCreatedAt(station.created_at)} · {station.ingevuld_door || "Onbekend"}</p>
                      <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-bold text-text-secondary" aria-label={`Meer acties voor ${station.naam_msr}`}><span className="material-symbols-rounded text-[19px]">more_horiz</span>Meer</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-[190px]"><DropdownMenuItem onSelect={() => setDeleteTarget({ id: station.id, naam: station.naam_msr })} className="min-h-[44px] gap-2 text-destructive focus:text-destructive"><span className="material-symbols-rounded text-[18px]">delete</span>Station verwijderen</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>

      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center border-t-[0.5px] border-border bg-background px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => navigate("/stations/new")} className="pointer-events-auto flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm active:bg-primary-hover"><span className="material-symbols-rounded text-[20px]">add</span>Nieuw station</button>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Station verwijderen?</AlertDialogTitle><AlertDialogDescription>Het station en alle bijbehorende foto&apos;s worden definitief verwijderd. Daarna wordt om de toegangscode gevraagd.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={handleDeleteStation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Verwijderen</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
