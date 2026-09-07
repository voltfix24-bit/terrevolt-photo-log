import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requirePin } from "@/lib/require-pin";
import { CATEGORIES, SECTIONS, getCategoriesBySection, getApplicableCategories, slugify, type Category, type Section } from "@/lib/categories";
import { useMergedCategories, type MergedCategory } from "@/hooks/use-categories";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import imageCompression from "browser-image-compression";
import { useOnline } from "@/hooks/use-online";
import { queuePhoto } from "@/lib/offline-queue";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { useVoorbeelden } from "@/components/CategorieSettings";
import { useInstellingen } from "@/hooks/use-theme";
import { GlassBar, Group, Hairline, Pressable, T, R, M, ROW_MIN, ROW_PAD_X, ICON, ICON_GAP, INSET_HEAD, INSET_ROW } from "@/components/apple/Primitives";

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/webp"];

type FotoRow = { id: string; url: string; storage_path: string; categorie: string; uploaded_at?: string };

/* ==================== DROP ZONE COMPONENT ==================== */
function DropZone({ onFiles, disabled, onClick, children }: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDrag = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
  }, [disabled, onFiles]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onDragOver={handleDrag}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-3xl py-10 px-6 text-center cursor-pointer border-2 transition-all active:scale-[0.99] w-full ${
        dragging
          ? "border-primary bg-primary/8 scale-[1.01]"
          : "border-dashed border-outline-variant/20 bg-surface-low hover:border-primary/30 hover:bg-primary/[0.04]"
      }`}
    >
      {children}
    </button>
  );
}

/* ==================== SKIP TRACKING ==================== */
function useSkippedCategories(stationId: string | undefined) {
  const key = `skipped-${stationId}`;
  const reasonsKey = `skip-reasons-${stationId}`;
  const queryClient = useQueryClient();
  const [skipped, setSkippedRaw] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [skippedReasons, setSkippedReasons] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(reasonsKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const { data: storedSkips } = useQuery({
    queryKey: ['categorie-skips', stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categorie_skips').select('categorie, reden').eq('station_id', stationId ?? '');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!stationId,
  });

  useEffect(() => {
    if (!storedSkips) return;
    const names = storedSkips.map(item => item.categorie);
    const reasons = Object.fromEntries(storedSkips.map(item => [item.categorie, item.reden]));
    setSkippedRaw(names);
    setSkippedReasons(reasons);
    try {
      localStorage.setItem(key, JSON.stringify(names));
      localStorage.setItem(reasonsKey, JSON.stringify(reasons));
    } catch { /* */ }
  }, [key, reasonsKey, storedSkips]);

  const setSkipped = useCallback((fn: (prev: string[]) => string[]) => {
    setSkippedRaw(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [key]);

  const addSkip = useCallback((catName: string, reason?: string) => {
    setSkipped(prev => prev.includes(catName) ? prev : [...prev, catName]);
    if (reason) {
      setSkippedReasons(prev => {
        const next = { ...prev, [catName]: reason };
        try { localStorage.setItem(reasonsKey, JSON.stringify(next)); } catch { /* */ }
        return next;
      });
      if (stationId) {
        void supabase.from('categorie_skips').upsert({ station_id: stationId, categorie: catName, reden: reason, updated_at: new Date().toISOString() }, { onConflict: 'station_id,categorie' }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
        });
      }
    }
  }, [queryClient, reasonsKey, setSkipped, stationId]);

  const removeSkip = useCallback((catName: string) => {
    setSkipped(prev => prev.filter(n => n !== catName));
    setSkippedReasons(prev => {
      const next = { ...prev };
      delete next[catName];
      try { localStorage.setItem(reasonsKey, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
    if (stationId) {
      void supabase.from('categorie_skips').delete().eq('station_id', stationId).eq('categorie', catName).then(() => {
        queryClient.invalidateQueries({ queryKey: ['categorie-skips', stationId] });
      });
    }
  }, [queryClient, reasonsKey, setSkipped, stationId]);

  const toggleSkip = useCallback((catName: string) => {
    setSkipped(prev =>
      prev.includes(catName)
        ? prev.filter(n => n !== catName)
        : [...prev, catName]
    );
  }, [setSkipped]);

  const isSkipped = useCallback((catName: string) => skipped.includes(catName), [skipped]);

  return { skipped, skippedReasons, addSkip, removeSkip, toggleSkip, isSkipped };
}

/* ==================== SECTION ICONS ==================== */
function getSectionIcon(sectionId: string): string {
  const icons: Record<string, string> = {
    'algemeen': 'home_work',
    'ms-deel': 'electrical_services',
    'kabels-ms': 'cable',
    'trafo': 'transform',
    'ls-deel': 'electric_meter',
    'meting': 'analytics',
    'ovl-deel': 'light',
    'gebouw': 'apartment',
  };
  return icons[sectionId] || 'folder';
}

/* ==================== CATEGORY ROW ==================== */
function CategoryRow({ cat, fotos, isSkipped, skipReason, hasOpmerking, onOpen }: {
  cat: MergedCategory; fotos: FotoRow[]; isSkipped?: boolean; skipReason?: string; hasOpmerking?: boolean; onOpen: () => void;
}) {
  const hasPhotos = fotos.length > 0;

  const nvt = Boolean(isSkipped && !hasPhotos);
  const icon = nvt ? "block" : hasPhotos ? "check_circle" : "photo_camera";
  const iconColor = nvt ? T.muted : hasPhotos ? T.done : T.green;
  return (
    <Pressable
      data-cat-id={cat.id}
      onClick={onOpen}
      scale={0.985}
      style={{ width: "100%", minHeight: ROW_MIN, display: "flex", alignItems: "center", gap: ICON_GAP, padding: `15px ${ROW_PAD_X}px`, textAlign: "left" }}
    >
      <span className="material-symbols-rounded shrink-0" style={{ fontSize: ICON, color: iconColor, fontVariationSettings: hasPhotos ? "'FILL' 1" : undefined }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, color: nvt || hasPhotos ? T.rowSub : T.rowText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.effectiveName}</div>
        {nvt && skipReason && <div style={{ fontSize: 14, color: T.muted, marginTop: 1 }}>{skipReason}</div>}
      </div>
      {hasPhotos && <span style={{ fontSize: 15, color: T.muted, fontFamily: "ui-monospace, monospace" }}>{fotos.length}</span>}
      {hasOpmerking && <span className="sr-only">Met opmerking</span>}
      <span className="material-symbols-rounded shrink-0" style={{ fontSize: 19, color: T.chevron }}>chevron_right</span>
    </Pressable>
  );
}

/* ==================== WIZARD VIEW ==================== */
interface WizardViewProps {
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
  onUpload: (cat: string, files: FileList) => void;
  onDelete: (id: string, path: string) => void;
  onClickThumb: (cat: string, idx: number) => void;
  onOpenPdf: () => void;
  filledCount: number;
  voorbeelden: { id: string; categorie: string; url: string }[];
  applicableCategories: MergedCategory[];
}

function WizardView({
  startIndex, stationId, onClose, onSkip, onUnskip, skipped, skippedReasons, station,
  fotosByCategorie, isUploading, uploadProgress,
  onUpload, onDelete, onClickThumb, onOpenPdf, filledCount, voorbeelden,
  applicableCategories,
}: WizardViewProps) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [showComplete, setShowComplete] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [showVoorbeeld, setShowVoorbeeld] = useState(false);
  const [voorbeeldLightbox, setVoorbeeldLightbox] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [opmerkingText, setOpmerkingText] = useState('');
  const [savingOpmerking, setSavingOpmerking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; path: string } | null>(null);
  const [skipReasonOpen, setSkipReasonOpen] = useState(false);
  const [skipReasonChoice, setSkipReasonChoice] = useState('');
  const [skipReasonOther, setSkipReasonOther] = useState('');
  const [opmerkingOpen, setOpmerkingOpen] = useState(false);
  const [opmerkingSaved, setOpmerkingSaved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ foto: FotoRow; index: number } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const cat = applicableCategories[currentIndex];
  const catFotos = cat ? fotosByCategorie(cat.name) : [];
  const isCatSkipped = cat ? skipped.includes(cat.name) : false;
  const hasPhotos = catFotos.length > 0;
  const section = cat ? SECTIONS.find(s => s.id === cat.section) : null;
  const catVoorbeelden = cat ? voorbeelden.filter(v => v.categorie === cat.name) : [];

  const isVermogensveld = cat?.id === 14;
  const isDaKast = cat?.id === 15;
  const isTypeplaatje = cat?.id === 1 && station.type_ruimte === 'Betreedbaar station';

  const { data: opmerkingData } = useQuery({
    queryKey: ['opmerking', stationId, cat?.name],
    queryFn: async () => {
      if (!cat) return null;
      const { data } = await supabase
        .from('categorie_opmerkingen')
        .select('*')
        .eq('station_id', stationId)
        .eq('categorie', cat.name)
        .maybeSingle();
      return data;
    },
    enabled: !!cat,
  });

  useEffect(() => {
    setOpmerkingText(opmerkingData?.opmerking || '');
    setOpmerkingOpen(false);
    setOpmerkingSaved(false);
  }, [opmerkingData, currentIndex]);

  const saveOpmerking = async () => {
    if (!cat) return;
    if (!opmerkingText.trim()) {
      await supabase.from('categorie_opmerkingen').delete().eq('station_id', stationId).eq('categorie', cat.name);
      queryClient.invalidateQueries({ queryKey: ['opmerking', stationId, cat.name] });
      queryClient.invalidateQueries({ queryKey: ['opmerkingen', stationId] });
      setOpmerkingSaved(true);
      return;
    }
    setSavingOpmerking(true);
    await supabase.from('categorie_opmerkingen').upsert({
      station_id: stationId,
      categorie: cat.name,
      opmerking: opmerkingText.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'station_id,categorie' });
    setSavingOpmerking(false);
    setOpmerkingSaved(true);
    queryClient.invalidateQueries({ queryKey: ['opmerking', stationId, cat.name] });
    queryClient.invalidateQueries({ queryKey: ['opmerkingen', stationId] });
  };

  const incompleteCategories = applicableCategories.filter(c =>
    fotosByCategorie(c.name).length === 0 && !skipped.includes(c.name)
  );

  const goNext = () => {
    if (currentIndex < applicableCategories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setTipOpen(false);
      setShowVoorbeeld(false);
    } else {
      setShowComplete(true);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setTipOpen(false);
      setShowVoorbeeld(false);
    }
  };

  const handleSkip = () => {
    if (!cat) return;
    setSkipReasonChoice('');
    setSkipReasonOther('');
    setSkipReasonOpen(true);
  };

  const confirmSkip = () => {
    if (!cat) return;
    const reason = skipReasonChoice === 'Anders' ? skipReasonOther.trim() : skipReasonChoice;
    if (!reason) return;
    onSkip(cat.name, reason);
    setSkipReasonOpen(false);
    goNext();
  };

  const openAt = (c: Category) => {
    const idx = applicableCategories.findIndex(x => x.id === c.id);
    setCurrentIndex(idx);
    setShowComplete(false);
    setTipOpen(false);
    setShowVoorbeeld(false);
  };

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
            <p className="text-muted-foreground text-sm mb-6">
              {filledCount} van {applicableCategories.length} categorieën ingevuld
            </p>

            {incompleteCategories.length > 0 && (
              <div className="w-full bg-orange/[0.08] border border-orange/20 rounded-2xl p-4 mb-5 text-left">
                <div className="text-xs font-black uppercase tracking-wider text-orange mb-3">● Nog open ({incompleteCategories.length})</div>
                {incompleteCategories.map(c => (
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
                {skipped.map(catName => (
                  <button key={catName} onClick={() => {
                    onUnskip(catName);
                    const c = applicableCategories.find(x => x.name === catName);
                    if (c) openAt(c);
                  }} className="w-full flex items-center gap-3 py-2.5 text-left border-b border-outline-variant/10 last:border-0">
                    <span className="material-symbols-rounded text-muted-foreground text-lg">remove</span>
                    <span className="text-sm font-medium text-muted-foreground flex-1 line-through">{catName}</span>
                    <span className="text-xs text-primary font-semibold">Alsnog invullen</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2.5 w-full">
              {incompleteCategories.length === 0 ? (
                <button onClick={() => { onClose(); onOpenPdf(); }} className="w-full min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-rounded" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>
                  PDF downloaden
                </button>
              ) : (
                <button onClick={() => openAt(incompleteCategories[0])} className="w-full min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-rounded">arrow_forward</span>
                  Nog {incompleteCategories.length} open invullen
                </button>
              )}
              <button onClick={onClose} className="w-full min-h-[48px] bg-surface-container rounded-2xl font-semibold text-[14px] text-muted-foreground active:scale-[0.98]">
                Terug naar overzicht
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col animate-fade-up" style={{ background: T.bg }}>
      <GlassBar position="top">
        <div className="flex min-h-11 items-center justify-between">
          <Pressable onClick={onClose} style={{ minHeight: 44, minWidth: 72, textAlign: "left", fontSize: 17, color: T.green }}>Sluit</Pressable>
          <span style={{ fontSize: 15, color: T.subOnBg, fontFamily: "ui-monospace, monospace" }}>{currentIndex + 1} / {applicableCategories.length}</span>
          <Pressable onClick={handleSkip} disabled={hasPhotos || isCatSkipped} style={{ minHeight: 44, minWidth: 72, textAlign: "right", fontSize: 17, color: hasPhotos || isCatSkipped ? "transparent" : T.green }}>Nvt</Pressable>
        </div>
        <div className="flex gap-0.5 mt-3" aria-label={`Stap ${currentIndex + 1} van ${applicableCategories.length}`}>
          <div style={{ flex: Math.max(currentIndex, 0), height: 4, background: T.green, borderRadius: "2px 0 0 2px" }} />
          <div style={{ flex: 1, height: 4, background: T.current }} />
          <div style={{ flex: Math.max(applicableCategories.length - currentIndex - 1, 0), height: 4, background: "rgba(31,92,58,0.16)", borderRadius: "0 2px 2px 0" }} />
        </div>
      </GlassBar>

      <div className="flex-1 overflow-y-auto pb-28" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ padding: "20px 20px 16px" }}>
          {section && <div style={{ fontSize: 13, color: T.green, letterSpacing: "0.04em" }}>{section.label.toUpperCase()}</div>}
          <h1 className="font-display" style={{ fontSize: 28, fontWeight: 500, color: T.titleOnBg, marginTop: 3, lineHeight: 1.15 }}>{cat.effectiveName}</h1>
          <p style={{ fontSize: 16, color: T.bodyOnBg, marginTop: 10, lineHeight: 1.5 }}>{[cat.effectiveInstruction, cat.effectiveTip].filter(Boolean).join(" ")}</p>
          {isVermogensveld && <p style={{ fontSize: 14, color: T.subOnBg, marginTop: 9 }}>Alleen fotograferen als het vermogensveld aanwezig is.</p>}
          {isDaKast && <p style={{ fontSize: 14, color: T.subOnBg, marginTop: 9 }}>Alleen fotograferen als de DA-kast aanwezig is.</p>}
          {isTypeplaatje && <p style={{ fontSize: 14, color: T.subOnBg, marginTop: 9 }}>Bij een betreedbaar station kan deze taak worden overgeslagen.</p>}
        </div>

        <div style={{ padding: "0 12px" }}>
          <Group>
            <Pressable onClick={() => catVoorbeelden[0] && setVoorbeeldLightbox(0)} disabled={!catVoorbeelden[0]} scale={0.985} style={{ width: "100%", minHeight: ROW_MIN, display: "flex", alignItems: "center", gap: ICON_GAP, padding: `15px ${ROW_PAD_X}px`, textAlign: "left" }}>
              <span className="material-symbols-rounded" style={{ fontSize: ICON, color: catVoorbeelden[0] ? T.green : T.muted }}>photo</span>
              <span style={{ flex: 1, fontSize: 17, color: catVoorbeelden[0] ? T.rowText : T.rowSub }}>Voorbeeldfoto</span>
              <span className="material-symbols-rounded" style={{ fontSize: 19, color: T.chevron }}>chevron_right</span>
            </Pressable>
            <Hairline />
            <Pressable onClick={() => setOpmerkingOpen(!opmerkingOpen)} scale={0.985} style={{ width: "100%", minHeight: ROW_MIN, display: "flex", alignItems: "center", gap: ICON_GAP, padding: `15px ${ROW_PAD_X}px`, textAlign: "left" }}>
              <span className="material-symbols-rounded" style={{ fontSize: ICON, color: T.green }}>edit_note</span>
              <span className="truncate" style={{ flex: 1, fontSize: 17, color: opmerkingText ? T.rowText : T.rowSub }}>{opmerkingText || "Opmerking toevoegen"}</span>
              <span className="material-symbols-rounded" style={{ fontSize: 19, color: T.chevron }}>chevron_right</span>
            </Pressable>
            {opmerkingOpen && <div style={{ padding: `0 ${ROW_PAD_X}px 15px ${INSET_ROW}px` }}>
              <textarea value={opmerkingText} onChange={e => setOpmerkingText(e.target.value)} onBlur={saveOpmerking} placeholder="Voeg een opmerking toe" rows={3} className="w-full resize-none bg-transparent text-sm outline-none" style={{ color: T.rowText }} />
              {savingOpmerking && <div style={{ fontSize: 13, color: T.rowSub }}>Opslaan...</div>}
              {opmerkingSaved && !savingOpmerking && <div style={{ fontSize: 13, color: T.done }}>Bewaard</div>}
            </div>}
          </Group>

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) onUpload(cat.name, e.target.files); e.target.value = ""; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) onUpload(cat.name, e.target.files); e.target.value = ""; }} />

          {!hasPhotos && <DropZone onFiles={(files) => onUpload(cat.name, files)} disabled={isUploading === cat.name} onClick={() => cameraRef.current?.click()}>
            <span className="material-symbols-rounded" style={{ fontSize: 44, color: T.green }}>photo_camera</span>
            <div style={{ fontSize: 17, color: T.rowText, marginTop: 14 }}>Tik om te fotograferen</div>
            <div style={{ fontSize: 14, color: T.rowSub, marginTop: 4 }}>{cat.id === 31 ? 3 : 1} {cat.id === 31 ? "foto's vereist" : "foto vereist"}</div>
          </DropZone>}
          {!hasPhotos && <Pressable onClick={() => fileRef.current?.click()} style={{ width: "100%", minHeight: 44, color: T.green, fontSize: 15 }}>Uit galerij kiezen</Pressable>}

          {isUploading === cat.name && uploadProgress[cat.name] !== undefined && <div className="mt-3 h-1 overflow-hidden rounded-sm" style={{ background: T.hairline }}><div className="h-full" style={{ width: `${uploadProgress[cat.name]}%`, background: T.green }} /></div>}

          {hasPhotos && <div className="grid grid-cols-3 gap-2 mb-4">
            {catFotos.map((foto, i) => <div key={foto.id} className="relative aspect-square overflow-hidden" style={{ borderRadius: R.small }}>
              <button onClick={() => setPhotoPreview({ foto, index: i })} className="h-full w-full"><img src={foto.url} alt="Opgenomen foto" className="h-full w-full object-cover" /></button>
            </div>)}
            <Pressable onClick={() => fileRef.current?.click()} disabled={isUploading === cat.name} style={{ aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.green }}>
              <span className="material-symbols-rounded" style={{ fontSize: 24 }}>add</span><span style={{ fontSize: 14 }}>Meer</span>
            </Pressable>
          </div>}
          <Lightbox open={voorbeeldLightbox !== null} close={() => setVoorbeeldLightbox(null)} slides={catVoorbeelden.map(v => ({ src: v.url }))} index={voorbeeldLightbox ?? 0} />
        </div>
      </div>

      <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2.5">
          {currentIndex > 0 && <Pressable onClick={goPrev} aria-label="Vorige" style={{ width: 56, height: 56, borderRadius: R.control, background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span className="material-symbols-rounded" style={{ fontSize: 21, color: T.green }}>arrow_back</span></Pressable>}
          <Pressable onClick={goNext} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, background: T.green, color: T.surface, fontSize: 17, fontWeight: 500, padding: 17, borderRadius: R.control, minHeight: ROW_MIN }}>
            {currentIndex < applicableCategories.length - 1 ? "Volgende" : "Afronden"}<span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
          </Pressable>
        </div>
      </GlassBar>

      {skipReasonOpen && <div className="fixed inset-0 z-[110] flex items-end bg-on-surface/40"><div className="w-full rounded-t-2xl bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <h3 className="font-display text-lg font-bold text-on-surface">Waarom is deze taak nvt?</h3><p className="mt-1 text-sm text-text-muted">Kies een reden om verder te gaan.</p>
        <div className="mt-4 space-y-2">{["Niet aanwezig", "Niet toegankelijk", "Anders"].map(reason => <button key={reason} onClick={() => setSkipReasonChoice(reason)} className="flex min-h-[48px] w-full items-center gap-3 px-3 text-left text-sm font-semibold" style={{ color: skipReasonChoice === reason ? T.green : T.rowText }}><span className="material-symbols-rounded text-lg">{skipReasonChoice === reason ? "check_circle" : "radio_button_unchecked"}</span>{reason}{reason === "Anders" ? "…" : ""}</button>)}
          {skipReasonChoice === "Anders" && <textarea autoFocus value={skipReasonOther} onChange={e => setSkipReasonOther(e.target.value)} rows={2} placeholder="Vul de reden in" className="w-full rounded-xl bg-surface-low p-3 text-sm outline-none" />}</div>
        <div className="mt-4 flex gap-2"><button onClick={() => setSkipReasonOpen(false)} className="min-h-[48px] flex-1 text-sm font-semibold text-text-muted">Annuleren</button><button onClick={confirmSkip} disabled={!skipReasonChoice || (skipReasonChoice === "Anders" && !skipReasonOther.trim())} className="min-h-[48px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">Opslaan</button></div>
      </div></div>}
      {photoPreview && <div className="fixed inset-0 z-[105] flex flex-col bg-on-surface"><div className="flex min-h-[56px] items-center justify-between px-3 pt-[env(safe-area-inset-top)]"><button onClick={() => setPhotoPreview(null)} aria-label="Sluiten" className="h-11 w-11 text-primary-foreground"><span className="material-symbols-rounded">close</span></button><button onClick={() => { setDeleteTarget({ id: photoPreview.foto.id, path: photoPreview.foto.storage_path }); setPhotoPreview(null); }} className="min-h-[44px] px-3 flex items-center gap-2 text-sm font-semibold text-primary-foreground"><span className="material-symbols-rounded">delete</span>Verwijderen</button></div><img src={photoPreview.foto.url} alt="Foto groot weergegeven" className="min-h-0 flex-1 object-contain" /></div>}
      {deleteTarget && <div className="fixed inset-0 z-[100] flex items-center justify-center"><div className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} /><div className="relative bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl space-y-4 animate-fade-up"><h3 className="font-display font-extrabold text-lg text-on-surface">Foto verwijderen?</h3><p className="text-sm text-muted-foreground">Deze actie kan niet ongedaan worden gemaakt.</p><div className="flex gap-3 justify-end"><button onClick={() => setDeleteTarget(null)} className="px-4 py-2.5 text-sm font-semibold text-muted-foreground">Annuleren</button><button onClick={async () => { const { id, path } = deleteTarget; setDeleteTarget(null); const ok = await requirePin("Foto verwijderen", "Voer de toegangscode in om deze foto te verwijderen."); if (!ok) return; onDelete(id, path); }} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground">Verwijderen</button></div></div></div>}
    </div>
  );
}

/* ==================== MAIN COMPONENT ==================== */
export default function StationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSlides, setLightboxSlides] = useState<{ src: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>([]);
  const [tipOpen, setTipOpen] = useState<Record<number, boolean>>({});
  const [highlightCatId, setHighlightCatId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartIndex, setWizardStartIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStation, setShareStation] = useState('');
  const { data: voorbeelden } = useVoorbeelden();
  const { data: instellingenData } = useInstellingen();
  const { skipped, skippedReasons, addSkip, removeSkip, isSkipped } = useSkippedCategories(id);
  const isOnline = useOnline();
  const { data: opmerkingen } = useQuery({
    queryKey: ['opmerkingen', id],
    queryFn: async () => {
      const { data } = await supabase.from('categorie_opmerkingen').select('categorie, opmerking').eq('station_id', id!);
      return data ?? [];
    },
  });
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSection = useCallback((sectionId: string) => {
    const isOpening = !openSections.includes(sectionId);
    setOpenSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(s => s !== sectionId)
        : [...prev, sectionId]
    );
    setTimeout(() => {
      const el = sectionRefs.current[sectionId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: isOpening ? 'start' : 'nearest' });
      }
    }, 50);
  }, [openSections]);

  const { data: station, isLoading } = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { categories: allMergedCategories } = useMergedCategories();

  const applicableCategories = useMemo(() => {
    return allMergedCategories.filter(c => {
      if (c.id === 1 && station?.type_ruimte === 'Betreedbaar station') return false;
      if (c.id === 14 && !station?.vermogensveld) return false;
      if (c.id === 15 && !station?.da_kast) return false;
      return true;
    });
  }, [station, allMergedCategories]);

  const sectionGroups = useMemo(() => {
    return SECTIONS.map((section) => ({
      section,
      categories: applicableCategories.filter((c) => c.section === section.id),
    })).filter(g => g.categories.length > 0);
  }, [applicableCategories]);

  const { data: fotos } = useQuery({
    queryKey: ["fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fotos").select("*").eq("station_id", id!).order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const fotosByCategorie = useCallback(
    (cat: string) => (fotos?.filter((f) => f.categorie === cat) ?? []) as FotoRow[],
    [fotos]
  );

  const filledCount = new Set(fotos?.map((f) => f.categorie).filter(c => applicableCategories.some(ac => ac.name === c))).size;
  const pct = Math.round((filledCount / applicableCategories.length) * 100);

  const compressImage = async (file: File): Promise<File> => {
    if (file.type === "image/heic") return file;
    try {
      return await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.85 });
    } catch { return file; }
  };

  const handleUpload = async (categorie: string, files: FileList) => {
    if (!isOnline) {
      let queued = 0;
      for (const file of Array.from(files)) {
        if (file.size > MAX_SIZE) { toast.error(`${file.name} is groter dan 10MB`); continue; }
        await queuePhoto(id!, categorie, file);
        queued++;
      }
      if (queued > 0) {
        toast.success(`${queued} foto${queued > 1 ? "'s" : ""} opgeslagen — wordt geüpload zodra je online bent`, {
          duration: 4000,
        });
      }
      return;
    }

    setUploadingCat(categorie);
    const catSlug = slugify(categorie);
    const total = files.length;
    let done = 0;

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) { toast.error(`${file.name} is groter dan 10MB`); continue; }
      if (!ACCEPTED.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) { toast.error(`${file.name}: ongeldig bestandstype`); continue; }

      const compressed = await compressImage(file);
      const storagePath = `stations/${id}/${catSlug}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("to-fotos").upload(storagePath, compressed);
      if (uploadError) { toast.error(`Upload mislukt: ${uploadError.message}`); continue; }

      const { data: urlData } = supabase.storage.from("to-fotos").getPublicUrl(storagePath);
      await supabase.from("fotos").insert({ station_id: id!, categorie, storage_path: storagePath, url: urlData.publicUrl, volgorde: fotosByCategorie(categorie).length + done, uploaded_at: new Date().toISOString() });

      done++;
      setUploadProgress((p) => ({ ...p, [categorie]: Math.round((done / total) * 100) }));
    }

    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    setUploadingCat(null);
    setUploadProgress((p) => { const next = { ...p }; delete next[categorie]; return next; });
    if (done > 0) toast.success("Foto's geüpload ✓");
  };

  const handleDelete = async (fotoId: string, storagePath: string) => {
    await supabase.storage.from("to-fotos").remove([storagePath]);
    await supabase.from("fotos").delete().eq("id", fotoId);
    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    toast.success("Foto verwijderd");
  };

  const openLightbox = (cat: string, index: number) => {
    const catFotos = fotosByCategorie(cat);
    setLightboxSlides(catFotos.map((f) => ({ src: f.url })));
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const openPdf = () => {
    if (!station || !fotos) return;
    const html = generatePdfHtml(station, fotos, instellingenData ?? undefined, opmerkingen ?? undefined, skipped.map(categorie => ({ categorie, reden: skippedReasons[categorie] || 'Geen reden opgegeven' })));
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    setShareStation(station.naam_msr);
    setTimeout(() => setShareOpen(true), 500);
  };

  const openWizardAt = useCallback((cat: MergedCategory | Category) => {
    const idx = applicableCategories.findIndex(c => c.id === cat.id);
    setWizardStartIndex(idx >= 0 ? idx : 0);
    setWizardOpen(true);
  }, [applicableCategories]);

  useEffect(() => {
    const categoryId = Number(searchParams.get("categorie"));
    if (!categoryId || applicableCategories.length === 0) return;
    const category = applicableCategories.find((item) => item.id === categoryId);
    if (!category) return;
    openWizardAt(category);
    setSearchParams({}, { replace: true });
  }, [applicableCategories, openWizardAt, searchParams, setSearchParams]);

  // Find next incomplete category across applicable categories
  const nextIncomplete = useMemo(() => {
    for (const cat of applicableCategories) {
      if (fotosByCategorie(cat.name).length === 0 && !isSkipped(cat.name)) {
        return cat;
      }
    }
    return null;
  }, [fotosByCategorie, isSkipped, applicableCategories]);

  const allDone = !nextIncomplete;

  // Auto-expand first incomplete section on load
  useEffect(() => {
    if (!fotos) return;
    const firstIncomplete = SECTIONS.find(s => {
      const cats = applicableCategories.filter(c => c.section === s.id);
      return cats.some(c => fotosByCategorie(c.name).length === 0 && !isSkipped(c.name));
    });
    if (firstIncomplete && openSections.length === 0) {
      setOpenSections([firstIncomplete.id]);
    }
  }, [fotos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-24 px-6 max-w-7xl mx-auto">
        <Skeleton className="h-20 w-full rounded-3xl mb-4" />
        <Skeleton className="h-12 w-full rounded-2xl mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!station) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">Station niet gevonden</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={lightboxSlides} index={lightboxIndex} />
      <EditStationDialog station={station} open={editOpen} onOpenChange={setEditOpen} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["station", id] }); queryClient.invalidateQueries({ queryKey: ["stations"] }); }} />

      {/* ── Wizard Overlay ── */}
      {wizardOpen && (
        <WizardView
          startIndex={wizardStartIndex}
          stationId={id!}
          onClose={() => setWizardOpen(false)}
          onSkip={addSkip}
          onUnskip={removeSkip}
          skipped={skipped}
          skippedReasons={skippedReasons}
          station={station}
          fotos={fotos ?? []}
          fotosByCategorie={fotosByCategorie}
          isUploading={uploadingCat}
          uploadProgress={uploadProgress}
          onUpload={handleUpload}
          onDelete={handleDelete}
          onClickThumb={openLightbox}
          onOpenPdf={openPdf}
          filledCount={filledCount}
           voorbeelden={voorbeelden ?? []}
           applicableCategories={applicableCategories}
        />
      )}

      <main className="pb-0 px-3 max-w-3xl mx-auto animate-fade-up" style={{ paddingTop: "calc(10px + env(safe-area-inset-top))" }}>
        {/* ── 1. HERO ── */}
        <div className="px-2 pt-2 pb-5">
          {/* ROW 1: Navigation bar */}
          <div className="flex items-center justify-between mb-4">
            <Pressable onClick={() => navigate('/')} style={{ minHeight: 44, minWidth: 70, textAlign: "left", color: T.green, fontSize: 17 }}>Stations</Pressable>
            <div className="flex items-center gap-2">
              <Pressable onClick={openPdf} style={{ minHeight: 44, padding: "0 8px", color: T.green, fontSize: 17 }}>Pdf</Pressable>
              <Pressable onClick={() => setEditOpen(true)} style={{ minHeight: 44, padding: "0 4px 0 8px", color: T.green, fontSize: 17 }}>Wijzig</Pressable>
            </div>
          </div>

          {/* ROW 2: Station info */}
          {station.behuizingsnummer && <div style={{ fontSize: 14, color: T.subOnBg, fontFamily: "ui-monospace, monospace", marginBottom: 4 }}>{station.behuizingsnummer}</div>}
          <h1 className="font-display leading-tight mb-1" style={{ fontSize: 28, fontWeight: 500, color: T.titleOnBg }}>
            {station.naam_msr}
          </h1>
          <p className="mb-5" style={{ fontSize: 14, color: T.subOnBg }}>
            {[station.datum, station.ingevuld_door].filter(Boolean).join(' · ')}
          </p>

          {/* Progress row */}
          <div>
            <div className="font-display leading-tight" style={{ fontSize: 34, fontWeight: 500, color: T.titleOnBg }}>
              {allDone ? 'Alle taken afgerond' : `${applicableCategories.length - filledCount - skipped.length} taken open`}
            </div>
            <div className="mt-1" style={{ fontSize: 15, color: T.subOnBg }}>{filledCount} ingevuld · {fotos?.length ?? 0} foto&apos;s</div>
          </div>
        </div>

        {/* ── 2. SECTION ACCORDION ── */}
        <div className="mb-8">
          {sectionGroups.map(({ section, categories: cats }) => {
            const doneCats = cats.filter(c => fotosByCategorie(c.name).length > 0);
            const openCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && !isSkipped(c.name));
            const skippedCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name));
            const isComplete = openCats.length === 0 && skippedCats.length === 0;
            const isSectionOpen = openSections.includes(section.id);

            // Sort: open first, then in-progress (has photos), then skipped
            const sortedCats = [...openCats, ...doneCats, ...skippedCats];

            return (
              <Group ref={el => { sectionRefs.current[section.id] = el; }} key={section.id}>
                {/* Section header */}
                <Pressable
                  onClick={() => toggleSection(section.id)}
                  style={{ display: "flex", minHeight: ROW_MIN, alignItems: "center", justifyContent: "space-between", padding: `15px ${ROW_PAD_X}px`, width: "100%", textAlign: "left" }}
                >
                  <div>
                      <h2 className="font-display" style={{ fontSize: 18, fontWeight: 600, color: isComplete ? T.done : T.rowText }}>
                        {section.label}
                      </h2>
                      <p style={{ fontSize: 14, marginTop: 2, color: isComplete ? T.done : T.rowSub }}>
                        {isComplete ? "Voltooid" : `${openCats.length} open`}
                      </p>
                  </div>
                  <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.chevron, transform: isSectionOpen ? "rotate(180deg)" : "rotate(0deg)", transition: `transform 0.3s ${M.spring}` }}>
                    expand_more
                  </span>
                </Pressable>

                {/* Expanded content */}
                {isSectionOpen && (
                  <div>
                    <Hairline inset={INSET_HEAD} />
                    {sortedCats.map((cat, index) => <div key={cat.id}>
                      {index > 0 && <Hairline />}
                      <CategoryRow cat={cat} fotos={fotosByCategorie(cat.name)} isSkipped={isSkipped(cat.name)} skipReason={skippedReasons[cat.name]} hasOpmerking={!!opmerkingen?.some(o => o.categorie === cat.name)} onOpen={() => openWizardAt(cat)} />
                    </div>)}
                  </div>
                )}
              </Group>
            );
          })}
        </div>
      </main>

      {/* ── BOTTOM CTA ── */}
      {nextIncomplete && !wizardOpen && (
        <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
          <Pressable
            onClick={() => openWizardAt(nextIncomplete)}
            style={{ width: "100%", maxWidth: 768, margin: "0 auto", minHeight: ROW_MIN, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "0 16px" }}
          >
            Doorgaan: <span className="truncate">{nextIncomplete.name}</span><span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
          </Pressable>
        </GlassBar>
      )}
      {allDone && !wizardOpen && (
        <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
          <div className="flex gap-2.5 max-w-3xl mx-auto">
            <Pressable
              onClick={openPdf}
              style={{ flex: 1, minHeight: ROW_MIN, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
            >
              Pdf downloaden
            </Pressable>
            <Pressable
              onClick={() => { setShareStation(station?.naam_msr || ''); setShareOpen(true); }}
              style={{ minHeight: ROW_MIN, padding: "0 8px", color: T.green, fontSize: 17, flexShrink: 0 }}
            >
              Delen
            </Pressable>
          </div>
        </GlassBar>
      )}

      {/* Share bottom sheet */}
      {shareOpen && (
        <div className="fixed inset-0 z-[80] flex items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShareOpen(false)} />
          <div className="relative w-full bg-card rounded-t-3xl p-6 pb-[max(24px,env(safe-area-inset-bottom))] animate-slide-up shadow-2xl">
            <div className="w-10 h-1 rounded-full bg-outline-variant/40 mx-auto mb-6" />
            <h3 className="font-display font-extrabold text-lg text-on-surface mb-1">Rapport delen</h3>
            <p className="text-sm text-muted-foreground mb-6">{shareStation} · TO Fotorapport</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => {
                  const msg = encodeURIComponent(`TO Fotorapport: ${shareStation}\n\nHet rapport is gegenereerd via TerreVolt TO Foto's app.\n\nOpgeslagen als PDF via de browser.`);
                  window.open(`https://wa.me/?text=${msg}`, '_blank');
                  setShareOpen(false);
                }}
                className="flex items-center gap-3 p-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/15 transition-all active:scale-[0.97]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-on-surface">WhatsApp</div>
                  <div className="text-xs text-muted-foreground">Stuur bericht</div>
                </div>
              </button>
              <button
                onClick={() => {
                  const subject = encodeURIComponent(`TO Fotorapport: ${shareStation}`);
                  const body = encodeURIComponent(`Beste,\n\nHierbij het TO Fotorapport voor ${shareStation}.\n\nHet rapport is aangemaakt via de TerreVolt TO Foto's app en opgeslagen als PDF.\n\nMet vriendelijke groet,\nTerreVolt B.V.`);
                  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                  setShareOpen(false);
                }}
                className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15 hover:bg-primary/[0.08] transition-all active:scale-[0.97]"
              >
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-rounded text-primary-foreground text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-on-surface">Email</div>
                  <div className="text-xs text-muted-foreground">Stuur email</div>
                </div>
              </button>
            </div>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                onClick={async () => {
                  try {
                    await navigator.share({ title: `TO Fotorapport: ${shareStation}`, text: `Technische Oplevering Fotorapport voor ${shareStation} - TerreVolt B.V.` });
                  } catch { /* cancelled */ }
                  setShareOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2.5 p-4 rounded-2xl bg-surface-container border border-outline-variant/20 hover:bg-surface-high transition-all active:scale-[0.97] mb-3"
              >
                <span className="material-symbols-rounded text-muted-foreground text-xl">ios_share</span>
                <span className="font-bold text-sm text-on-surface">Meer opties...</span>
              </button>
            )}
            <button onClick={() => setShareOpen(false)} className="w-full py-3.5 rounded-2xl bg-surface-low text-sm font-semibold text-muted-foreground active:scale-[0.98] transition-all">
              Sluiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== EDIT STATION DIALOG ==================== */

interface EditStationDialogProps {
  station: { id: string; naam_msr: string; behuizingsnummer: string | null; type_ruimte: string | null; ingevuld_door: string | null; datum: string | null };
  open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void;
}

function EditStationDialog({ station, open, onOpenChange, onSaved }: EditStationDialogProps) {
  const [form, setForm] = useState({ naam_msr: station.naam_msr, behuizingsnummer: station.behuizingsnummer || "", type_ruimte: station.type_ruimte || "", ingevuld_door: station.ingevuld_door || "", datum: station.datum || "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("stations").update({ naam_msr: form.naam_msr, behuizingsnummer: form.behuizingsnummer || null, type_ruimte: form.type_ruimte, ingevuld_door: form.ingevuld_door || null, datum: form.datum || null }).eq("id", station.id);
    setSaving(false);
    if (error) { toast.error("Fout bij opslaan"); } else { toast.success("Station bijgewerkt"); onSaved(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Station bewerken</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Naam MSR</Label><input value={form.naam_msr} onChange={(e) => setForm({ ...form, naam_msr: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Behuizingsnummer</Label><input value={form.behuizingsnummer} onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Type ruimte</Label><Select value={form.type_ruimte} onValueChange={(v) => setForm({ ...form, type_ruimte: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Compact Station">Compact Station</SelectItem><SelectItem value="Betreedbaar station">Betreedbaar station</SelectItem></SelectContent></Select></div>
          <div><Label>Ingevuld door</Label><input value={form.ingevuld_door} onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Datum</Label><input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold py-3 rounded-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50">
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
