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

const C = {
  bg: "#E8F2E2",
  green: "#1F5C3A",
  cardBorder: "rgba(31,92,58,0.16)",
  soft: "#F2F6F1",
  softBorder: "#D4DFD2",
  danger: "#B3352C",
  dangerBg: "#FBEDEC",
  dangerBorder: "#F0D2CF",
  upload: "#1A4E8A",
};

const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";
const EASE = "cubic-bezier(0.22,1,0.36,1)";

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

function DrukKnop({ children, style, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ingedrukt, setIngedrukt] = useState(false);
  return (
    <button
      type="button"
      {...rest}
      className={className}
      onPointerDown={() => setIngedrukt(true)}
      onPointerUp={() => setIngedrukt(false)}
      onPointerLeave={() => setIngedrukt(false)}
      onPointerCancel={() => setIngedrukt(false)}
      style={{
        transform: ingedrukt ? "scale(0.94)" : "scale(1)",
        transition: `transform 0.14s ${SPRING}`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function ActieKnop({ icon, label, onClick, variant = "neutraal" }: { icon: string; label: string; onClick: () => void; variant?: "neutraal" | "gevaar" }) {
  const rood = variant === "gevaar";
  return (
    <DrukKnop
      onClick={onClick}
      aria-label={label}
      style={{
        width: 56, minHeight: 56, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 12,
        background: "transparent",
        border: "none",
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 21, color: rood ? C.danger : C.green }}>{icon}</span>
      <span style={{ fontSize: 10, color: rood ? C.danger : "#3D3D3D" }}>{label}</span>
    </DrukKnop>
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
  const [gekrompen, setGekrompen] = useState(false);
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

  useEffect(() => {
    const onScroll = () => {
      const top = window.scrollY;
      setGekrompen((vorige) => (vorige ? top > 12 : top > 28));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
  const syncColor = !isOnline || totalPending > 0 ? C.upload : C.green;

  const glas = {
    WebkitBackdropFilter: "saturate(180%) blur(24px)",
    backdropFilter: "saturate(180%) blur(24px)",
  } as const;

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <header
        className="tv-glas fixed inset-x-0 top-0 z-30"
        style={{
          height: gekrompen ? 48 : 62,
           background: "rgba(232,242,226,0.8)",
          borderBottom: "0.5px solid rgba(31,92,58,0.14)",
          transition: `height 0.32s ${EASE}`,
          paddingTop: "env(safe-area-inset-top)",
          ...glas,
        }}
      >
        <div className="flex h-full items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-[9px]">
            <span className="relative flex h-[22px] w-[20px] shrink-0 items-center justify-center" aria-hidden="true">
              <span className="material-symbols-rounded" style={{ fontSize: 20, color: C.green, fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-accent-gold-bright" />
            </span>
            <div className="min-w-0">
              <div
                aria-hidden={gekrompen}
                style={{
                  fontSize: 11, color: C.green, lineHeight: 1.1, overflow: "hidden",
                  height: gekrompen ? 0 : 13,
                  opacity: gekrompen ? 0 : 1,
                  transition: `height 0.32s ${EASE}, opacity 0.22s ease`,
                }}
              >
                TerreVolt
              </div>
              <h1
                className="font-display"
                style={{
                  fontWeight: 500, color: "#0A2A18", lineHeight: 1.2,
                  fontSize: gekrompen ? 17 : 20,
                  transition: `font-size 0.32s ${EASE}`,
                }}
              >
                TO-foto&apos;s
              </h1>
            </div>
          </div>
           <div className="flex items-center gap-[6px] px-[8px] py-[7px]">
            <span className="material-symbols-rounded" style={{ fontSize: 16, color: syncColor }}>{syncIcon}</span>
            <span style={{ fontSize: 13, color: syncColor }}>{syncLabel}</span>
          </div>
        </div>
      </header>

      <main className="px-3 pb-[104px] pt-[calc(74px_+_env(safe-area-inset-top))]">
        <div className="flex items-center gap-[7px] px-1 pb-[10px] pt-[2px]">
          <span className="material-symbols-rounded" style={{ fontSize: 15, color: "#2E5A3E" }}>schedule</span>
          <span style={{ fontSize: 13, color: "#2E5A3E" }}>Nieuwste opdrachten eerst</span>
        </div>

        {isLoading ? Array.from({ length: 4 }).map((_, index) => (
           <div key={index} className="mb-[11px] rounded-2xl bg-white p-4">
            <Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-2/3" />
          </div>
        )) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center" style={{ fontSize: 15, color: "#4A4A4A" }}>Geen stations gevonden</div>
        ) : filtered.map(({ station, done, total, remaining, complete, pending }) => {
          const open = expandedId === station.id;
          return (
            <div
              key={station.id}
               className="mb-[11px] overflow-hidden rounded-2xl bg-white"
              style={{
                 border: open ? `2px solid ${C.green}` : "2px solid transparent",
                transition: `border-color 0.24s ${EASE}`,
              }}
            >
              <button type="button" aria-expanded={open} onClick={() => setExpandedId(open ? null : station.id)} className="w-full px-4 py-[15px] text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words font-display" style={{ fontSize: 18, fontWeight: 500, color: "#0A0A0A", lineHeight: 1.25 }}>{formatStationName(station.naam_msr)}</h2>
                    <p className="mt-[3px] break-words font-mono" style={{ fontSize: 14, color: "#4A4A4A" }}>{station.behuizingsnummer || "Geen nummer"}</p>
                    <p className="mt-[1px] truncate" style={{ fontSize: 14, color: "#4A4A4A" }}>{station.ingevuld_door || "Geen monteur"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                     <span className="whitespace-nowrap px-1 py-[5px]" style={{ fontSize: 13, color: open ? C.green : "#4A4A4A" }}>
                      {relatieveDatum(station.created_at)}
                    </span>
                    <span
                      className="material-symbols-rounded"
                      style={{
                        fontSize: 21, color: "#3D3D3D",
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        transition: `transform 0.3s ${SPRING}`,
                      }}
                    >
                      expand_more
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {pending > 0 ? (
                    <span className="flex items-center gap-[7px]" style={{ fontSize: 16, color: C.upload }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>cloud_upload</span>
                      {pending} wachten
                    </span>
                  ) : complete ? (
                    <span className="flex items-center gap-[7px]" style={{ fontSize: 16, fontWeight: 500, color: C.green }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Klaar
                    </span>
                  ) : (
                    <span className="flex items-center gap-[7px]" style={{ fontSize: 16, color: "#0A0A0A" }}>
                      <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#4A4A4A" }}>photo_camera</span>
                      {remaining} {remaining === 1 ? "taak" : "taken"} te gaan
                    </span>
                  )}
                  <span className="shrink-0 font-mono" style={{ fontSize: 15, color: "#5A5A5A" }}>{done} / {total}</span>
                </div>
              </button>

              <div
                style={{
                  padding: "0 12px", display: "flex", gap: 8, alignItems: "stretch",
                  overflow: "hidden",
                  maxHeight: open ? 90 : 0,
                  opacity: open ? 1 : 0,
                  paddingBottom: open ? 13 : 0,
                  transition: `max-height 0.34s ${EASE}, opacity 0.24s ease, padding-bottom 0.34s ${EASE}`,
                }}
              >
                <DrukKnop
                  onClick={() => navigate(`/stations/${station.id}`)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
                    background: C.green, color: "#fff", fontSize: 17, fontWeight: 500,
                    padding: "15px 10px", borderRadius: 15, border: "none", minHeight: 56,
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>photo_camera</span>
                  Invullen
                </DrukKnop>
                <ActieKnop icon="description" label="Pdf" onClick={() => openPdf(station)} />
                <ActieKnop icon="ios_share" label="Delen" onClick={() => shareStation(station)} />
                <ActieKnop icon="delete" label="Wis" variant="gevaar" onClick={() => setDeleteTarget({ id: station.id, naam: station.naam_msr })} />
              </div>
            </div>
          );
        })}
      </main>

      <div
        className="tv-glas fixed inset-x-0 bottom-0 z-30 flex items-center gap-[10px] px-3 pt-[10px]"
        style={{
           background: "rgba(232,242,226,0.78)",
          borderTop: "0.5px solid rgba(31,92,58,0.14)",
          paddingBottom: "calc(15px + env(safe-area-inset-bottom))",
          ...glas,
        }}
      >
        {searchOpen || search ? (
          <label className="relative flex-1">
            <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 19, color: "#5A5A5A" }}>search</span>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              placeholder="Zoek station"
              className="w-full outline-none"
              style={{
                 minHeight: 58, borderRadius: 16, padding: "15px 16px 15px 44px",
                fontSize: 16, color: "#0A0A0A",
                background: "rgba(255,255,255,0.92)", border: `0.5px solid ${C.cardBorder}`,
              }}
            />
          </label>
        ) : (
          <DrukKnop
            onClick={() => setSearchOpen(true)}
            style={{
              flex: 1, display: "flex", alignItems: "center", gap: 10, textAlign: "left",
              background: "rgba(255,255,255,0.92)", border: `0.5px solid ${C.cardBorder}`,
               borderRadius: 16, padding: "15px 17px", minHeight: 58,
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 19, color: "#5A5A5A" }}>search</span>
            <span style={{ fontSize: 16, color: "#6A6A6A" }}>Zoek station</span>
          </DrukKnop>
        )}
        <DrukKnop
          onClick={() => navigate("/stations/new")}
          aria-label="Nieuw station"
          style={{
             width: 58, height: 58, borderRadius: 16, background: C.green, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 25, color: "#fff" }}>add</span>
        </DrukKnop>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Station verwijderen?</AlertDialogTitle><AlertDialogDescription>Het station en alle bijbehorende foto&apos;s worden definitief verwijderd. Daarna wordt om de toegangscode gevraagd.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={handleDeleteStation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Verwijderen</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
