// Variant 2b — Foto-wizard "camera eerst"
// Nieuw bestand: src/components/WizardView.tsx
// Vervangt de lokale `WizardView` + `WizardViewProps` in src/pages/StationDetail.tsx (zelfde props).
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { requirePin } from "@/lib/require-pin";
import { SECTIONS, type Category } from "@/lib/categories";
import type { MergedCategory } from "@/hooks/use-categories";
import { Pressable, R, T } from "@/components/apple/Primitives";

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
const AUTO_NEXT_MS = 1500;

export interface WizardViewProps {
  startIndex: number;
  stationId: string;
  onClose: () => void;
  onSkip: (catName: string, reason?: string) => void;
  onUnskip: (catName: string) => void;
  skipped: string[];
  skippedReasons: Record<string, string>;
  station: { vermogensveld: boolean | null; da_kast: boolean | null; naam_msr: string; type_ruimte: string | null };
  fotos: FotoRow[];
  fotosByCategorie: (cat: string) => FotoRow[];
  isUploading: string | null;
  uploadProgress: Record<string, number>;
  onUpload: (cat: string, files: FileList) => void | string[] | Promise<void | string[]>;
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
      <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </Pressable>
  );
}

function StatusBadge({ status, pct, groot }: { status: "ok" | "upload" | "wachtrij"; pct?: number; groot?: boolean }) {
  const cfg = {
    ok: { bg: T.green, icon: "check_circle", label: "Opgeslagen", fill: true },
    upload: { bg: "rgba(10,42,24,0.9)", icon: "cloud_upload", label: pct !== undefined ? `Uploaden ${pct}%` : "Uploaden…", fill: false },
    wachtrij: { bg: T.upload, icon: "cloud_upload", label: "In wachtrij", fill: false },
  }[status];
  if (!groot) {
    return (
      <span aria-label={cfg.label} style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="material-symbols-rounded" style={{ fontSize: 16, color: W.text }}>{status === "ok" ? "check" : "cloud_upload"}</span>
      </span>
    );
  }
  return (
    <span style={{ position: "absolute", left: 12, top: 12, background: cfg.bg, color: W.text, fontSize: 14, fontWeight: 600, padding: "7px 11px", borderRadius: 9, display: "flex", alignItems: "center", gap: 6 }}>
      <span className="material-symbols-rounded" style={{ fontSize: 18, fontVariationSettings: cfg.fill ? "'FILL' 1" : undefined }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function VoorbeeldKaart({ url, onOpen }: { url?: string; onOpen: () => void }) {
  if (!url) return null;
  return (
    <button type="button" onClick={onOpen} aria-label="Voorbeeldfoto vergroten"
      style={{ marginTop: 16, width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 16, background: W.goldBg, border: `1.5px solid ${W.goldBorder}`, textAlign: "left" }}>
      <span style={{ width: 96, height: 72, flexShrink: 0, borderRadius: 10, position: "relative", background: `${W.thumb} center/cover url(${url})` }}>
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
  fotosByCategorie, isUploading, uploadProgress,
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
  const [savingOpmerking, setSavingOpmerking] = useState(false);
  const [opmerkingOpen, setOpmerkingOpen] = useState(false);
  const [opmerkingSaved, setOpmerkingSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string } | null>(null);
  const [skipReasonOpen, setSkipReasonOpen] = useState(false);
  const [skipReasonChoice, setSkipReasonChoice] = useState("");
  const [skipReasonOther, setSkipReasonOther] = useState("");
  const [photoPreview, setPhotoPreview] = useState<{ foto: FotoRow; index: number } | null>(null);
  const [armed, setArmed] = useState(false);       // wacht op upload → automatisch door
  const [autoNext, setAutoNext] = useState(false); // aftellen loopt
  const [aftel, setAftel] = useState(false);       // start animatie aftelbalk
  // Direct zichtbare foto's (lokale preview) tot de echte foto binnen is; offline blijven ze als 'wachtrij'
  const [lokaal, setLokaal] = useState<{ name: string; url: string; wachtrij: boolean }[]>([]);

  const cat = applicableCategories[currentIndex];
  const catFotos = cat ? fotosByCategorie(cat.name) : [];
  const isCatSkipped = cat ? skipped.includes(cat.name) : false;
  const required = cat?.id === 31 ? 3 : 1;
  const section = cat ? SECTIONS.find((s) => s.id === cat.section) : null;
  const catVoorbeelden = cat ? voorbeelden.filter((v) => v.categorie === cat.name) : [];
  const isLast = currentIndex >= applicableCategories.length - 1;
  const uploading = cat ? isUploading === cat.name : false;
  const totaal = catFotos.length + lokaal.length;
  const taakKlaar = totaal >= required;
  const volgendeNaam = applicableCategories[currentIndex + 1]?.effectiveName;
  const tegels = [
    ...catFotos.map((f, i) => ({ key: f.id, url: f.url, status: "ok" as const, onClick: () => setPhotoPreview({ foto: f, index: i }) })),
    ...lokaal.map((l, i) => ({ key: `lokaal-${i}`, url: l.url, status: l.wachtrij ? ("wachtrij" as const) : ("upload" as const), onClick: undefined })),
  ];

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
    setOpmerkingText(opmerkingData?.opmerking || "");
    setOpmerkingOpen(false);
    setOpmerkingSaved(false);
  }, [opmerkingData, currentIndex]);

  const saveOpmerking = async () => {
    if (!cat) return;
    if (!opmerkingText.trim()) {
      await supabase.from("categorie_opmerkingen").delete().eq("station_id", stationId).eq("categorie", cat.name);
    } else {
      setSavingOpmerking(true);
      await supabase.from("categorie_opmerkingen").upsert({ station_id: stationId, categorie: cat.name, opmerking: opmerkingText.trim(), updated_at: new Date().toISOString() }, { onConflict: "station_id,categorie" });
      setSavingOpmerking(false);
    }
    setOpmerkingSaved(true);
    queryClient.invalidateQueries({ queryKey: ["opmerking", stationId, cat.name] });
    queryClient.invalidateQueries({ queryKey: ["opmerkingen", stationId] });
  };

  const incompleteCategories = applicableCategories.filter((c) => fotosByCategorie(c.name).length === 0 && !skipped.includes(c.name));

  const goTo = (index: number) => { setCurrentIndex(index); setArmed(false); setAutoNext(false); setLokaal([]); };
  const goNext = () => { if (!isLast) goTo(currentIndex + 1); else { setAutoNext(false); setShowComplete(true); } };
  const goPrev = () => { if (currentIndex > 0) goTo(currentIndex - 1); };

  // Automatisch door na de vereiste foto('s). Offline: meteen na in wachtrij zetten.
  // Echte foto binnen → lokale upload-previews opruimen (wachtrij-previews blijven staan)
  useEffect(() => { setLokaal((l) => l.filter((x) => x.wachtrij)); }, [catFotos.length]);

  useEffect(() => {
    if (!armed || uploading) return;
    const wachtrij = lokaal.filter((x) => x.wachtrij).length;
    if (catFotos.length + wachtrij >= required) { setArmed(false); setAutoNext(true); }
  }, [armed, uploading, catFotos.length, lokaal, required]);

  useEffect(() => {
    if (!autoNext) { setAftel(false); return; }
    try { navigator.vibrate?.(30); } catch { /* */ }
    const raf = requestAnimationFrame(() => setAftel(true));
    const t = window.setTimeout(goNext, AUTO_NEXT_MS);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [autoNext]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (files: FileList) => {
    if (!cat) return;
    const offline = !navigator.onLine;
    const eerste = totaal < required && totaal + files.length >= required;
    // Namen direct vastleggen: de FileList wordt leeg zodra het invoerveld gewist is.
    const entries = Array.from(files).map((f) => ({ name: f.name, url: URL.createObjectURL(f), wachtrij: offline }));
    setLokaal((l) => [...l, ...entries]);
    void Promise.resolve(onUpload(cat.name, files)).then((mislukt) => {
      // Foto's die niet zijn opgeslagen (te groot, ongeldig type of mislukte upload)
      // verdwijnen weer uit beeld zodat de taak niet als afgerond telt.
      if (Array.isArray(mislukt) && mislukt.length > 0) {
        const faalSet = new Set(mislukt);
        const weg = entries.filter((e) => faalSet.has(e.name)).map((e) => e.url);
        weg.forEach((u) => URL.revokeObjectURL(u));
        if (weg.length > 0) {
          const wegSet = new Set(weg);
          setLokaal((l) => l.filter((x) => !wegSet.has(x.url)));
        }
      }
      if (eerste) setArmed(true);
    });
  };

  const confirmSkip = () => {
    if (!cat) return;
    const reason = skipReasonChoice === "Anders" ? skipReasonOther.trim() : skipReasonChoice;
    if (!reason) return;
    onSkip(cat.name, reason);
    setSkipReasonOpen(false);
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
          <button onClick={onClose} className="flex items-center gap-1 text-text-muted hover:text-primary-hover text-[13px] font-medium active:scale-95 transition-all">
            <span className="material-symbols-rounded text-[20px]">close</span>
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
  const pct = uploadProgress[cat.name];

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
            onClick={() => { setSkipReasonChoice(""); setSkipReasonOther(""); setSkipReasonOpen(true); }}
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
          <div style={{ fontSize: 13, letterSpacing: "0.04em", fontWeight: 600, color: W.label }}>
            {[
              section?.label.toUpperCase(),
              totaal === 0 ? `${required} ${required > 1 ? "FOTO'S" : "FOTO"}` : `${Math.min(totaal, required)} VAN ${required} ${required > 1 ? "FOTO'S" : "FOTO"}${taakKlaar ? " ✓" : ""}`,
            ].filter(Boolean).join(" · ")}
          </div>
          <h1 className="font-display" style={{ margin: 0, fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{cat.effectiveName}</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: W.body }}>{[cat.effectiveInstruction, cat.effectiveTip].filter(Boolean).join(" ")}</p>
          {cat.id === 14 && <p style={{ margin: 0, fontSize: 15, color: W.body }}>Alleen fotograferen als het vermogensveld aanwezig is.</p>}
          {cat.id === 15 && <p style={{ margin: 0, fontSize: 15, color: W.body }}>Alleen fotograferen als de DA-kast aanwezig is.</p>}
          {cat.id === 1 && station.type_ruimte === "Betreedbaar station" && <p style={{ margin: 0, fontSize: 15, color: W.body }}>Bij een betreedbaar station kan deze taak worden overgeslagen.</p>}
        </div>

        <VoorbeeldKaart url={catVoorbeelden[0]?.url} onOpen={() => setVoorbeeldLightbox(0)} />
        {totaal === 0 ? (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Foto toevoegen"
            style={{ marginTop: 12, width: "100%", aspectRatio: "4 / 3", borderRadius: 18, border: "2px dashed rgba(255,255,255,0.35)", background: "transparent", color: W.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 40 }}>add_a_photo</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Jouw foto komt hier</span>
            <span style={{ fontSize: 14, color: W.body, opacity: 0.85 }}>Camera, fotobibliotheek of bestand</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2" style={{ marginTop: 12 }}>
              {tegels.map((t) => (
                <button key={t.key} type="button" onClick={t.onClick} disabled={!t.onClick} aria-label="Foto bekijken"
                  style={{ aspectRatio: "3 / 4", borderRadius: 14, border: "none", padding: 0, position: "relative", overflow: "hidden", background: `${W.thumb} center/cover url(${t.url})`, boxShadow: autoNext ? `0 0 0 2.5px ${W.label}` : "none" }}>
                  <StatusBadge status={t.status} />
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
            {uploading && pct !== undefined && (
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.16)" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: W.label, transition: "width 0.2s ease" }} />
              </div>
            )}
          </>
        )}

        {required > 1 && totaal > 0 && (
          <div style={{ display: "flex", gap: 14, marginTop: 12, padding: "0 4px", fontSize: 13, color: W.body }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: W.label }} />Opgeslagen</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: T.upload }} />In wachtrij (offline)</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Chip icon="edit_note" label={opmerkingText ? "Opmerking ✓" : "Opmerking"} onClick={() => setOpmerkingOpen(!opmerkingOpen)} />
        </div>
        {opmerkingOpen && (
          <div style={{ marginTop: 10, background: W.chip, borderRadius: 13, padding: "12px 14px" }}>
            <textarea value={opmerkingText} onChange={(e) => setOpmerkingText(e.target.value)} onBlur={saveOpmerking} placeholder="Voeg een opmerking toe" rows={3} autoFocus className="w-full resize-none bg-transparent outline-none" style={{ color: W.text, fontSize: 16 }} />
            {savingOpmerking && <div style={{ fontSize: 13, color: W.body }}>Opslaan…</div>}
            {opmerkingSaved && !savingOpmerking && <div style={{ fontSize: 13, color: W.label }}>Bewaard</div>}
          </div>
        )}
        <div style={{ height: 180 }} />
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />

      {/* Onderbalk: duimzone */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "14px 16px calc(16px + env(safe-area-inset-bottom))", background: `linear-gradient(to top, ${W.bg} 70%, rgba(10,42,24,0))` }}>
        <div style={{ maxWidth: 768, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {autoNext ? (
            <div role="status" style={{ minHeight: 88, borderRadius: 22, background: T.green, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 12, padding: "0 12px 0 20px" }}>
              <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: aftel ? "100%" : "0%", background: "rgba(255,255,255,0.12)", transition: `width ${AUTO_NEXT_MS}ms linear` }} />
              <span className="material-symbols-rounded" style={{ fontSize: 30, fontVariationSettings: "'FILL' 1", position: "relative" }}>check_circle</span>
              <span style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>Opgeslagen</span>
                <span style={{ fontSize: 14, color: W.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isLast || !volgendeNaam ? "Afronden…" : `Volgende: ${volgendeNaam}`}</span>
              </span>
              <Pressable onClick={() => setAutoNext(false)} style={{ position: "relative", minHeight: 48, padding: "0 14px", borderRadius: 12, background: "rgba(255,255,255,0.18)", color: W.text, fontSize: 15, fontWeight: 600 }}>Blijf hier</Pressable>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <Pressable onClick={() => cameraRef.current?.click()} disabled={uploading} aria-label="Camera openen"
                style={{ width: 88, minHeight: 88, borderRadius: 22, background: W.chip, border: `1px solid ${W.chipBorder}`, color: W.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className={`material-symbols-rounded${uploading ? " animate-spin" : ""}`} style={{ fontSize: 32 }}>{uploading ? "progress_activity" : "photo_camera"}</span>
              </Pressable>
              <Pressable onClick={goNext} className="font-display"
                style={{ flex: 1, minHeight: 88, borderRadius: 22, background: W.text, color: T.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 21, fontWeight: 700 }}>
                {isLast ? "Afronden" : "Volgende"}
                <span className="material-symbols-rounded" style={{ fontSize: 26 }}>arrow_forward</span>
              </Pressable>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
            <Pressable onClick={goPrev} disabled={currentIndex === 0} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 4, fontSize: 15, color: currentIndex === 0 ? "rgba(255,255,255,0.35)" : W.body }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_back</span>Vorige
            </Pressable>
            {!taakKlaar && !autoNext && (
              <Pressable onClick={goNext} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 4, fontSize: 15, color: W.body }}>
                Later doen<span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
              </Pressable>
            )}
          </div>
        </div>
      </div>

      <Lightbox open={voorbeeldLightbox !== null} close={() => setVoorbeeldLightbox(null)} slides={catVoorbeelden.map((v) => ({ src: v.url }))} index={voorbeeldLightbox ?? 0} />

      {/* Nvt-reden */}
      {skipReasonOpen && (
        <div className="fixed inset-0 z-[110] flex items-end bg-on-surface/40" style={{ color: T.rowText }}>
          <div className="w-full rounded-t-2xl bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: T.titleOnBg }}>Waarom is deze taak nvt?</h3>
            <p style={{ marginTop: 4, fontSize: 15, color: T.bodyOnBg }}>Kies een reden om verder te gaan.</p>
            <div className="mt-4 space-y-2">
              {["Niet aanwezig", "Niet toegankelijk", "Anders"].map((reason) => (
                <button key={reason} onClick={() => setSkipReasonChoice(reason)} className="flex w-full items-center gap-3 px-3 text-left" style={{ minHeight: 52, fontSize: 17, borderRadius: 12, background: skipReasonChoice === reason ? T.soft : "transparent", color: skipReasonChoice === reason ? T.green : T.rowText }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 22 }}>{skipReasonChoice === reason ? "check_circle" : "radio_button_unchecked"}</span>{reason}{reason === "Anders" ? "…" : ""}
                </button>
              ))}
              {skipReasonChoice === "Anders" && <textarea autoFocus value={skipReasonOther} onChange={(e) => setSkipReasonOther(e.target.value)} rows={2} placeholder="Vul de reden in" className="w-full rounded-xl bg-surface-low p-3 outline-none" style={{ fontSize: 16 }} />}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setSkipReasonOpen(false)} className="flex-1" style={{ minHeight: 56, fontSize: 17, color: T.bodyOnBg }}>Annuleren</button>
              <button onClick={confirmSkip} disabled={!skipReasonChoice || (skipReasonChoice === "Anders" && !skipReasonOther.trim())} className="flex-1 disabled:opacity-40" style={{ minHeight: 56, borderRadius: R.control, background: T.green, color: T.surface, fontSize: 17, fontWeight: 600 }}>Opslaan</button>
            </div>
          </div>
        </div>
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
          <img src={photoPreview.foto.url} alt="Foto groot weergegeven" className="min-h-0 flex-1 object-contain" />
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
