// Variant 2b — Foto-wizard "camera eerst"
// Nieuw bestand: src/components/WizardView.tsx
// Vervangt de lokale `WizardView` + `WizardViewProps` in src/pages/StationDetail.tsx (zelfde props).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { categorieKlaar, minFotos } from "@/lib/foto-regels";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { fotowerkVoorActie, requirePin } from "@/lib/require-pin";
import { opnieuwKlaarzetten } from "@/lib/offline-queue";
import { STATUS_TEKST, useWachtrijCategorie } from "@/hooks/use-wachtrij-categorie";
import { toast } from "sonner";
import { SECTIONS, type Category } from "@/lib/categories";
import type { MergedCategory } from "@/hooks/use-categories";
import { Pressable, R, T } from "@/components/apple/Primitives";
import { NotitieKaart, NotitieSheet } from "@/components/NotitieSheet";
import { bewaarNotitie, lokaleNotitie } from "@/lib/notities";
import { internetVereist } from "@/lib/internet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type FotoRow = { id: string; url: string; storage_path: string; categorie: string; uploaded_at?: string };

// Donkere wizard: hoog contrast in fel zonlicht
const W = {
  bg: T.titleOnBg,              // #0A2A18
  text: T.surface,              // #FFFFFF
  body: "#DCE8D6",
  label: "#9ED2A8",
  chip: "rgba(255,255,255,0.12)",
  chipBorder: "rgba(255,255,255,0.18)",
  thumb: "#C9D6C4",
  gold: "#FCC934",
  goldInk: "#3D2E00",
  goldBg: "rgba(252,201,52,0.12)",
  goldBorder: "rgba(252,201,52,0.5)",
};

export interface WizardViewProps {
  startIndex: number;
  stationId: string;
  onClose: () => void;
  onSkip: (catName: string, reason?: string) => void | Promise<boolean>;
  onUnskip: (catName: string) => void;
  skipped: string[];
  skippedReasons: Record<string, string>;
  station: { vermogensveld: boolean | null; da_kast: boolean | null; naam_msr: string; behuizingsnummer?: string | null; type_ruimte: string | null; status?: string | null; submitted_at?: string | null };
  fotos: FotoRow[];
  fotosByCategorie: (cat: string) => FotoRow[];
  isUploading: string | null;
  uploadProgress: Record<string, number>;
  onUpload: (cat: string, files: File[]) => void | string[] | Promise<void | string[]>;
  /** Aantal foto's per categorie dat nu wordt voorbereid/bewaard. */
  bewaren?: Record<string, number>;
  onVerstuur?: () => void | Promise<void>;
  onDelete: (id: string, path: string) => void;
  onClickThumb: (cat: string, idx: number) => void;
  onOpenPdf: () => void;
  filledCount: number;
  voorbeelden: { id: string; categorie: string; url: string }[];
  applicableCategories: MergedCategory[];
}

function Chip({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Pressable onClick={onClick} disabled={disabled} scale={0.97} style={{ flex: 1, minHeight: 48, borderRadius: 13, background: W.chip, color: disabled ? "rgba(255,255,255,0.45)" : W.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 15, fontWeight: 600 }}>
      <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </Pressable>
  );
}

type TegelStatus = "server" | "pending" | "uploading" | "done" | "error";
function StatusLabel({ status }: { status: TegelStatus }) {
  const cfg = STATUS_TEKST[status];
  const bg = status === "error" ? T.danger : status === "server" || status === "done" ? T.green : status === "uploading" ? "rgba(10,42,24,0.9)" : T.upload;
  return (
    <span style={{ position: "absolute", left: 4, right: 4, bottom: 4, background: bg, color: W.text, fontSize: 11, fontWeight: 700, lineHeight: 1.2, padding: "4px 6px", borderRadius: 7, display: "flex", alignItems: "center", gap: 4, textAlign: "left" }}>
      <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>{cfg.icoon}</span>
      <span>{cfg.tekst}</span>
    </span>
  );
}

function VoorbeeldKaart({ url, onOpen }: { url?: string; onOpen: () => void }) {
  if (!url) return null;
  return (
    <button type="button" onClick={onOpen} aria-label="Voorbeeldfoto vergroten"
      style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 16, background: W.goldBg, border: `1.5px solid ${W.goldBorder}`, textAlign: "left" }}>
      <span style={{ width: 96, height: 72, flexShrink: 0, borderRadius: 10, position: "relative", overflow: "hidden" }}>
        <LaadAfbeelding src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} wrapperStyle={{ position: "absolute", inset: 0 }} />
        <span style={{ position: "absolute", left: 4, top: 4, background: W.gold, color: W.goldInk, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", padding: "2px 5px", borderRadius: 4 }}>VOORBEELD</span>
      </span>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: W.gold }}>Zo moet het eruitzien</span>
        <span style={{ fontSize: 14, color: W.body }}>Tik om te vergroten</span>
      </span>
      <span className="material-symbols-rounded" style={{ fontSize: 22, color: W.gold }}>open_in_full</span>
    </button>
  );
}


export function WizardView({
  startIndex, stationId, onClose, onSkip, onUnskip, skipped, skippedReasons, station,
  fotosByCategorie, bewaren = {}, onVerstuur,
  onUpload, onDelete, onOpenPdf, filledCount, voorbeelden,
  applicableCategories,
}: WizardViewProps) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [showComplete, setShowComplete] = useState(false);
  const [voorbeeldLightbox, setVoorbeeldLightbox] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [opmerkingText, setOpmerkingText] = useState("");
  const [sheet, setSheet] = useState<null | "notitie" | "skip">(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ foto: FotoRow; index: number } | null>(null);

  const cat = applicableCategories[currentIndex];
  const catFotos = cat ? fotosByCategorie(cat.name) : [];
  const isCatSkipped = cat ? skipped.includes(cat.name) : false;
  const required = cat ? minFotos(cat.id) : 1;
  const section = cat ? SECTIONS.find((s) => s.id === cat.section) : null;
  const catVoorbeelden = cat ? voorbeelden.filter((v) => v.categorie === cat.name) : [];
  const isLast = currentIndex >= applicableCategories.length - 1;
  const serverPaden = useMemo(() => new Set(catFotos.map((f) => f.storage_path)), [catFotos]);
  const { items: wachtrij, leesFout: wachtrijFout } = useWachtrijCategorie(stationId, cat?.name, serverPaden);
  // Een bevestigde serverfoto vervangt zijn wachtrij-preview (dedup op vast pad, niet op bestandsnaam).
  // Een bevestigd verstuurde foto blijft als "Verstuurd" staan tot de serverlijst hem bevat.
  const lokaleItems = wachtrij.filter((w) => !(w.pad && serverPaden.has(w.pad)));
  const bezigMetBewaren = cat ? bewaren[cat.name] ?? 0 : 0;
  const uploading = false;
  const totaal = catFotos.length + lokaleItems.length;
  const taakKlaar = totaal >= required;
  const volgendeNaam = applicableCategories[currentIndex + 1]?.effectiveName;
  const opnieuw = async (item: (typeof lokaleItems)[number]) => {
    if (!navigator.onLine) { toast.error("Geen internet — de foto blijft bewaard op dit toestel en wordt later verstuurd."); return; }
    if (item.beheer && !await fotowerkVoorActie(stationId)) { toast.error("Ontgrendel beheer om deze foto te versturen; hij blijft bewaard op dit toestel."); return; }
    await opnieuwKlaarzetten(item.id);
    await onVerstuur?.();
  };
  const tegels: { key: string; url: string; status: TegelStatus; onClick?: () => void; label: string }[] = [
    ...catFotos.map((f, i) => ({ key: f.id, url: f.url, status: "server" as const, onClick: () => setPhotoPreview({ foto: f, index: i }), label: `Foto ${i + 1}: verstuurd. Bekijken` })),
    ...lokaleItems.map((w, i) => ({ key: w.id, url: w.url, status: w.status as TegelStatus, onClick: w.status === "error" ? () => void opnieuw(w) : undefined,
      label: `Foto ${catFotos.length + i + 1}: ${STATUS_TEKST[w.status].tekst}${w.status === "error" && w.fout ? ` (${w.fout})` : ""}` })),
  ];
  const telling = { pending: 0, uploading: 0, error: 0 } as Record<string, number>;
  for (const w of lokaleItems) telling[w.status] = (telling[w.status] ?? 0) + 1;
  const statusZin = [
    bezigMetBewaren ? `${bezigMetBewaren} foto${bezigMetBewaren > 1 ? "'s" : ""} wordt bewaard…` : "",
    telling.pending ? `${telling.pending} bewaard op dit toestel` : "",
    telling.uploading ? `${telling.uploading} bezig met versturen` : "",
    telling.error ? `${telling.error} versturen mislukt — tik op de foto om opnieuw te proberen` : "",
    catFotos.length ? `${catFotos.length} verstuurd` : "",
  ].filter(Boolean).join(" · ");

  const { data: opmerkingData } = useQuery({
    queryKey: ["opmerking", stationId, cat?.name],
    queryFn: async () => {
      if (!cat) return null;
      const { data } = await supabase.from("categorie_opmerkingen").select("*").eq("station_id", stationId).eq("categorie", cat.name).maybeSingle();
      return data;
    },
    enabled: !!cat,
  });

  useEffect(() => {
    if (sheet === "notitie") return; // tijdens typen niet overschrijven
    setOpmerkingText((cat && lokaleNotitie(stationId, cat.name)) ?? opmerkingData?.opmerking ?? "");
  }, [opmerkingData, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSheet(null); }, [currentIndex]);

  const saveOpmerking = useCallback(async (tekst: string) => {
    if (!cat) return;
    setOpmerkingText(tekst.trim());
    const r = await bewaarNotitie({ stationId, categorie: cat.name, tekst });
    queryClient.invalidateQueries({ queryKey: ["opmerking", stationId, cat.name] });
    queryClient.invalidateQueries({ queryKey: ["opmerkingen", stationId] });
    return r;
  }, [cat, stationId, queryClient]);

  const incompleteCategories = applicableCategories.filter((c) => !categorieKlaar(c.id, fotosByCategorie(c.name).length) && !skipped.includes(c.name));

  const goTo = (index: number) => { setCurrentIndex(index); };
  const goNext = () => { if (!isLast) goTo(currentIndex + 1); else setShowComplete(true); };
  const goPrev = () => { if (currentIndex > 0) goTo(currentIndex - 1); };

  /** Bestanden, station en categorie synchroon vastleggen vóór de eerste await; de FileList wordt direct gewist. */
  const upload = (files: FileList) => {
    if (!cat) return;
    const snapshot = Array.from(files);
    const categorie = cat.name;
    if (snapshot.length) void onUpload(categorie, snapshot);
  };

  const confirmSkip = async (reason: string) => {
    if (!internetVereist()) throw new Error("Internet vereist om N.v.t. op te slaan");
    if (!cat || !reason.trim()) return;
    if (await onSkip(cat.name, reason.trim()) === false) throw new Error("N.v.t. niet opgeslagen — controleer je verbinding en beheerstatus");
    setSheet(null);
    goNext();
  };

  const openAt = (c: Category) => {
    goTo(applicableCategories.findIndex((x) => x.id === c.id));
    setShowComplete(false);
  };

  /* ───────── Afrondscherm (ongewijzigde logica) ───────── */
  if (showComplete || !cat) {
    return (
      <div className="fixed inset-0 z-[70] bg-background flex flex-col animate-fade-up">
        <div className="shrink-0 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-outline-variant/10">
          <button onClick={onClose} aria-label="Sluiten" className="flex h-11 w-11 items-center justify-center -ml-2 text-text-muted hover:text-primary-hover active:scale-95 transition-all">
            <span className="material-symbols-rounded text-[26px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8">
          <div className="flex flex-col items-center py-12 text-center max-w-sm mx-auto">
            <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mb-5 shadow-xl shadow-primary/25">
              <span className="material-symbols-rounded text-primary-foreground text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            </div>
            <h2 className="font-display text-2xl font-black mb-2">Doorlopen!</h2>
            <p className="text-muted-foreground text-sm mb-6">{filledCount} van {applicableCategories.length} categorieën ingevuld</p>
            {incompleteCategories.length > 0 && (
              <div className="w-full bg-orange/[0.08] border border-orange/20 rounded-2xl p-4 mb-5 text-left">
                <div className="text-xs font-black uppercase tracking-wider text-orange mb-3">● Nog open ({incompleteCategories.length})</div>
                {incompleteCategories.map((c) => (
                  <button key={c.id} onClick={() => openAt(c)} className="w-full flex items-center gap-3 py-2.5 text-left border-b border-orange/10 last:border-0">
                    <span className="material-symbols-rounded text-orange text-lg">photo_camera</span>
                    <span className="text-sm font-semibold text-on-surface flex-1">{c.name}</span>
                    <span className="material-symbols-rounded text-muted-foreground/40">chevron_right</span>
                  </button>
                ))}
              </div>
            )}
            {skipped.length > 0 && (
              <div className="w-full bg-surface-container border border-outline-variant/20 rounded-2xl p-4 mb-5 text-left">
                <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">— Overgeslagen ({skipped.length})</div>
                {skipped.map((catName) => (
                  <button key={catName} onClick={() => { onUnskip(catName); const c = applicableCategories.find((x) => x.name === catName); if (c) openAt(c); }} className="w-full flex items-center gap-3 py-2.5 text-left border-b border-outline-variant/10 last:border-0">
                    <span className="material-symbols-rounded text-muted-foreground text-lg">remove</span>
                    <span className="text-sm font-medium text-muted-foreground flex-1 line-through">{catName}</span>
                    <span className="text-xs text-primary font-semibold">Alsnog invullen</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2.5 w-full">
              {incompleteCategories.length === 0 ? (
                <button onClick={() => { onClose(); onOpenPdf(); }} className="w-full min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-rounded" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>PDF downloaden
                </button>
              ) : (
                <button onClick={() => openAt(incompleteCategories[0])} className="w-full min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-rounded">arrow_forward</span>Nog {incompleteCategories.length} open invullen
                </button>
              )}
              <button onClick={onClose} className="w-full min-h-[48px] bg-surface-container rounded-2xl font-semibold text-[14px] text-muted-foreground active:scale-[0.98]">Terug naar overzicht</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const nvtUit = totaal > 0 || isCatSkipped;
  const stationNr = station.behuizingsnummer?.trim();

  /* ───────── Wizard stap ───────── */
  return (
    <div className="fixed inset-0 z-[70] flex flex-col animate-fade-up" style={{ background: W.bg, color: W.text }}>
      {/* Bovenbalk */}
      <div style={{ paddingTop: "calc(8px + env(safe-area-inset-top))", paddingInline: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <Pressable onClick={onClose} aria-label="Sluiten" style={{ width: 44, height: 44, display: "flex", alignItems: "center", color: W.text }}>
            <span className="material-symbols-rounded" style={{ fontSize: 26 }}>close</span>
          </Pressable>
          <span style={{ fontSize: 15, fontFamily: "ui-monospace, monospace", color: W.body }}>{currentIndex + 1} / {applicableCategories.length}</span>
          <Pressable
            onClick={() => setSheet("skip")}
            disabled={nvtUit}
            style={{ minHeight: 44, minWidth: 44, textAlign: "right", fontSize: 17, fontWeight: 500, color: nvtUit ? "rgba(255,255,255,0.35)" : W.text }}
          >
            Nvt
          </Pressable>
        </div>
        <div className="flex gap-0.5" style={{ marginTop: 8 }} aria-label={`Stap ${currentIndex + 1} van ${applicableCategories.length}`}>
          <div style={{ flex: Math.max(currentIndex, 0), height: 4, background: W.label, borderRadius: "2px 0 0 2px" }} />
          <div style={{ flex: 1, height: 4, background: taakKlaar ? W.label : T.current, transition: "background 0.3s ease" }} />
          <div style={{ flex: Math.max(applicableCategories.length - currentIndex - 1, 0), height: 4, background: "rgba(255,255,255,0.16)", borderRadius: "0 2px 2px 0" }} />
        </div>
      </div>

      {/* Inhoud */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "16px 16px 0", scrollbarWidth: "none" }}>
        <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div data-testid="station-context" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 14, color: W.body }}>
            <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 18, flexShrink: 0 }}>location_on</span>
            <span className="font-mono" style={{ flexShrink: 0, color: stationNr ? W.text : W.body, fontStyle: stationNr ? undefined : "italic" }}>{stationNr || "Geen stationsnummer"}</span>
            <span aria-hidden="true">·</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: W.text }}>{station.naam_msr || "Naamloos station"}</span>
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.04em", fontWeight: 600, color: W.label }}>
            {[
              section?.label.toUpperCase(),
              totaal === 0 ? `${required} ${required > 1 ? "FOTO'S" : "FOTO"}` : `${Math.min(totaal, required)} VAN ${required} ${required > 1 ? "FOTO'S" : "FOTO"}${taakKlaar ? " ✓" : ""}`,
            ].filter(Boolean).join(" · ")}
          </div>
          {(() => {
            const extra = [
              cat.id === 14 ? "Alleen fotograferen als het vermogensveld aanwezig is." : "",
              cat.id === 15 ? "Alleen fotograferen als de DA-kast aanwezig is." : "",
              cat.id === 1 && station.type_ruimte === "Betreedbaar station" ? "Bij een betreedbaar station kan deze taak worden overgeslagen." : "",
            ].filter(Boolean);
            const hasInfo = !!(cat.effectiveInstruction || cat.effectiveTip || extra.length);
            return (
              <div style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                {/* Titel over de volle breedte; Notitie/Info lopen eronder door als er geen ruimte is */}
                <h1 className="font-display" style={{ margin: 0, fontSize: "clamp(24px, 7.5vw, 30px)", fontWeight: 700, lineHeight: 1.18, flex: "1 1 220px", minWidth: 0, overflowWrap: "break-word", hyphens: "auto" }} lang="nl">{cat.effectiveName}</h1>
                {!opmerkingText && (
                  <button type="button" onClick={() => setSheet("notitie")} style={{ flexShrink: 0, minHeight: 48, padding: "0 13px", borderRadius: 999, border: "none", background: "rgba(252,201,52,0.16)", color: W.gold, fontSize: 15, fontWeight: 600, marginTop: 2, marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 19 }}>add</span>Notitie
                  </button>
                )}
                {hasInfo && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" aria-label="Informatie" style={{ flexShrink: 0, width: 48, height: 48, borderRadius: 999, border: "none", background: "rgba(255,255,255,0.14)", color: W.text, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 0 }}>
                        <span className="material-symbols-rounded" style={{ fontSize: 24 }}>info</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="z-[90]" style={{ background: "#FFFFFF", color: "#0A2A18", border: "none", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", width: "min(340px, calc(100vw - 24px))", maxHeight: "60vh", overflowY: "auto", borderRadius: 16, padding: 16, fontSize: 15, lineHeight: 1.5 }}>
                      {cat.effectiveInstruction && <p style={{ margin: 0 }}>{cat.effectiveInstruction}</p>}
                      {cat.effectiveTip && <p style={{ margin: "8px 0 0" }}>{cat.effectiveTip}</p>}
                      {extra.map((t) => <p key={t} style={{ margin: "8px 0 0" }}>{t}</p>)}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })()}
          {opmerkingText && <NotitieKaart tekst={opmerkingText} onClick={() => setSheet("notitie")} donker />}
          {isCatSkipped && totaal === 0 ? (
            <div style={{ borderRadius: 14, padding: "12px 14px", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 22, color: W.body }}>block</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: W.body }}>N.V.T.</div>
                <div style={{ fontSize: 15, color: W.text }}>{skippedReasons[cat.name] || "Geen reden opgegeven"}</div>
              </div>
              <Pressable onClick={() => onUnskip(cat.name)} style={{ minHeight: 48, padding: "0 12px", borderRadius: 10, background: "rgba(255,255,255,0.16)", color: W.text, fontSize: 14, fontWeight: 600 }}>Toch foto maken</Pressable>
            </div>
          ) : totaal === 0 && (
            <button type="button" onClick={() => setSheet("skip")} style={{ alignSelf: "flex-start", minHeight: 48, border: "none", background: "none", padding: 0, color: W.body, fontSize: 15, textDecoration: "underline", textUnderlineOffset: 3 }}>Niet gemaakt / N.v.t.</button>
          )}
        </div>

        <VoorbeeldKaart url={catVoorbeelden[0]?.url} onOpen={() => setVoorbeeldLightbox(0)} />
        {totaal === 0 ? (
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} aria-label="Foto maken"
            style={{ marginTop: 12, width: "100%", aspectRatio: "4 / 3", borderRadius: 18, border: "2px dashed rgba(255,255,255,0.35)", background: "transparent", color: W.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 40 }}>add_a_photo</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Jouw foto komt hier</span>
            <span style={{ fontSize: 14, color: W.body, opacity: 0.85 }}>Tik om de camera te openen</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" style={{ marginTop: 12 }}>
              {tegels.map((t) => (
                <button key={t.key} type="button" onClick={t.onClick} disabled={!t.onClick} aria-label={t.label}
                  style={{ aspectRatio: "3 / 4", borderRadius: 14, border: t.status === "error" ? `2px solid ${T.danger}` : "none", padding: 0, position: "relative", overflow: "hidden", background: "transparent" }}>
                  <LaadAfbeelding src={t.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} wrapperStyle={{ position: "absolute", inset: 0 }} />
                  <StatusLabel status={t.status} />
                </button>
              ))}
              {Array.from({ length: Math.max(required - totaal, 1) }).map((_, i) => (
                <button key={`leeg-${i}`} type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Nog een foto toevoegen"
                  style={{ aspectRatio: "3 / 4", borderRadius: 14, border: "2px dashed rgba(255,255,255,0.4)", background: "transparent", color: W.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 28 }}>add</span>
                  {required - totaal > 0 && i === 0 ? `Nog ${required - totaal}` : ""}
                </button>
              ))}
            </div>
          </>
        )}

        <div role="status" aria-live="polite" data-testid="wachtrij-status" style={{ marginTop: 12, padding: "0 4px", fontSize: 14, color: W.body, display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
          {bezigMetBewaren > 0 && <KnopLader label="Foto bewaren…" />}
          {statusZin}
        </div>
        {wachtrijFout && <div role="alert" style={{ marginTop: 8, padding: "0 4px", fontSize: 14, color: "#FFB4A9" }}>Bewaarde foto's op dit toestel konden niet worden gelezen. Controleer de opslag van dit toestel.</div>}

        <div style={{ height: 230 }} />
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />

      {/* Onderbalk: duimzone */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 16px calc(16px + env(safe-area-inset-bottom))", background: `linear-gradient(to top, ${W.bg} 70%, rgba(10,42,24,0))` }}>
        <div style={{ maxWidth: 768, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {taakKlaar ? (
            <Pressable onClick={goNext} className="font-display"
              style={{ minHeight: 72, borderRadius: 22, background: W.text, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 19, fontWeight: 700, padding: "0 16px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isLast || !volgendeNaam ? "Afronden" : `Verder: ${volgendeNaam}`}</span>
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 26 }}>arrow_forward</span>
            </Pressable>
          ) : (
            <Pressable onClick={() => cameraRef.current?.click()} className="font-display"
              style={{ minHeight: 72, borderRadius: 22, background: W.text, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 21, fontWeight: 700 }}>
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 30 }}>photo_camera</span>
              Foto maken
            </Pressable>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {taakKlaar && <Chip icon="add_a_photo" label="Nog een foto" onClick={() => cameraRef.current?.click()} />}
            <Chip icon="photo_library" label="Uit bibliotheek" onClick={() => fileRef.current?.click()} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px", gap: 8 }}>
            <Pressable onClick={goPrev} disabled={currentIndex === 0} style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 4, fontSize: 15, color: currentIndex === 0 ? "rgba(255,255,255,0.35)" : W.body }}>
              <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 20 }}>arrow_back</span>Vorige
            </Pressable>
            {!taakKlaar && (
              <Pressable onClick={goNext} style={{ minHeight: 48, display: "flex", alignItems: "center", gap: 4, fontSize: 15, color: W.body, padding: "0 4px" }}>
                Later invullen<span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 20 }}>arrow_forward</span>
              </Pressable>
            )}
          </div>
        </div>
      </div>

      <Lightbox open={voorbeeldLightbox !== null} close={() => setVoorbeeldLightbox(null)} slides={catVoorbeelden.map((v) => ({ src: v.url }))} index={voorbeeldLightbox ?? 0} />

      {sheet && (
        <NotitieSheet
          key={`${cat.id}-${sheet}`}
          soort={sheet}
          titel={sheet === "skip" ? `Niet gemaakt: ${cat.effectiveName}` : `Notitie: ${cat.effectiveName}`}
          begin={sheet === "skip" ? skippedReasons[cat.name] ?? "" : opmerkingText}
          stationId={stationId}
          categorie={cat.name}
          onClose={() => setSheet(null)}
          onSave={sheet === "skip" ? confirmSkip : saveOpmerking}
        />
      )}

      {/* Foto groot */}
      {photoPreview && (
        <div className="fixed inset-0 z-[105] flex flex-col" style={{ background: "#000" }}>
          <div className="flex items-center justify-between px-3 pt-[env(safe-area-inset-top)]" style={{ minHeight: 56 }}>
            <button onClick={() => setPhotoPreview(null)} aria-label="Sluiten" className="h-11 w-11 text-white"><span className="material-symbols-rounded">close</span></button>
            <button onClick={() => { setDeleteTarget({ id: photoPreview.foto.id, path: photoPreview.foto.storage_path }); setPhotoPreview(null); }} className="flex items-center gap-2 px-3 text-white" style={{ minHeight: 44, fontSize: 16, fontWeight: 600 }}>
              <span className="material-symbols-rounded">delete</span>Verwijderen
            </button>
          </div>
          <LaadAfbeelding wrapperClassName="min-h-0 flex-1" wrapperStyle={{ height: "auto", background: "transparent" }} src={photoPreview.foto.url} alt="Foto groot weergegeven" className="h-full w-full object-contain" />
        </div>
      )}

      {/* Foto verwijderen */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ color: T.rowText }}>
          <div className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-card rounded-2xl p-6 mx-6 max-w-sm w-full space-y-4 animate-fade-up">
            <h3 className="font-display" style={{ fontSize: 19, fontWeight: 700 }}>Foto verwijderen?</h3>
            <p style={{ fontSize: 15, color: T.bodyOnBg }}>Deze actie kan niet ongedaan worden gemaakt.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} style={{ minHeight: 48, padding: "0 16px", fontSize: 16, color: T.bodyOnBg }}>Annuleren</button>
              <button
                onClick={async () => {
                  const { id, path } = deleteTarget;
                  setDeleteTarget(null);
                  const ok = await requirePin("Foto verwijderen", "Voer de toegangscode in om deze foto te verwijderen.");
                  if (ok) onDelete(id, path);
                }}
                style={{ minHeight: 48, padding: "0 16px", borderRadius: 12, background: T.danger, color: T.surface, fontSize: 16, fontWeight: 600 }}
              >
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
