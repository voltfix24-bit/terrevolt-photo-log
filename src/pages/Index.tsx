import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getApplicableCategories, type Category } from "@/lib/categories";
import { getPendingPhotos } from "@/lib/offline-queue";
import { useOnline } from "@/hooks/use-online";
import { useInstellingen } from "@/hooks/use-theme";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { downloadStationZip } from "@/lib/zip-download";
import { requirePin } from "@/lib/require-pin";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Group, Hairline, M, R, ROW_MIN, ROW_PAD_X, T, glass } from "@/components/apple/Primitives";
import { toast } from "sonner";

type PendingCounts = Record<string, number>;
type StationItem = {
  station: any;
  done: number;
  total: number;
  complete: boolean;
  pending: number;
  updatedAt: number;
  nextTaskName: string | null;
};

const requiredPhotos = (category: Category) => category.id === 31 ? 3 : 1;
const abbreviations = new Set(["ls", "ms", "to", "atr"]);
const ACTIVE_BG = "#F4F8F2";
const PANEL_MAX = 80;

const formatStationName = (name: string) => name
  .toLocaleLowerCase("nl-NL")
  .replace(/(^|[\s\-/])([\p{L}\p{N}]+)/gu, (_match, prefix: string, word: string) => {
    if (abbreviations.has(word)) return `${prefix}${word.toUpperCase()}`;
    return `${prefix}${word.charAt(0).toLocaleUpperCase("nl-NL")}${word.slice(1)}`;
  });

const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;

function IconActie({ icon, label, onClick, gevaar }: { icon: string; label: string; onClick: () => void; gevaar?: boolean }) {
  const [down, setDown] = useState(false);
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      onPointerDown={(event) => { event.stopPropagation(); setDown(true); }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      onPointerCancel={() => setDown(false)}
      aria-label={label}
      style={{
        width: 54, minHeight: 54, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 13,
        border: "none",
        background: gevaar ? T.dangerBg : T.soft,
        transform: down ? "scale(0.94)" : "scale(1)",
        transition: `transform 0.14s ${M.spring}`,
      }}
    >
      <span className="material-symbols-rounded" style={{ fontSize: 20, color: gevaar ? T.danger : T.green, fontVariationSettings: gevaar ? undefined : "'FILL' 0" }}>{icon}</span>
      <span style={{ fontSize: 10, color: gevaar ? T.danger : T.subOnBg }}>{label}</span>
    </button>
  );
}

function StationRij({ item, open, onToggle, onInvullen, onPdf, onZip, onVerwijder }: {
  item: StationItem;
  open: boolean;
  onToggle: () => void;
  onInvullen: () => void;
  onPdf: () => void;
  onZip: () => void;
  onVerwijder: () => void;
}) {
  const { station, done, total, complete, pending } = item;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ref.current) {
      const id = window.setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 340);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%", textAlign: "left", border: "none",
          background: open ? ACTIVE_BG : "transparent",
          padding: `12px ${ROW_PAD_X}px`, minHeight: ROW_MIN,
          display: "flex", alignItems: "center", gap: 12,
          transition: "background 0.2s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            className="font-display"
            style={{
              margin: 0,
              color: T.green,
              fontSize: 17,
              fontWeight: 500,
              lineHeight: 1.25,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {formatStationName(station.naam_msr)}
          </h2>
          <div className="font-mono" style={{ marginTop: 2, color: complete ? T.muted : T.rowSub, fontSize: 14 }}>
            {station.behuizingsnummer || "Geen nummer"}
          </div>
        </div>
        {complete ? (
          <span className="material-symbols-rounded" aria-label="Afgerond" style={{ color: T.done, fontSize: 21, flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        ) : pending > 0 ? (
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.upload, fontSize: 15, flexShrink: 0 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>cloud_upload</span>
            {pending}
          </span>
        ) : (
          <span className="font-mono" style={{ color: T.rowSub, fontSize: 15, flexShrink: 0 }}>{done} / {total}</span>
        )}
        <span
          className="material-symbols-rounded"
          aria-hidden="true"
          style={{
            color: T.chevron,
            fontSize: 19,
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: `transform 0.3s ${M.spring}`,
          }}
        >
          expand_more
        </span>
      </button>
      <div
        style={{
          overflow: "hidden",
          background: open ? ACTIVE_BG : "transparent",
          maxHeight: open ? PANEL_MAX : 0,
          opacity: open ? 1 : 0,
          transition: `max-height 0.34s ${M.ease}, opacity 0.22s ease`,
        }}
      >
        <div style={{ padding: "2px 12px 13px", display: "flex", gap: 8, alignItems: "stretch" }}>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onInvullen(); }}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: T.green, color: "#fff", fontSize: 16, fontWeight: 500,
              padding: "14px 8px", borderRadius: 13, border: "none", minHeight: 54,
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 19 }}>edit_document</span>
            Invullen
          </button>
          <IconActie icon="picture_as_pdf" label="Pdf" onClick={onPdf} />
          <IconActie icon="folder_zip" label="Zip" onClick={onZip} />
          <IconActie icon="delete" label="Wis" onClick={onVerwijder} gevaar />
        </div>
      </div>
    </div>
  );
}

function SectieLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "0 5px 7px", color: T.subOnBg, fontSize: 13, letterSpacing: "0.03em", textTransform: "uppercase" }}>{children}</div>;
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
      const { data, error } = await supabase.from("stations").select("*, fotos(categorie, id, url, storage_path, created_at, uploaded_at, review_status)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: skips } = useQuery({
    queryKey: ["categorie-skips-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorie_skips").select("station_id, categorie");
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
    const onScroll = () => setGekrompen((current) => current ? window.scrollY > 30 : window.scrollY > 42);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const enriched = useMemo<StationItem[]>(() => {
    const skippedByStation = new Map<string, Set<string>>();
    for (const skip of skips ?? []) {
      if (!skippedByStation.has(skip.station_id)) skippedByStation.set(skip.station_id, new Set());
      skippedByStation.get(skip.station_id)!.add(skip.categorie);
    }
    return (stations ?? []).map((station) => {
      const applicable = getApplicableCategories(station);
      const skipped = skippedByStation.get(station.id) ?? new Set<string>();
      const photosByCategory = new Map<string, number>();
      for (const photo of (station.fotos ?? []).filter((foto: any) => foto.review_status !== "rejected")) photosByCategory.set(photo.categorie, (photosByCategory.get(photo.categorie) ?? 0) + 1);
      const isDone = (category: Category) => (photosByCategory.get(category.name) ?? 0) > 0 || skipped.has(category.name);
      const total = applicable.length;
      const done = applicable.filter(isDone).length;
      const nextTaskName = applicable.find((category) => !isDone(category))?.name ?? null;
      return {
        station,
        done,
        total,
        complete: done === total && total > 0,
        pending: pendingCounts[station.id] ?? 0,
        updatedAt: dateValue(station.updated_at ?? station.created_at),
        nextTaskName,
      };
    });
  }, [stations, skips, pendingCounts]);

  const filtered = useMemo(() => enriched.filter((item) => {
    const query = search.trim().toLocaleLowerCase("nl-NL");
    return !query || item.station.naam_msr.toLocaleLowerCase("nl-NL").includes(query) || item.station.behuizingsnummer?.toLocaleLowerCase("nl-NL").includes(query);
  }).sort((a, b) => b.updatedAt - a.updatedAt), [enriched, search]);

  const opgeleverdStatus = (item: StationItem) => item.station.status === "opgeleverd" || item.station.status === "goedgekeurd";
  const opgeleverd = filtered.filter(opgeleverdStatus);
  const actief = filtered.filter((item) => !opgeleverdStatus(item));
  const laatste = actief.find((item) => item.station.review_reden) ?? actief.find((item) => !item.complete);
  const lopend = actief.filter((item) => !item.complete && item.station.id !== laatste?.station.id);
  const afgerond = actief.filter((item) => item.complete && item.station.id !== laatste?.station.id);
  const totalPending = Object.values(pendingCounts).reduce((sum, count) => sum + count, 0);

  const openPdf = async (station: any) => {
    const { data: opmerkingen } = await supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", station.id);
    const html = generatePdfHtml(station, station.fotos ?? [], instellingenData ?? undefined, opmerkingen ?? undefined);
    const reportWindow = window.open("", "_blank");
    if (reportWindow) { reportWindow.document.write(html); reportWindow.document.close(); }
  };

  const downloadZip = async (station: any) => {
    try {
      await downloadStationZip(station.naam_msr, station.fotos ?? []);
      toast.success("Zip gedownload");
    } catch {
      toast.error("Zip downloaden mislukt");
    }
  };

  const handleDeleteStation = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const unlocked = await requirePin("Station verwijderen", `Voer de toegangscode in om "${target.naam}" definitief te verwijderen.`);
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

  const stationRijen = (items: StationItem[]) => items.map((item, index) => (
    <div key={item.station.id}>
      {index > 0 && <Hairline inset={ROW_PAD_X} />}
      <StationRij
        item={item}
        open={expandedId === item.station.id}
        onToggle={() => setExpandedId(expandedId === item.station.id ? null : item.station.id)}
        onInvullen={() => navigate(`/stations/${item.station.id}`)}
        onPdf={() => openPdf(item.station)}
        onZip={() => downloadZip(item.station)}
        onVerwijder={() => setDeleteTarget({ id: item.station.id, naam: item.station.naam_msr })}
      />
    </div>
  ));

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <header
        className="glass fixed inset-x-0 top-0 z-30"
        style={{
          height: "calc(50px + env(safe-area-inset-top))",
          paddingTop: "env(safe-area-inset-top)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: `0.5px solid rgba(31,92,58,${gekrompen ? 0.12 : 0})`,
          transition: `background 0.28s ${M.ease}, border-color 0.28s ${M.ease}`,
          ...glass(gekrompen ? 0.8 : 0),
        }}
      >
        {instellingenData?.logo_url && (
          <img
            src={instellingenData.logo_url}
            alt={instellingenData.bedrijfsnaam || "Logo"}
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              height: 26,
              maxWidth: 108,
              objectFit: "contain",
            }}
          />
        )}
        <span
          className="font-display"
          style={{
            color: T.titleOnBg,
            fontSize: 17,
            fontWeight: 500,
            opacity: gekrompen ? 1 : 0,
            transform: gekrompen ? "translateY(0)" : "translateY(7px)",
            transition: `opacity 0.24s ${M.ease}, transform 0.3s ${M.ease}`,
          }}
        >
          Stations
        </span>
        {instellingenData?.profielfoto_url && (
          <img
            src={instellingenData.profielfoto_url}
            alt="Profielfoto"
            style={{
              position: "absolute",
              right: 58,
              top: "50%",
              transform: "translateY(-50%)",
              width: 30,
              height: 30,
              borderRadius: 15,
              objectFit: "cover",
            }}
          />
        )}

        <button
          type="button"
          aria-label="Instellingen"
          onClick={async () => { if (await requirePin()) navigate("/instellingen"); }}
          className="active:scale-90 transition-transform"
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: 0,
            background: "transparent",
            color: T.green,
            padding: 0,
          }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: 24 }}>settings</span>
        </button>
      </header>

      <main style={{ padding: "calc(62px + env(safe-area-inset-top)) 12px 118px" }}>
        <div style={{ padding: "0 8px 18px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <h1
              className="font-display"
              style={{
                margin: 0,
                color: T.titleOnBg,
                fontSize: 34,
                fontWeight: 500,
                lineHeight: 1.05,
                opacity: gekrompen ? 0 : 1,
                transition: `opacity 0.24s ${M.ease}`,
              }}
            >
              Stations
            </h1>
            <span style={{ paddingBottom: 3, color: T.subOnBg, fontSize: 14 }}>{syncLabel}</span>
          </div>
          <div style={{ marginTop: 8, color: T.subOnBg, fontSize: 15 }}>{filtered.length} stations</div>
        </div>

        {isLoading ? (
          <Group>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index}>
                {index > 0 && <Hairline inset={ROW_PAD_X} />}
                <div style={{ minHeight: ROW_MIN, padding: `13px ${ROW_PAD_X}px` }}><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
              </div>
            ))}
          </Group>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: T.subOnBg, fontSize: 15 }}>Geen stations gevonden</div>
        ) : (
          <>
            {laatste && (
              <>
                <SectieLabel>Waar je gebleven was</SectieLabel>
                <Group>
                  <button
                    type="button"
                    onClick={() => navigate(`/stations/${laatste.station.id}`)}
                    style={{ width: "100%", minHeight: 60, padding: "16px 17px", border: 0, background: T.surface, textAlign: "left" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-display" style={{ color: T.rowText, fontSize: 22, fontWeight: 500, lineHeight: 1.2, overflowWrap: "anywhere" }}>
                          {formatStationName(laatste.station.naam_msr)}
                        </div>
                        <div className="font-mono" style={{ marginTop: 4, color: T.rowSub, fontSize: 14 }}>{laatste.station.behuizingsnummer || "Geen nummer"}</div>
                      </div>
                      <span className="font-mono" style={{ color: T.rowSub, fontSize: 15, flexShrink: 0 }}>{laatste.done} / {laatste.total}</span>
                    </div>
                    {laatste.station.review_reden && (
                      <div style={{ marginTop: 12, color: T.danger, fontSize: 15, lineHeight: 1.4 }}>Afgekeurd: {laatste.station.review_reden}</div>
                    )}
                    {laatste.nextTaskName && <div style={{ marginTop: 12, color: T.rowText, fontSize: 15 }}>Volgende: {laatste.nextTaskName}</div>}
                  </button>
                  <Hairline inset={ROW_PAD_X} />
                  <button
                    type="button"
                    onClick={() => navigate(`/stations/${laatste.station.id}`)}
                    style={{ width: "100%", minHeight: 56, padding: "14px 17px", border: 0, background: T.surface, color: T.green, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    Verder invullen
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>arrow_forward</span>
                  </button>
                </Group>
              </>
            )}

            {lopend.length > 0 && <><SectieLabel>In uitvoering</SectieLabel><Group>{stationRijen(lopend)}</Group></>}
            {afgerond.length > 0 && <><SectieLabel>Afgerond</SectieLabel><Group>{stationRijen(afgerond)}</Group></>}
            {opgeleverd.length > 0 && <><SectieLabel>Opgeleverd</SectieLabel><Group>{stationRijen(opgeleverd)}</Group></>}
          </>
        )}
      </main>

      <div
        className="glass fixed inset-x-0 bottom-0 z-30 flex items-center gap-[10px] px-3 pt-[10px]"
        style={{
          paddingBottom: "calc(15px + env(safe-area-inset-bottom))",
          borderTop: "0.5px solid rgba(31,92,58,0.12)",
          ...glass(0.78),
        }}
      >
        {searchOpen || search ? (
          <label className="relative flex-1">
            <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2" style={{ color: T.rowSub, fontSize: 19 }}>search</span>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => { if (!search) setSearchOpen(false); }}
              placeholder="Zoek station"
              className="w-full outline-none"
              style={{ minHeight: 56, border: 0, borderRadius: R.control, padding: "15px 16px 15px 44px", background: "rgba(255,255,255,0.92)", color: T.rowText, fontSize: 17 }}
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            style={{ flex: 1, minHeight: 56, border: 0, borderRadius: R.control, padding: "15px 16px", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", gap: 9, textAlign: "left" }}
          >
            <span className="material-symbols-rounded" style={{ color: T.rowSub, fontSize: 19 }}>search</span>
            <span style={{ color: T.rowSub, fontSize: 17 }}>Zoek station</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/stations/new")}
          aria-label="Nieuw station"
          style={{ width: 56, height: 56, flexShrink: 0, border: 0, borderRadius: R.control, background: T.green, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <span className="material-symbols-rounded" style={{ color: T.surface, fontSize: 25 }}>add</span>
        </button>
      </div>

      <Sheet open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Station verwijderen?</SheetTitle>
            <SheetDescription>Het station en alle bijbehorende foto&apos;s worden definitief verwijderd. Daarna wordt om de toegangscode gevraagd.</SheetDescription>
          </SheetHeader>
          <SheetFooter className="mt-5 flex-row gap-3 sm:space-x-0">
            <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-14 flex-1 rounded-2xl bg-secondary text-base font-medium text-foreground">Annuleren</button>
            <button type="button" onClick={handleDeleteStation} className="min-h-14 flex-1 rounded-2xl bg-destructive text-base font-medium text-destructive-foreground">Verwijderen</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
