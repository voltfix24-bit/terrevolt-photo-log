// Variant 1b — "Gegroepeerd op wat moet ik doen"
// Drop-in vervanging voor src/pages/Index.tsx. Data, routes, queries en acties blijven gelijk.
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
import { M, Pressable, R, T, glass } from "@/components/apple/Primitives";
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

// Hogere contrast-tekst voor buiten in zonlicht (i.p.v. T.rowSub #7A857A)
const SUB = T.bodyOnBg; // #3D4F42
const UPLOAD_BG = "#E7EEF7";
const AMBER_TEXT = "#8A5410";

const abbreviations = new Set(["ls", "ms", "to", "atr"]);
const formatStationName = (name: string) => name
  .toLocaleLowerCase("nl-NL")
  .replace(/(^|[\s\-/])([\p{L}\p{N}]+)/gu, (_m, prefix: string, word: string) =>
    abbreviations.has(word) ? `${prefix}${word.toUpperCase()}` : `${prefix}${word.charAt(0).toLocaleUpperCase("nl-NL")}${word.slice(1)}`);

const dateValue = (value?: string | null) => value ? new Date(value).getTime() : 0;

function rijStatus(item: StationItem) {
  const open = item.total - item.done;
  if (item.station.review_reden) return { ring: T.danger, fg: T.danger, hint: `Afgekeurd: ${item.station.review_reden}` };
  if (item.pending > 0) return { ring: T.upload, fg: T.upload, hint: `${item.pending} foto's wachten op upload` };
  if (item.complete) return { ring: T.green, fg: T.green, hint: "Klaar om op te leveren" };
  return {
    ring: open >= 4 ? T.current : T.green,
    fg: open >= 4 ? AMBER_TEXT : SUB,
    hint: item.nextTaskName ? `Volgende: ${item.nextTaskName}` : `${open} te gaan`,
  };
}

function Voortgangsring({ item, color }: { item: StationItem; color: string }) {
  const open = item.total - item.done;
  const pct = item.total ? (item.done / item.total) * 100 : 0;
  return (
    <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0, background: `conic-gradient(${color} ${pct}%, ${T.hairline} 0)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: T.titleOnBg }}>
        {open === 0
          ? <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.green, fontVariationSettings: "'FILL' 1" }}>check</span>
          : open}
      </div>
    </div>
  );
}

function StationKaart({ item, onOpen, onMeer }: { item: StationItem; onOpen: () => void; onMeer: () => void }) {
  const s = rijStatus(item);
  return (
    <div style={{ background: T.surface, borderRadius: R.group, display: "flex", alignItems: "center" }}>
      <Pressable onClick={onOpen} scale={0.98} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14, padding: "14px 4px 14px 16px", textAlign: "left" }}>
        <Voortgangsring item={item} color={s.ring} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-display" style={{ color: T.titleOnBg, fontSize: 17, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {formatStationName(item.station.naam_msr)}
          </div>
          <div style={{ marginTop: 3, color: s.fg, fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.hint}
          </div>
        </div>
      </Pressable>
      <Pressable onClick={onMeer} aria-label="Meer acties" style={{ width: 48, alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", color: T.subOnBg }}>
        <span className="material-symbols-rounded" style={{ fontSize: 22 }}>more_vert</span>
      </Pressable>
    </div>
  );
}

function Groep({ titel, kleur, items, render }: { titel: string; kleur: string; items: StationItem[]; render: (i: StationItem) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: kleur }} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.titleOnBg }}>{titel}</span>
        <span style={{ fontSize: 14, color: SUB }}>{items.length}</span>
      </div>
      {items.map(render)}
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOnline();
  const { data: instellingenData } = useInstellingen();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({});
  const [actieTarget, setActieTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; naam: string } | null>(null);
  const [opgeleverdOpen, setOpgeleverdOpen] = useState(false);
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
      setPendingCounts(pending.reduce<PendingCounts>((c, p) => { c[p.stationId] = (c[p.stationId] ?? 0) + 1; return c; }, {}));
    };
    updatePending();
    const interval = window.setInterval(updatePending, 3000);
    window.addEventListener("focus", updatePending);
    return () => { mounted = false; window.clearInterval(interval); window.removeEventListener("focus", updatePending); };
  }, [isOnline]);

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus(); }, [searchOpen]);

  const enriched = useMemo<StationItem[]>(() => {
    const skippedByStation = new Map<string, Set<string>>();
    for (const skip of skips ?? []) {
      if (!skippedByStation.has(skip.station_id)) skippedByStation.set(skip.station_id, new Set());
      skippedByStation.get(skip.station_id)!.add(skip.categorie);
    }
    return (stations ?? []).map((station) => {
      const applicable = getApplicableCategories(station);
      const skipped = skippedByStation.get(station.id) ?? new Set<string>();
      const perCat = new Map<string, number>();
      for (const f of (station.fotos ?? []).filter((f: any) => f.review_status !== "rejected")) perCat.set(f.categorie, (perCat.get(f.categorie) ?? 0) + 1);
      const isDone = (c: Category) => (perCat.get(c.name) ?? 0) > 0 || skipped.has(c.name);
      const total = applicable.length;
      const done = applicable.filter(isDone).length;
      return {
        station, done, total,
        complete: done === total && total > 0,
        pending: pendingCounts[station.id] ?? 0,
        updatedAt: dateValue(station.updated_at ?? station.created_at),
        nextTaskName: applicable.find((c) => !isDone(c))?.name ?? null,
      };
    });
  }, [stations, skips, pendingCounts]);

  const filtered = useMemo(() => enriched.filter((item) => {
    const q = search.trim().toLocaleLowerCase("nl-NL");
    return !q || item.station.naam_msr.toLocaleLowerCase("nl-NL").includes(q) || item.station.behuizingsnummer?.toLocaleLowerCase("nl-NL").includes(q);
  }).sort((a, b) => b.updatedAt - a.updatedAt), [enriched, search]);

  const isOpgeleverd = (i: StationItem) => i.station.status === "opgeleverd" || i.station.status === "goedgekeurd";
  const opgeleverd = filtered.filter(isOpgeleverd);
  const actief = filtered.filter((i) => !isOpgeleverd(i));
  const actieNodig = actief.filter((i) => i.station.review_reden || i.pending > 0);
  const bezig = actief.filter((i) => !actieNodig.includes(i) && !i.complete);
  const klaar = actief.filter((i) => !actieNodig.includes(i) && i.complete);
  const totalPending = Object.values(pendingCounts).reduce((s, n) => s + n, 0);
  const syncLabel = !isOnline ? "Offline" : totalPending > 0 ? `${totalPending} wachten` : "Gesynct";

  const openPdf = async (station: any) => {
    const { data: opmerkingen } = await supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", station.id);
    const html = generatePdfHtml(station, station.fotos ?? [], instellingenData ?? undefined, opmerkingen ?? undefined);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const downloadZip = async (station: any) => {
    try { await downloadStationZip(station.naam_msr, station.fotos ?? []); toast.success("Zip gedownload"); }
    catch { toast.error("Zip downloaden mislukt"); }
  };

  const handleDeleteStation = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const unlocked = await requirePin("Station verwijderen", `Voer de toegangscode in om "${target.naam}" definitief te verwijderen.`);
    if (!unlocked) return;
    const { data: photos } = await supabase.from("fotos").select("storage_path").eq("station_id", target.id);
    if (photos?.length) {
      await supabase.storage.from("to-fotos").remove(photos.map((p) => p.storage_path));
      await supabase.from("fotos").delete().eq("station_id", target.id);
    }
    const { error } = await supabase.from("stations").delete().eq("id", target.id);
    if (error) { toast.error("Verwijderen mislukt"); return; }
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    toast.success("Station verwijderd");
  };

  const kaart = (item: StationItem) => (
    <StationKaart
      key={item.station.id}
      item={item}
      onOpen={() => navigate(`/stations/${item.station.id}`)}
      onMeer={() => setActieTarget(item.station)}
    />
  );

  const actieKnop = (icon: string, label: string, onClick: () => void, gevaar = false) => (
    <Pressable onClick={onClick} scale={0.98} style={{ width: "100%", minHeight: 56, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderRadius: R.control, background: gevaar ? T.dangerBg : T.soft, color: gevaar ? T.danger : T.titleOnBg, fontSize: 17, fontWeight: 500 }}>
      <span className="material-symbols-rounded" style={{ fontSize: 22, color: gevaar ? T.danger : T.green }}>{icon}</span>
      {label}
    </Pressable>
  );

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <main style={{ padding: "calc(16px + env(safe-area-inset-top)) 12px 120px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px 20px", gap: 12 }}>
          <div>
            <h1 className="font-display" style={{ margin: 0, color: T.titleOnBg, fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Stations</h1>
            <div style={{ marginTop: 4, color: SUB, fontSize: 14 }}>{syncLabel}</div>
          </div>
          <Pressable aria-label="Instellingen" onClick={async () => { if (await requirePin()) navigate("/instellingen"); }} style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", color: T.green }}>
            <span className="material-symbols-rounded" style={{ fontSize: 26 }}>settings</span>
          </Pressable>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background: T.surface, borderRadius: R.group, padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                <Skeleton className="h-12 w-12 rounded-full" />
                <div style={{ flex: 1 }}><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: SUB, fontSize: 15 }}>Geen stations gevonden</div>
        ) : (
          <>
            <Groep titel="Actie nodig" kleur={T.danger} items={actieNodig} render={kaart} />
            <Groep titel="Bezig" kleur={T.current} items={bezig} render={kaart} />
            <Groep titel="Klaar voor oplevering" kleur={T.green} items={klaar} render={kaart} />
            {opgeleverd.length > 0 && (
              <>
                <Pressable onClick={() => setOpgeleverdOpen((o) => !o)} aria-expanded={opgeleverdOpen} scale={0.98} style={{ width: "100%", minHeight: 56, padding: "0 16px", borderRadius: R.group, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 10, color: SUB, fontSize: 16, textAlign: "left", marginBottom: 8 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.subOnBg }}>inventory_2</span>
                  <span style={{ flex: 1 }}>{opgeleverd.length} opgeleverd</span>
                  <span className="material-symbols-rounded" style={{ fontSize: 22, transform: opgeleverdOpen ? "rotate(180deg)" : "none", transition: `transform 0.3s ${M.spring}` }}>expand_more</span>
                </Pressable>
                {opgeleverdOpen && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{opgeleverd.map(kaart)}</div>}
              </>
            )}
          </>
        )}
      </main>

      <div className="glass fixed inset-x-0 bottom-0 z-30" style={{ padding: "10px 12px calc(15px + env(safe-area-inset-bottom))", borderTop: "0.5px solid rgba(31,92,58,0.12)", ...glass(0.9) }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10 }}>
          {searchOpen || search ? (
            <label className="relative flex-1">
              <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2" style={{ color: SUB, fontSize: 20 }}>search</span>
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false); }}
                placeholder="Zoek station of nummer"
                className="w-full outline-none"
                style={{ minHeight: 56, border: 0, borderRadius: R.control, padding: "15px 16px 15px 46px", background: T.surface, color: T.rowText, fontSize: 17 }}
              />
            </label>
          ) : (
            <>
              <Pressable aria-label="Zoeken" onClick={() => setSearchOpen(true)} style={{ width: 56, height: 56, flexShrink: 0, borderRadius: R.control, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.green }}>
                <span className="material-symbols-rounded" style={{ fontSize: 24 }}>search</span>
              </Pressable>
              <Pressable onClick={() => navigate("/stations/new")} style={{ flex: 1, minHeight: 56, borderRadius: R.control, background: T.green, color: T.surface, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
                <span className="material-symbols-rounded" style={{ fontSize: 24 }}>add</span>
                Nieuw station
              </Pressable>
            </>
          )}
        </div>
      </div>

      <Sheet open={Boolean(actieTarget)} onOpenChange={(o) => !o && setActieTarget(null)}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>{actieTarget ? formatStationName(actieTarget.naam_msr) : ""}</SheetTitle>
            <SheetDescription className="font-mono">{actieTarget?.behuizingsnummer || "Geen nummer"}</SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {actieKnop("edit_document", "Invullen", () => { const s = actieTarget; setActieTarget(null); navigate(`/stations/${s.id}`); })}
            {actieKnop("picture_as_pdf", "Pdf openen", () => { const s = actieTarget; setActieTarget(null); openPdf(s); })}
            {actieKnop("folder_zip", "Foto's als zip", () => { const s = actieTarget; setActieTarget(null); downloadZip(s); })}
            {actieKnop("delete", "Verwijderen", () => { const s = actieTarget; setActieTarget(null); setDeleteTarget({ id: s.id, naam: s.naam_msr }); }, true)}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
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
