// Variant 1b — "Gegroepeerd op wat moet ik doen"
// Drop-in vervanging voor src/pages/Index.tsx. Data, routes, queries en acties blijven gelijk.
import { OnHoldLabel } from "@/components/cases/OnHoldLabel";
import { useEffect, useMemo, useRef, useState } from "react";
import { categorieKlaar } from "@/lib/foto-regels";
import { internetVereist } from "@/lib/internet";
import { fotosVan } from "@/lib/fotos-service";
import { verwijderStation } from "@/lib/station-service";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { caseUrl } from "@/lib/urls";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getApplicableCategories, type Category } from "@/lib/categories";
import { getQueueCounts, QUEUE_EVENT } from "@/lib/offline-queue";
import { useOnline } from "@/hooks/use-online";
import { useInstellingen } from "@/hooks/use-theme";
import { requirePin } from "@/lib/require-pin";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { M, Pressable, R, T, glass } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { TO_STATUS, dagenSinds, netjes, type ToStatus } from "@/lib/to-rondes";

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

const caseLabelOf = (station: any) => [station?.casenummer, station?.casenaam].filter(Boolean).join(" · ");
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
  const pct = item.total ? Math.round((item.done / item.total) * 100) : 0;
  const open = Math.max(0, item.total - item.done);
  return (
    <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0, background: `conic-gradient(${color} ${pct}%, ${T.hairline} 0)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 38, height: 38, borderRadius: 19, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.titleOnBg }}>
        {open}
      </div>
    </div>
  );
}

type Soort = "actie" | "bezig" | "klaar" | "opgeleverd";
const dagenTxt = (d: number) => (d <= 0 ? "vandaag" : d === 1 ? "1 dag" : `${d} dagen`);
const fmtKort = (d?: string | null) => d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "";
export const klaarSinds = (item: StationItem) => item.station.updated_at ?? item.station.created_at;
function huidigeRonde(station: any): { status: ToStatus; nummer: number } {
  const r = [...(station.to_rondes ?? [])].sort((a: any, b: any) => a.nummer - b.nummer).pop();
  return r ? { status: r.status as ToStatus, nummer: r.nummer } : { status: "open", nummer: 1 };
}

function StationKaart({ item, soort, onOpen, onMeer }: { item: StationItem; soort: Soort; onOpen: () => void; onMeer: () => void }) {
  const s = rijStatus(item);
  const st = item.station;
  const nr = st.casenummer || st.behuizingsnummer || "";
  const naam = netjes(st.casenaam) || formatStationName(st.naam_msr);
  const sub = st.casenaam ? formatStationName(st.naam_msr) : "";
  const fotoAantal = (st.fotos ?? []).filter((f: any) => f.review_status !== "rejected").length;
  let duur = ""; let duurLaat = false;
  if (soort === "opgeleverd") duur = `Opgeleverd ${fmtKort(st.submitted_at ?? st.updated_at)}`;
  else if (soort === "klaar") { const d = dagenSinds(klaarSinds(item)); duur = d <= 0 ? "klaar sinds vandaag" : `klaar sinds ${dagenTxt(d)}`; duurLaat = d > 7; }
  else { const d = dagenSinds(st.created_at); duur = d <= 0 ? "gestart vandaag" : `gestart ${dagenTxt(d)}`; }
  const ronde = huidigeRonde(st);
  const archief = soort === "opgeleverd";
  return (
    <div className={`group flex items-center transition-[background-color,border-color] duration-150 ${archief ? "bg-[#F4F9F2] hover:bg-white" : "bg-white"} border border-transparent hover:border-[#1F5C3A]`} style={{ borderRadius: R.group }}>
      <Pressable onClick={onOpen} scale={0.98} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14, padding: "14px 4px 14px 16px", textAlign: "left", cursor: "pointer" }}>
        {archief ? (
          <div aria-hidden="true" style={{ width: 48, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.subOnBg }}>
            <span className="material-symbols-rounded" style={{ fontSize: 26 }}>inventory_2</span>
          </div>
        ) : soort === "klaar" ? (
          <div aria-hidden="true" style={{ width: 48, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: "#D9F2D3", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.green, fontVariationSettings: "'FILL' 1, 'wght' 600" }}>check</span>
            </div>
          </div>
        ) : <Voortgangsring item={item} color={s.ring} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nr}</span>
            {st.on_hold && <OnHoldLabel />}
            <span style={{ flexShrink: 0, fontSize: 12, color: duurLaat ? "#C2610C" : SUB, fontWeight: duurLaat ? 600 : 400 }}>{duur}</span>
          </div>
          <div className="font-display" style={{ marginTop: 2, color: T.titleOnBg, fontSize: 18, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{naam}</div>
          {(sub || soort === "klaar") && (
            <div style={{ marginTop: 2, color: T.subOnBg, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {soort === "klaar" ? [sub, `${fotoAantal} foto's`].filter(Boolean).join(" · ") : sub}
            </div>
          )}
          {soort === "klaar" ? (
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: SUB }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: TO_STATUS[ronde.status].dot, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: T.titleOnBg }}>{TO_STATUS[ronde.status].label}</span>
              <span>· ronde {ronde.nummer}</span>
            </div>
          ) : soort === "bezig" ? (
            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: s.fg, overflow: "hidden" }}>
              <span className="material-symbols-rounded" style={{ fontSize: 16 }}>arrow_forward</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nextTaskName ? `Volgende taak: ${item.nextTaskName}` : "Volgende taak"}</span>
            </div>
          ) : soort === "actie" ? (
            <div style={{ marginTop: 4, color: s.fg, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.hint}</div>
          ) : null}
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

  const { data: stations, isLoading, isError: stationsFout, refetch: herlaadStations, isFetching: stationsBezig } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*, fotos(categorie, review_status), to_rondes(nummer, status)").eq("uitvoerder", "terrevolt").order("created_at", { ascending: false });
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
      const counts = await getQueueCounts();
      if (!mounted) return;
      setPendingCounts(old => JSON.stringify(old) === JSON.stringify(counts) ? old : counts);
    };
    updatePending();
    window.addEventListener(QUEUE_EVENT, updatePending);
    window.addEventListener("focus", updatePending);
    return () => { mounted = false; window.removeEventListener(QUEUE_EVENT, updatePending); window.removeEventListener("focus", updatePending); };
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
      for (const f of (station.fotos ?? []).filter((f) => f.review_status !== "rejected")) perCat.set(f.categorie, (perCat.get(f.categorie) ?? 0) + 1);
      const isDone = (c: Category) => skipped.has(c.name) || categorieKlaar(c.id, perCat.get(c.name) ?? 0);
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
    return !q
      || item.station.naam_msr.toLocaleLowerCase("nl-NL").includes(q)
      || item.station.behuizingsnummer?.toLocaleLowerCase("nl-NL").includes(q)
      || item.station.casenummer?.toLocaleLowerCase("nl-NL").includes(q)
      || item.station.casenaam?.toLocaleLowerCase("nl-NL").includes(q);
  }).sort((a, b) => b.updatedAt - a.updatedAt), [enriched, search]);

  const isOpgeleverd = (i: StationItem) => i.station.status === "opgeleverd" || i.station.status === "goedgekeurd";
  const opgeleverd = filtered.filter(isOpgeleverd);
  const actief = filtered.filter((i) => !isOpgeleverd(i));
  const actieNodig = actief.filter((i) => i.station.review_reden || i.pending > 0);
  const bezig = actief.filter((i) => !actieNodig.includes(i) && !i.complete);
  const klaar = actief.filter((i) => !actieNodig.includes(i) && i.complete).sort((a, b) => dateValue(klaarSinds(a)) - dateValue(klaarSinds(b)));
  const totalPending = Object.values(pendingCounts).reduce((s, n) => s + n, 0);
  const syncLabel = !isOnline ? "Offline" : totalPending > 0 ? `${totalPending} wachten` : "Gesynct";

  const openPdf = async (station: any) => {
    if (!internetVereist()) return;
    const { generatePdfHtml } = await import("@/lib/pdf-generator");
    const { data: opmerkingen } = await supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", station.id);
    const html = generatePdfHtml(station, await fotosVan(station.id), instellingenData ?? undefined, opmerkingen ?? undefined);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const downloadZip = async (station: any) => {
    try {
      const { downloadStationZip } = await import("@/lib/zip-download");
      const r = await downloadStationZip(station.naam_msr, await fotosVan(station.id));
      if (r.mislukt > 0) toast.warning(`Zip gedownload, maar ${r.mislukt} van ${r.totaal} foto's ontbreken`, { duration: 8000 });
      else toast.success("Zip gedownload");
    }
    catch { toast.error("Zip downloaden mislukt"); }
  };

  const handleDeleteStation = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const unlocked = await requirePin("Station verwijderen", `Voer de toegangscode in om "${target.naam}" definitief te verwijderen.`);
    if (!unlocked) return;
    const r = await verwijderStation(target.id);
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    if (!r.ok) { toast.error("Verwijderen mislukt — probeer opnieuw"); return; }
    if (r.bestandenOver) console.warn(`${r.bestandenOver} fotobestanden niet opgeruimd`);
    toast.success("Station verwijderd");
  };

  const kaart = (soort: Soort) => (item: StationItem) => (
    <StationKaart
      key={item.station.id}
      item={item}
      soort={soort}
      onOpen={() => navigate(caseUrl(item.station))}
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
          <div style={{ display: "flex", gap: 4 }}>
          <Pressable aria-label="Cases & TO" onClick={() => navigate("/cases")} className="border border-transparent bg-white hover:border-[#1F5C3A] transition-colors duration-150" style={{ height: 44, minWidth: 44, flexShrink: 0, padding: "0 14px 0 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, alignSelf: "center" }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>assignment</span>
            <span className="hidden min-[360px]:inline">Cases</span>
          </Pressable>
          <Pressable aria-label="Fotobeoordeling" onClick={() => navigate("/beoordelen")} className="border border-transparent bg-white hover:border-[#1F5C3A] transition-colors duration-150" style={{ height: 44, minWidth: 44, flexShrink: 0, padding: "0 12px 0 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 6, color: T.green, fontSize: 15, fontWeight: 600, alignSelf: "center" }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>fact_check</span>
            <span className="hidden min-[480px]:inline">Beoordeling</span>
          </Pressable>
          <Pressable aria-label="Instellingen" onClick={async () => { if (await requirePin()) navigate("/instellingen"); }} style={{ width: 44, height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.green }}>
            <span className="material-symbols-rounded" style={{ fontSize: 26 }}>settings</span>
          </Pressable>
          </div>
        </div>

        {isLoading ? (
          <PaginaLader label="Stations laden…" />
        ) : stationsFout && !stations ? (
          <div role="alert" style={{ margin: "24px 20px", padding: 16, borderRadius: 14, background: "#FDECEA", color: "#8A1C1C", fontSize: 15, display: "flex", flexDirection: "column", gap: 12 }}>
            Stations konden niet worden geladen.
            <button type="button" onClick={() => void herlaadStations()} disabled={stationsBezig} style={{ minHeight: 48, borderRadius: 12, border: "none", background: "#8A1C1C", color: "#fff", fontSize: 16, fontWeight: 600 }}>Opnieuw laden</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "52px 20px", textAlign: "center", color: SUB, fontSize: 15 }}>Geen stations gevonden</div>
        ) : (
          <>
            <Groep titel="Actie nodig" kleur={T.danger} items={actieNodig} render={kaart("actie")} />
            <Groep titel="Bezig" kleur={T.current} items={bezig} render={kaart("bezig")} />
            <Groep titel="Klaar voor oplevering" kleur={T.green} items={klaar} render={kaart("klaar")} />
            {opgeleverd.length > 0 && (
              <>
                <Pressable onClick={() => setOpgeleverdOpen((o) => !o)} aria-expanded={opgeleverdOpen} scale={0.98} style={{ width: "100%", minHeight: 56, padding: "0 16px", borderRadius: R.group, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 10, color: SUB, fontSize: 16, textAlign: "left", marginBottom: 8 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.subOnBg }}>inventory_2</span>
                  <span style={{ flex: 1 }}>{opgeleverd.length} opgeleverd</span>
                  <span className="material-symbols-rounded" style={{ fontSize: 22, transform: opgeleverdOpen ? "rotate(180deg)" : "none", transition: `transform 0.3s ${M.spring}` }}>expand_more</span>
                </Pressable>
                {opgeleverdOpen && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{opgeleverd.map(kaart("opgeleverd"))}</div>}
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
            <SheetTitle>{actieTarget ? (caseLabelOf(actieTarget) || formatStationName(actieTarget.naam_msr)) : ""}</SheetTitle>
            <SheetDescription className="font-mono">{actieTarget?.behuizingsnummer || "Geen nummer"}</SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {actieKnop("edit_document", "Invullen", () => { const s = actieTarget; setActieTarget(null); navigate(caseUrl(s)); })}
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
