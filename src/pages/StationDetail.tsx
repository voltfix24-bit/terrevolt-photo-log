import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, SECTIONS, getCategoriesBySection, getApplicableCategories, slugify, type Category, type Section } from "@/lib/categories";
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
  const [skipped, setSkippedRaw] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const setSkipped = useCallback((fn: (prev: string[]) => string[]) => {
    setSkippedRaw(prev => {
      const next = fn(prev);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, [key]);

  const addSkip = useCallback((catName: string) => {
    setSkipped(prev => prev.includes(catName) ? prev : [...prev, catName]);
  }, [setSkipped]);

  const removeSkip = useCallback((catName: string) => {
    setSkipped(prev => prev.filter(n => n !== catName));
  }, [setSkipped]);

  const toggleSkip = useCallback((catName: string) => {
    setSkipped(prev =>
      prev.includes(catName)
        ? prev.filter(n => n !== catName)
        : [...prev, catName]
    );
  }, [setSkipped]);

  const isSkipped = useCallback((catName: string) => skipped.includes(catName), [skipped]);

  return { skipped, addSkip, removeSkip, toggleSkip, isSkipped };
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
function CategoryRow({ cat, fotos, isSkipped, hasOpmerking, onOpen }: {
  cat: Category; fotos: FotoRow[]; isSkipped?: boolean; hasOpmerking?: boolean; onOpen: () => void;
}) {
  const hasPhotos = fotos.length > 0;

  // OPEN — no photos, not skipped
  if (!hasPhotos && !isSkipped) {
    return (
      <button
        data-cat-id={cat.id}
        onClick={onOpen}
        className="flex items-center justify-between w-full p-4 rounded-xl
                   bg-card shadow-sm border border-outline-variant/15
                   hover:bg-surface-low transition-colors text-left
                   active:scale-[0.98] group"
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full border border-outline-variant flex items-center
                          justify-center text-muted-foreground group-hover:border-primary
                          group-hover:text-primary transition-colors flex-shrink-0">
            <span className="material-symbols-rounded text-base">photo_camera</span>
          </div>
          <div>
            <h4 className="font-display font-semibold text-on-surface text-sm">{cat.name}</h4>
            <span className="text-[10px] uppercase tracking-wider text-orange font-bold">Open</span>
          </div>
        </div>
        <span className="material-symbols-rounded text-muted-foreground/40 group-hover:text-primary transition-colors">
          chevron_right
        </span>
      </button>
    );
  }

  // NVT / SKIPPED
  if (isSkipped && !hasPhotos) {
    return (
      <button
        data-cat-id={cat.id}
        onClick={onOpen}
        className="flex items-center justify-between w-full p-4 rounded-xl
                   bg-surface/30 border border-outline-variant/20 text-left
                   active:scale-[0.98] group"
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full border border-outline-variant flex items-center
                          justify-center text-outline-variant flex-shrink-0">
            <span className="material-symbols-rounded text-base">remove</span>
          </div>
          <div>
            <h4 className="font-display font-semibold text-on-surface-variant line-through text-sm">{cat.name}</h4>
            <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold">NVT</span>
          </div>
        </div>
        <span className="text-xs text-primary font-semibold">Alsnog invullen →</span>
      </button>
    );
  }

  // VOLTOOID — has photos (always green/completed per individual category)
  return (
    <button
      data-cat-id={cat.id}
      onClick={onOpen}
      className="flex items-center justify-between w-full p-4 rounded-xl
                 bg-primary/[0.04] border border-primary/15
                 relative overflow-hidden text-left active:scale-[0.98] group"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      <div className="flex items-center gap-4 ml-2">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center
                        justify-center text-primary flex-shrink-0">
          <span className="material-symbols-rounded text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <div>
          <h4 className="font-display font-bold text-on-surface text-sm flex items-center gap-1.5">
            {cat.name}
            {hasOpmerking && <span className="material-symbols-rounded text-accent-gold text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
              {fotos.length} foto{fotos.length > 1 ? "'s" : ""} ✓
            </span>
            <span className="w-1 h-1 rounded-full bg-outline-variant" />
            <span className="text-[11px] text-on-surface-variant">Tik voor meer</span>
          </div>
        </div>
      </div>
      <span className="material-symbols-rounded text-primary/60 group-hover:translate-x-1 transition-transform">
        chevron_right
      </span>
    </button>
  );
}

/* ==================== WIZARD VIEW ==================== */
interface WizardViewProps {
  startIndex: number;
  stationId: string;
  onClose: () => void;
  onSkip: (catName: string) => void;
  onUnskip: (catName: string) => void;
  skipped: string[];
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
  applicableCategories: Category[];
}

function WizardView({
  startIndex, stationId, onClose, onSkip, onUnskip, skipped, station,
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
  }, [opmerkingData, currentIndex]);

  const saveOpmerking = async () => {
    if (!cat) return;
    if (!opmerkingText.trim()) {
      await supabase.from('categorie_opmerkingen').delete().eq('station_id', stationId).eq('categorie', cat.name);
      queryClient.invalidateQueries({ queryKey: ['opmerking', stationId, cat.name] });
      queryClient.invalidateQueries({ queryKey: ['opmerkingen', stationId] });
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
    if (cat) {
      onSkip(cat.name);
      goNext();
    }
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
    <div className="fixed inset-0 z-[70] bg-background flex flex-col animate-fade-up">
      {/* Header */}
      <div className="shrink-0 bg-surface px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onClose} className="flex items-center gap-1 text-text-muted hover:text-primary-hover text-[13px] font-medium active:scale-95 transition-all">
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
          <div className="flex-1 text-center">
            <span className="text-xs font-bold text-muted-foreground">{currentIndex + 1} / {applicableCategories.length}</span>
          </div>
          {!hasPhotos && !isCatSkipped && (
            <button onClick={handleSkip} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint hover:text-text-muted active:scale-[0.97] transition-all">
              NVT
            </button>
          )}
          {(hasPhotos || isCatSkipped) && <div className="w-12" />}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface-container rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((currentIndex + 1) / applicableCategories.length) * 100}%` }} />
        </div>

        {section && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: section.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: section.color }}>{section.label}</span>
          </div>
        )}
        <h2 className="font-display text-[20px] font-extrabold tracking-tight leading-tight text-text-primary">{cat.name}</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 space-y-3" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {/* Status badges */}
        {hasPhotos && (
          <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-primary/5">
            <span className="material-symbols-rounded text-[18px] text-primary/70">check_circle</span>
            <span className="text-[13px] font-semibold text-primary/80">✓ Al ingevuld — {catFotos.length} foto{catFotos.length > 1 ? "'s" : ""}</span>
          </div>
        )}
        {isCatSkipped && !hasPhotos && (
          <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-surface-high">
            <span className="material-symbols-rounded text-[18px] text-text-faint">remove</span>
            <span className="text-[13px] font-semibold text-text-faint">— Overgeslagen (NVT)</span>
          </div>
        )}

        {/* Instruction */}
        <div className="bg-primary/[0.06] rounded-2xl border border-primary/12">
          <button onClick={() => setTipOpen(!tipOpen)} className="w-full flex items-center gap-3 px-5 py-4 text-left active:scale-[0.99] transition-transform">
            <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-rounded text-primary text-[18px]">info</span>
            </div>
            <span className="text-[13px] font-semibold text-on-surface-variant/70 flex-1">Instructie bekijken</span>
            <span className="material-symbols-rounded text-[18px] text-on-surface-variant/40">{tipOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {tipOpen && (
            <div className="px-5 pb-4 pt-0">
              <p className="text-[13px] leading-[1.7] text-on-surface-variant">{cat.instruction}</p>
              {cat.tip && (
                <p className="mt-3 text-[12px] leading-[1.6] text-on-surface-variant/50 border-t border-primary/5 pt-3">{cat.tip}</p>
              )}
            </div>
          )}
        </div>

        {/* Conditional warnings */}
        {isVermogensveld && (
          <div className="rounded-2xl px-5 py-4 bg-amber-50/60 border border-amber-200/30">
            <div className="flex gap-3 items-start">
              <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
              <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>vermogensveld aanwezig</strong> is.</span>
            </div>
            {!isCatSkipped && !hasPhotos && (
              <button onClick={() => { onSkip(cat.name); goNext(); }} className="mt-3 ml-8 text-[12px] font-semibold text-primary underline underline-offset-2 active:scale-95 transition-transform">
                Niet aanwezig, overslaan →
              </button>
            )}
          </div>
        )}
        {isDaKast && (
          <div className="rounded-2xl px-5 py-4 bg-amber-50/60 border border-amber-200/30">
            <div className="flex gap-3 items-start">
              <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
              <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>DA-kast aanwezig</strong> is.</span>
            </div>
            {!isCatSkipped && !hasPhotos && (
              <button onClick={() => { onSkip(cat.name); goNext(); }} className="mt-3 ml-8 text-[12px] font-semibold text-primary underline underline-offset-2 active:scale-95 transition-transform">
                Niet aanwezig, overslaan →
              </button>
            )}
          </div>
        )}
        {isTypeplaatje && (
          <div className="rounded-2xl px-5 py-4 bg-amber-50/60 border border-amber-200/30">
            <div className="flex gap-3 items-start">
              <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
              <span className="text-[13px] text-on-surface-variant leading-relaxed">Bij een <strong>betreedbaar station</strong> kan deze vraag worden overgeslagen.</span>
            </div>
            {!isCatSkipped && !hasPhotos && (
              <button onClick={() => { onSkip(cat.name); goNext(); }} className="mt-3 ml-8 text-[12px] font-semibold text-primary underline underline-offset-2 active:scale-95 transition-transform">
                Overslaan →
              </button>
            )}
          </div>
        )}

        {catVoorbeelden.length > 0 && (
          <div>
            <button onClick={() => setShowVoorbeeld(!showVoorbeeld)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold transition-all active:scale-95 ${showVoorbeeld ? 'bg-primary/8 text-primary' : 'bg-surface-high text-text-muted hover:text-primary hover:bg-primary/[0.06]'}`}>
              <span className="material-symbols-rounded text-[16px]">{showVoorbeeld ? 'visibility_off' : 'visibility'}</span>
              {showVoorbeeld ? 'Verberg voorbeeld' : 'Voorbeeld bekijken'}
            </button>
            {showVoorbeeld && (
              <div className="flex gap-2.5 overflow-x-auto pb-2 mt-3 -mx-1 px-1 snap-x snap-mandatory">
                {catVoorbeelden.map((v, i) => (
                  <button key={v.id} onClick={() => setVoorbeeldLightbox(i)} className="flex-shrink-0 snap-start w-28 h-28 rounded-2xl overflow-hidden border border-outline-variant/10 active:scale-95 transition-transform">
                    <img src={v.url} alt="Voorbeeld" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <Lightbox open={voorbeeldLightbox !== null} close={() => setVoorbeeldLightbox(null)} slides={catVoorbeelden.map(v => ({ src: v.url }))} index={voorbeeldLightbox ?? 0} />
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => { if (e.target.files) onUpload(cat.name, e.target.files); e.target.value = ""; }} />

        {/* Upload zone — show when no photos */}
        {!hasPhotos && (
          <DropZone onFiles={(files) => onUpload(cat.name, files)} disabled={isUploading === cat.name} onClick={() => fileRef.current?.click()}>
            <div className="flex flex-col items-center justify-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/6 flex items-center justify-center mb-5">
                <span className="material-symbols-rounded text-[32px] text-primary/70">photo_camera</span>
              </div>
              <div className="font-display text-[17px] font-extrabold text-text-primary mb-1.5">Tik om foto's te maken</div>
              <div className="text-[13px] text-text-muted leading-relaxed text-center max-w-[240px]">Hoge resolutie aanbevolen voor verificatie.</div>
            </div>
          </DropZone>
        )}

        {/* Upload progress */}
        {isUploading === cat.name && uploadProgress[cat.name] !== undefined && (
          <div className="h-[3px] overflow-hidden rounded-full bg-on-surface/6">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress[cat.name]}%` }} />
          </div>
        )}

        {/* Photos grid */}
        {hasPhotos && (
          <div className="grid grid-cols-3 gap-2">
            {catFotos.map((foto, i) => (
              <div key={foto.id} className="relative aspect-square rounded-2xl bg-surface-container overflow-hidden">
                <button onClick={() => onClickThumb(cat.name, i)} className="w-full h-full">
                  <img src={foto.url} alt="" className="w-full h-full object-cover" />
                </button>
                {foto.uploaded_at && (
                  <div className="absolute bottom-0 left-0 right-0 bg-on-surface/50 backdrop-blur-sm px-2 py-1 text-[9px] text-white font-mono text-center">
                    {new Date(foto.uploaded_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </div>
                )}
                <button
                  onClick={() => setDeleteTarget({ id: foto.id, path: foto.storage_path })}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-on-surface/60 backdrop-blur-sm rounded-full text-white flex items-center justify-center active:scale-90 transition-transform"
                >
                  <span className="material-symbols-rounded text-[14px]">close</span>
                </button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} disabled={isUploading === cat.name} className="aspect-square rounded-2xl border-2 border-dashed border-outline-variant/20 bg-transparent flex flex-col items-center justify-center gap-1.5 text-text-faint hover:border-primary/30 hover:text-primary hover:bg-primary/[0.04] active:scale-95 transition-all">
              <span className="material-symbols-rounded text-[24px]">add</span>
              <span className="text-[10px] font-semibold">Meer</span>
            </button>
          </div>
        )}
      </div>

      {/* Opmerking field */}
      <div className="bg-card rounded-2xl border border-outline-variant/15 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10">
          <span className="material-symbols-rounded text-muted-foreground text-lg">edit_note</span>
          <span className="text-sm font-bold text-on-surface">Opmerking</span>
          {opmerkingData?.opmerking && (
            <span className="ml-auto text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Opgeslagen</span>
          )}
        </div>
        <div className="p-4">
          <textarea
            value={opmerkingText}
            onChange={e => setOpmerkingText(e.target.value)}
            onBlur={saveOpmerking}
            placeholder="Bijv: Beschadiging aan de rechterzijde, kabelmarkeringen ontbreken..."
            rows={3}
            className="w-full px-3 py-2.5 bg-surface-low border border-outline-variant/20 rounded-xl text-sm text-on-surface placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none transition"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-muted-foreground">Wordt opgeslagen bij verlaten veld · Verschijnt in PDF</span>
            {savingOpmerking && <span className="text-[11px] text-muted-foreground">Opslaan...</span>}
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-[75] bg-surface-white/90 backdrop-blur-2xl border-t border-outline-variant/10 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <button onClick={goPrev} disabled={currentIndex === 0} className="min-h-[48px] px-4 bg-surface-container rounded-2xl font-semibold text-[14px] text-muted-foreground active:scale-[0.97] transition-all disabled:opacity-30 flex items-center gap-1.5">
            <span className="material-symbols-rounded text-[18px]">arrow_back</span>
            Vorige
          </button>
          <button onClick={goNext} className="flex-1 min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[15px] font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-1.5">
            {currentIndex < applicableCategories.length - 1 ? (
              <>Volgende <span className="material-symbols-rounded text-[18px]">arrow_forward</span></>
            ) : (
              <>Afronden <span className="material-symbols-rounded text-[18px]">check</span></>
            )}
          </button>
        </div>
      </div>
      {/* Controlled delete dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-2xl space-y-4 animate-fade-up">
            <h3 className="font-display font-extrabold text-lg text-on-surface">Foto verwijderen?</h3>
            <p className="text-sm text-muted-foreground">Deze actie kan niet ongedaan worden gemaakt.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground bg-surface-container hover:bg-surface-high transition-all"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  const { id, path } = deleteTarget;
                  setDeleteTarget(null);
                  onDelete(id, path);
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-destructive hover:bg-destructive/90 transition-all"
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

/* ==================== MAIN COMPONENT ==================== */
export default function StationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const { skipped, addSkip, removeSkip, isSkipped } = useSkippedCategories(id);
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

  const applicableCategories = useMemo(() => getApplicableCategories(station), [station]);
  const sectionGroups = useMemo(() => getCategoriesBySection(station), [station]);

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
    const html = generatePdfHtml(station, fotos, instellingenData ?? undefined, opmerkingen ?? undefined);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    setShareStation(station.naam_msr);
    setTimeout(() => setShareOpen(true), 500);
  };

  const openWizardAt = useCallback((cat: Category) => {
    const idx = applicableCategories.findIndex(c => c.id === cat.id);
    setWizardStartIndex(idx >= 0 ? idx : 0);
    setWizardOpen(true);
  }, [applicableCategories]);

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

      <main className="pt-20 pb-0 px-4 max-w-3xl mx-auto animate-fade-up">
        {/* ── 1. HERO ── */}
        <div className="px-5 pt-4 pb-5">
          {/* ROW 1: Navigation bar */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary font-semibold transition-colors active:scale-95 min-h-[44px] min-w-[44px]"
            >
              <span className="material-symbols-rounded text-lg">arrow_back_ios</span>
              <span className="hidden sm:inline">Stations</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={openPdf}
                className="w-10 h-10 rounded-xl bg-surface-low border border-outline-variant/20 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all active:scale-95"
              >
                <span className="material-symbols-rounded text-lg">picture_as_pdf</span>
              </button>
              <button
                onClick={() => setEditOpen(true)}
                className="w-10 h-10 rounded-xl bg-surface-low border border-outline-variant/20 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all active:scale-95"
              >
                <span className="material-symbols-rounded text-lg">edit</span>
              </button>
            </div>
          </div>

          {/* ROW 2: Station info */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
              station.type_ruimte === 'Compact Station'
                ? 'bg-orange/10 text-orange'
                : 'bg-primary/10 text-primary'
            }`}>
              {station.type_ruimte || '—'}
            </span>
            {station.behuizingsnummer && (
              <span className="text-xs text-muted-foreground font-mono">
                {station.behuizingsnummer}
              </span>
            )}
          </div>
          <h2 className="font-display text-[24px] font-extrabold tracking-tight text-on-surface leading-tight mb-1">
            {station.naam_msr}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {[station.datum, station.ingevuld_door].filter(Boolean).join(' · ')}
          </p>

          {/* Progress row */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Overall Progress</div>
              <div className="font-display text-[42px] font-black leading-none text-on-surface">
                {pct}<span className="text-[20px] text-muted-foreground">%</span>
              </div>
            </div>
            <div className="text-right pb-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Categorieën</div>
              <div className="font-display text-[20px] font-extrabold text-primary">{filledCount} / {applicableCategories.length}</div>
              <div className="text-xs text-muted-foreground">{fotos?.length ?? 0} foto's</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-surface-container rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* ── 2. SECTION ACCORDION ── */}
        <div className="space-y-3 mb-8">
          {sectionGroups.map(({ section, categories: cats }) => {
            const doneCats = cats.filter(c => fotosByCategorie(c.name).length > 0);
            const openCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && !isSkipped(c.name));
            const skippedCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name));
            const isComplete = openCats.length === 0 && skippedCats.length === 0;
            const isSectionOpen = openSections.includes(section.id);

            // Sort: open first, then in-progress (has photos), then skipped
            const sortedCats = [...openCats, ...doneCats, ...skippedCats];

            return (
              <div ref={el => { sectionRefs.current[section.id] = el; }} key={section.id}
                className={`rounded-xl overflow-hidden mb-3 ${
                  isComplete
                    ? 'bg-primary/[0.04] border border-primary/15'
                    : isSectionOpen
                    ? 'bg-surface-highest/30 shadow-[0px_10px_30px_rgba(19,30,18,0.04)] ring-1 ring-primary/10'
                    : 'bg-surface-low hover:bg-surface-container transition-all duration-300'
                }`}
              >
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className={`flex items-center justify-between p-5 w-full cursor-pointer text-left ${
                    isSectionOpen ? 'bg-surface-low' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                      isComplete
                        ? 'bg-primary text-primary-foreground shadow-primary/30'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      <span className={`material-symbols-rounded text-xl ${isComplete ? '' : ''}`} style={isComplete ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                        {isComplete ? 'check' : getSectionIcon(section.id)}
                      </span>
                    </div>
                    <div>
                      <h3 className={`font-display font-bold text-[17px] ${
                        isComplete ? 'text-primary font-extrabold' : 'text-on-surface'
                      }`}>
                        {section.label}
                      </h3>
                      <p className="text-xs mt-0.5 text-on-surface-variant">
                        {cats.length} taken
                        {openCats.length > 0 && <> · <span className="text-orange font-semibold">{openCats.length} open</span></>}
                        {isComplete && <> · <span className="text-primary font-semibold">Voltooid</span></>}
                      </p>
                    </div>
                  </div>
                  <span className={`material-symbols-rounded text-xl transition-transform ${
                    isSectionOpen ? 'text-primary rotate-180' : 'text-muted-foreground/40'
                  }`}>
                    expand_more
                  </span>
                </button>

                {/* Expanded content */}
                {isSectionOpen && (
                  <div className="p-4 space-y-3">
                    {sortedCats.map(cat => (
                      <CategoryRow
                        key={cat.id}
                        cat={cat}
                        fotos={fotosByCategorie(cat.name)}
                        isSkipped={isSkipped(cat.name)}
                        hasOpmerking={!!opmerkingen?.some(o => o.categorie === cat.name)}
                        onOpen={() => openWizardAt(cat)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* ── BOTTOM CTA ── */}
      {nextIncomplete && !wizardOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-[50] p-4 bg-surface-white/95 backdrop-blur-xl border-t border-outline-variant/10 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            onClick={() => openWizardAt(nextIncomplete)}
            className="w-full max-w-3xl mx-auto min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
          >
            <span className="material-symbols-rounded text-[20px]">arrow_forward</span>
            Doorgaan: <span className="truncate max-w-[220px]">{nextIncomplete.name}</span>
          </button>
        </div>
      )}
      {allDone && !wizardOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-[50] p-4 bg-surface-white/95 backdrop-blur-xl border-t border-outline-variant/10 pb-[max(16px,env(safe-area-inset-bottom))]">
          <div className="flex gap-2.5 max-w-3xl mx-auto">
            <button
              onClick={openPdf}
              className="flex-1 min-h-[52px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-[0_6px_20px_-4px_rgba(0,100,47,0.35)] active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
            >
              <span className="material-symbols-rounded text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>
              ✓ Alles klaar — PDF downloaden
            </button>
            <button
              onClick={() => { setShareStation(station?.naam_msr || ''); setShareOpen(true); }}
              className="w-[52px] h-[52px] bg-surface-low rounded-2xl flex items-center justify-center border border-outline-variant/20 active:scale-95 transition-all flex-shrink-0"
            >
              <span className="material-symbols-rounded text-muted-foreground text-xl">ios_share</span>
            </button>
          </div>
        </div>
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
