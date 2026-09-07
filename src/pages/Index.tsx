import { useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "sonner";

type PendingCounts = Record<string, number>;
const requiredPhotos = (category: Category) => category.id === 31 ? 3 : 1;
const abbreviations = new Set(["ls", "ms", "to", "atr"]);
const GREEN = "#1F5C3A";

const formatStationName = (name: string) => name
  .toLocaleLowerCase("nl-NL")
  .replace(/(^|[\s\-/])([\p{L}\p{N}]+)/gu, (_match, prefix: string, word: string) => {
    if (abbreviations.has(word)) return `${prefix}${word.toUpperCase()}`;
    return `${prefix}${word.charAt(0).toLocaleUpperCase("nl-NL")}${word.slice(1)}`;
  });

const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;

const relatieveDatum = (value?: string | null) => {
  if (!value) return "—";
  const dagen = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (dagen <= 0) return "Vandaag";
  if (dagen === 1) return "Gisteren";
  if (dagen < 7) return `${dagen} dgn`;
  if (dagen < 30) return `${Math.floor(dagen / 7)} wk`;
  return `${Math.floor(dagen / 30)} mnd`;
};

function ActieKnop({ icon, label, onClick, variant = "neutraal" }: { icon: string; label: string; onClick: () => void; variant?: "neutraal" | "gevaar" }) {
  const rood = variant === "gevaar";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex w-[54px] min-h-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border transition-transform active:scale-[0.97]"
      style={{ background: rood ? "#FBEDEC" : "#FFFFFF", borderColor: rood ? "#F0D2CF" : "#DCE3DC", color: rood ? "#B3352C" : GREEN }}
    >
      <span className="material-symbols-rounded text-[21px]">{icon}</span>
      <span className="text-[10px]" style={{ color: rood ? "#B3352C" : "#3D3D3D" }}>{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnline();
  const { data: instellingenData } = useInstellingen();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const enriched = useMemo(() => (stations ?? []).map((station) => {
    const applicable = getApplicableCategories(station);
    const photosByCategory = new Map<string, number>();
    for (const photo of station.fotos ?? []) photosByCategory.set(photo.categorie, (photosByCategory.get(photo.categorie) ?? 0) + 1);
    const total = applicable.reduce((sum, category) => sum + requiredPhotos(category), 0);
    const done = applicable.reduce((sum, category) => sum + Math.min(photosByCategory.get(category.name) ?? 0, requiredPhotos(category)), 0);
    return { station, done, total, remaining: total - done, complete: done === total && total > 0, pending: pendingCounts[station.id] ?? 0, createdAt: dateValue(station.created_at) };
  }), [stations, pendingCounts]);

  const filtered = useMemo(() => enriched.filter((item) => {
    const query = search.trim().toLowerCase();
    return !query || item.station.naam_msr.toLowerCase().includes(query) || item.station.behuizingsnummer?.toLowerCase().includes(query);
  }).sort((a, b) => b.createdAt - a.createdAt), [enriched, search]);

  const totalPending = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0);

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

  const syncLabel = !isOnline ? "Offline" : totalPending > 0 ? `${totalPending} wachten` : "Gesynct";
  const syncIcon = !isOnline ? "cloud_off" : totalPending > 0 ? "cloud_upload" : "cloud_done";

  return (
    <div className="flex min-h-screen flex-col bg-home">
      <header className="flex items-center justify-between border-b border-[#E3E8E3] bg-home px-4 pb-2 pt-[10px]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-[22px] w-[20px] shrink-0 items-center justify-center" aria-hidden="true">
            <span className="material-symbols-rounded text-[20px]" style={{ color: GREEN, fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-accent-gold-bright" />
          </span>
          <div>
            <div className="text-[11px] leading-none" style={{ color: GREEN }}>TerreVolt</div>
            <h1 className="font-display text-[19px] font-medium leading-tight text-[#0A0A0A]">TO-foto&apos;s</h1>
          </div>
        </div>
        <div className="flex items-center gap-[6px] rounded-full px-3 py-[6px]" style={{ background: totalPending > 0 ? "#EAF1FA" : "#E7F3E4" }}>
          <span className="material-symbols-rounded text-[16px]" style={{ color: totalPending > 0 ? "#1A4E8A" : GREEN }}>{syncIcon}</span>
          <span className="text-[13px]" style={{ color: totalPending > 0 ? "#1A4E8A" : GREEN }}>{syncLabel}</span>
        </div>
      </header>

      <div className="flex items-center gap-[7px] bg-home px-4 pb-[7px] pt-[11px]">
        <span className="material-symbols-rounded text-[15px] text-[#3D3D3D]">schedule</span>
        <span className="text-[13px] text-[#3D3D3D]">Nieuwste opdrachten eerst</span>
      </div>

      <main className="flex-1 px-3 pb-[104px]">
        {isLoading ? Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="mb-[10px] rounded-[16px] border border-[#DCE3DC] bg-white p-4"><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-2/3" /></div>
        )) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center text-[15px] text-[#4A4A4A]">Geen stations gevonden</div>
        ) : filtered.map(({ station, done, total, remaining, complete, pending }) => {
          const open = expandedId === station.id;
          return (
            <div key={station.id} className="mb-[10px] overflow-hidden rounded-[16px] bg-white shadow-sm" style={{ border: open ? `2px solid ${GREEN}` : "0.5px solid #DCE3DC" }}>
              <button type="button" aria-expanded={open} onClick={() => setExpandedId(open ? null : station.id)} className="w-full px-4 py-[15px] text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-display text-[18px] font-medium leading-tight text-[#0A0A0A]">{formatStationName(station.naam_msr)}</h2>
                    <p className="mt-[3px] truncate font-mono text-[14px] text-[#4A4A4A]">{station.behuizingsnummer || "Geen nummer"}</p>
                    <p className="mt-[2px] truncate text-[14px] text-[#4A4A4A]">{station.ingevuld_door || "Geen monteur"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap rounded-full px-[10px] py-[5px] text-[13px]" style={open ? { background: "#DCEDD6", color: GREEN } : { background: "#F0F2F0", color: "#4A4A4A" }}>{relatieveDatum(station.created_at)}</span>
                    <span className="material-symbols-rounded text-[20px] text-[#3D3D3D]">{open ? "expand_less" : "expand_more"}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {pending > 0 ? (
                    <span className="flex items-center gap-[7px] text-[16px]" style={{ color: "#1A4E8A" }}><span className="material-symbols-rounded text-[18px]">cloud_upload</span>{pending} wachten</span>
                  ) : complete ? (
                    <span className="text-[16px] font-medium" style={{ color: GREEN }}>Klaar</span>
                  ) : (
                    <span className="text-[16px] text-[#0A0A0A]">{remaining} {remaining === 1 ? "taak" : "taken"} te gaan</span>
                  )}
                  <span className="shrink-0 font-mono text-[15px] text-[#5A5A5A]">{done} / {total}</span>
                </div>
              </button>

              {open && (
                <div className="flex items-stretch gap-2 px-3 pb-[13px]">
                  <button type="button" onClick={() => navigate(`/stations/${station.id}`)} className="flex min-h-[54px] flex-1 items-center justify-center gap-[9px] rounded-[14px] px-[10px] py-[15px] text-[17px] font-medium text-white transition-transform active:scale-[0.98]" style={{ background: GREEN }}>
                    <span className="material-symbols-rounded text-[20px]">photo_camera</span>Invullen
                  </button>
                  <ActieKnop icon="description" label="Pdf" onClick={() => openPdf(station)} />
                  <ActieKnop icon="ios_share" label="Delen" onClick={() => shareStation(station)} />
                  <ActieKnop icon="delete" label="Wis" variant="gevaar" onClick={() => setDeleteTarget({ id: station.id, naam: station.naam_msr })} />
                </div>
              )}
            </div>
          );
        })}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-[10px] border-t bg-home/82 px-3 pt-[10px] backdrop-blur-[20px]" style={{ borderColor: "rgba(0,0,0,0.06)", paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
        {searchOpen || search ? (
          <label className="relative flex-1">
            <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-[19px] text-[#5A5A5A]">search</span>
            <input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} onBlur={() => { if (!search) setSearchOpen(false); }} placeholder="Zoek station" className="min-h-[52px] w-full rounded-[26px] border py-[14px] pl-11 pr-4 text-[16px] text-[#0A0A0A] outline-none placeholder:text-[#6A6A6A]" style={{ background: "rgba(255,255,255,0.9)", borderColor: "rgba(0,0,0,0.08)" }} />
          </label>
        ) : (
          <button type="button" onClick={() => setSearchOpen(true)} className="flex min-h-[52px] flex-1 items-center gap-[10px] rounded-[26px] border px-4 py-[14px] text-left" style={{ background: "rgba(255,255,255,0.9)", borderColor: "rgba(0,0,0,0.08)" }}>
            <span className="material-symbols-rounded text-[19px] text-[#5A5A5A]">search</span>
            <span className="text-[16px] text-[#6A6A6A]">Zoek station</span>
          </button>
        )}
        <button type="button" onClick={() => navigate("/stations/new")} aria-label="Nieuw station" className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.97]" style={{ background: GREEN }}>
          <span className="material-symbols-rounded text-[24px] text-white">add</span>
        </button>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Station verwijderen?</AlertDialogTitle><AlertDialogDescription>Het station en alle bijbehorende foto&apos;s worden definitief verwijderd. Daarna wordt om de toegangscode gevraagd.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={handleDeleteStation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Verwijderen</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
