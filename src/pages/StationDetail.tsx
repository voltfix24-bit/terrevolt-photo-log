import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, FOTO_CATEGORIEEN, slugify } from "@/lib/categories";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRef, useState, useCallback } from "react";
import imageCompression from "browser-image-compression";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { useVoorbeelden } from "@/components/CategorieSettings";

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/webp"];

const CATEGORY_ICONS: Record<number, string> = {
  1: "label", 2: "home", 3: "door_front", 4: "lock", 5: "width_full",
  6: "stairs", 7: "cable", 8: "electrical_services", 9: "view_column", 10: "power",
  11: "description", 12: "format_list_numbered", 13: "bolt", 14: "transform", 15: "grid_3x3",
  16: "commit", 17: "hub", 18: "label_important", 19: "precision_manufacturing", 20: "vertical_align_top",
  21: "tune", 22: "link", 23: "signpost", 24: "view_agenda", 25: "label",
  26: "electric_meter", 27: "bolt", 28: "numbers", 29: "cable", 30: "electrical_services",
  31: "transform", 32: "view_in_ar", 33: "security", 34: "router", 35: "wifi",
  36: "light", 37: "bolt", 38: "circle", 39: "fence", 40: "door_sliding",
};

type FotoRow = { id: string; url: string; storage_path: string; categorie: string };

/* ==================== DROP ZONE COMPONENT ==================== */
function DropZone({ onFiles, disabled, onClick, compact, children }: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
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
    const files = e.dataTransfer.files;
    if (files?.length) onFiles(files);
  }, [disabled, onFiles]);

  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        onDragOver={handleDrag}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full py-2 bg-card border rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-1 ${
          dragging
            ? "border-primary bg-primary/5 text-primary scale-[1.02]"
            : "border-outline-variant/20 text-text-secondary hover:text-primary hover:border-primary/30 hover:bg-primary/[0.04]"
        }`}
      >
        {children}
      </button>
    );
  }

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
  const { data: voorbeelden } = useVoorbeelden();
  // Persist invullen progress in localStorage
  const storageKey = `to-fotos-progress-${id}`;
  const savedProgress = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as { step: number; mode: "overzicht" | "invullen" };
    } catch { /* ignore */ }
    return null;
  })();

  const [viewMode, setViewModeRaw] = useState<"overzicht" | "invullen">(savedProgress?.mode || "invullen");
  const [currentStep, setCurrentStepRaw] = useState(savedProgress?.step || 0);
  const [tipOpen, setTipOpen] = useState<Record<number, boolean>>({});
  const [completed, setCompleted] = useState(false);

  const persistProgress = useCallback((step: number, mode: "overzicht" | "invullen") => {
    try { localStorage.setItem(storageKey, JSON.stringify({ step, mode })); } catch { /* ignore */ }
  }, [storageKey]);

  const setViewMode = useCallback((mode: "overzicht" | "invullen") => {
    setViewModeRaw(mode);
    persistProgress(currentStep, mode);
  }, [currentStep, persistProgress]);

  const setCurrentStep = useCallback((step: number | ((prev: number) => number)) => {
    setCurrentStepRaw(prev => {
      const next = typeof step === "function" ? step(prev) : step;
      persistProgress(next, viewMode);
      return next;
    });
  }, [viewMode, persistProgress]);

  const { data: station, isLoading } = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

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

  const filledCount = new Set(fotos?.map((f) => f.categorie)).size;
  const pct = Math.round((filledCount / FOTO_CATEGORIEEN.length) * 100);

  const compressImage = async (file: File): Promise<File> => {
    if (file.type === "image/heic") return file;
    try {
      return await imageCompression(file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true, fileType: "image/jpeg", initialQuality: 0.85 });
    } catch { return file; }
  };

  const handleUpload = async (categorie: string, files: FileList) => {
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
      await supabase.from("fotos").insert({ station_id: id!, categorie, storage_path: storagePath, url: urlData.publicUrl, volgorde: fotosByCategorie(categorie).length + done });

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
    const html = generatePdfHtml(station, fotos);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const goNext = () => {
    if (currentStep < CATEGORIES.length - 1) { setCurrentStep(currentStep + 1); }
    else { setCompleted(true); }
  };
  const goPrev = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-24 px-6 max-w-7xl mx-auto">
        <Skeleton className="h-40 w-full rounded-3xl mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-[1.5rem]" />
          ))}
        </div>
      </div>
    );
  }

  if (!station) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">Station niet gevonden</div>;
  }

  const isCS = station.type_ruimte === "Compact Station";

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8" style={viewMode === "invullen" && !completed ? { height: "100dvh", overflow: "hidden" } : undefined}>
      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={lightboxSlides} index={lightboxIndex} />
      <EditStationDialog station={station} open={editOpen} onOpenChange={setEditOpen} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["station", id] }); queryClient.invalidateQueries({ queryKey: ["stations"] }); }} />
      

      <main className="pt-20 pb-0 px-4 max-w-7xl mx-auto animate-fade-up">
        {viewMode === "invullen" && !completed ? (
          <StepByStepView
            station={station}
            category={CATEGORIES[currentStep]}
            step={currentStep}
            total={CATEGORIES.length}
            fotos={fotosByCategorie(CATEGORIES[currentStep].name)}
            tipOpen={!!tipOpen[CATEGORIES[currentStep].id]}
            onToggleTip={() => setTipOpen(prev => ({ ...prev, [CATEGORIES[currentStep].id]: !prev[CATEGORIES[currentStep].id] }))}
            isUploading={uploadingCat === CATEGORIES[currentStep].name}
            uploadProgress={uploadProgress[CATEGORIES[currentStep].name]}
            onUpload={(files) => handleUpload(CATEGORIES[currentStep].name, files)}
            onDelete={handleDelete}
            onNext={goNext}
            onPrev={goPrev}
            onSkip={goNext}
            onClickThumb={(idx) => openLightbox(CATEGORIES[currentStep].name, idx)}
            onBackToList={() => navigate("/")}
            filledCount={filledCount}
            totalCategories={FOTO_CATEGORIEEN.length}
            voorbeelden={voorbeelden?.filter(v => v.categorie === CATEGORIES[currentStep].name) ?? []}
          />
        ) : completed ? (
          <CompletionScreen
            filledCount={filledCount}
            total={CATEGORIES.length}
            stationName={station.naam_msr}
            fotos={(fotos ?? []).map(f => ({ id: f.id, categorie: f.categorie, url: f.url }))}
            onReset={() => { setCurrentStep(0); setCompleted(false); }}
            onBack={() => navigate("/")}
            onPdf={openPdf}
          />
        ) : (
          <>
            {/* Back row */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary-hover transition-colors font-semibold">
                <span className="material-symbols-rounded text-lg">arrow_back_ios</span> Alle stations
              </button>
              <button onClick={() => setEditOpen(true)} className="p-2.5 bg-surface-white border border-outline-variant/30 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 text-text-secondary">
                <span className="material-symbols-rounded text-lg">edit</span>
              </button>
            </div>

            {/* Hero card */}
            <div className="bg-surface-white rounded-3xl p-6 shadow-sm border border-outline-variant/10 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-accent-gold/[0.08] text-accent-gold"
                >{station.type_ruimte}</span>
              </div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight mb-1 text-text-primary">{station.naam_msr}</h2>
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-text-secondary">Categorieën ingevuld</span>
                  <span className="text-xs font-black text-accent-gold">{filledCount} / {FOTO_CATEGORIEEN.length}</span>
                </div>
                <div className="h-2 bg-surface-high rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-800" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {CATEGORIES.map((cat) => {
                const catFotos = fotosByCategorie(cat.name);
                return (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    fotos={catFotos}
                    icon={CATEGORY_ICONS[cat.id] || "photo_camera"}
                    isUploading={uploadingCat === cat.name}
                    uploadProgress={uploadProgress[cat.name]}
                    onUpload={(files) => handleUpload(cat.name, files)}
                    onDelete={handleDelete}
                    onClickThumb={(idx) => openLightbox(cat.name, idx)}
                  />
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ==================== STEP-BY-STEP VIEW ==================== */

interface StepByStepViewProps {
  station: { vermogensveld: boolean | null; da_kast: boolean | null; naam_msr: string };
  category: { id: number; name: string; instruction: string; tip?: string };
  step: number; total: number;
  fotos: FotoRow[]; tipOpen: boolean; onToggleTip: () => void;
  isUploading: boolean; uploadProgress?: number;
  onUpload: (files: FileList) => void; onDelete: (id: string, path: string) => void;
  onNext: () => void; onPrev: () => void; onSkip: () => void;
  onClickThumb: (idx: number) => void;
  onBackToList: () => void;
  filledCount: number;
  totalCategories: number;
  voorbeelden: { id: string; url: string }[];
}

function StepByStepView({ station, category, step, total, fotos, tipOpen, onToggleTip, isUploading, uploadProgress, onUpload, onDelete, onNext, onPrev, onSkip, onClickThumb, onBackToList, filledCount, totalCategories, voorbeelden }: StepByStepViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showVoorbeeld, setShowVoorbeeld] = useState(false);
  const [voorbeeldLightbox, setVoorbeeldLightbox] = useState<number | null>(null);
  const isVermogensveld = category.id === 14;
  const isDaKast = category.id === 15;
  const notApplicable = (isVermogensveld && !station.vermogensveld) || (isDaKast && !station.da_kast);
  const hasPhotos = fotos.length > 0;
  const progressPct = Math.round(((step + 1) / total) * 100);

  const maxDots = 10;
  const dots = Array.from({ length: Math.min(maxDots, total) }, (_, i) => i);

  // Swipe gesture
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext();
      else if (step > 0) onPrev();
    }
  }, [onNext, onPrev, step]);

  return (
      <div className="flex flex-col h-[calc(100dvh-56px)] overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* ── Premium sticky header ── */}
      <div className="relative z-10 shrink-0 bg-surface -mx-4 px-6 pt-4 pb-3 border-b border-outline-variant/10">
        {/* Back affordance */}
        <button onClick={onBackToList} className="flex items-center gap-1 text-text-muted text-[13px] font-medium mb-3 active:scale-95 transition-transform">
          <span className="material-symbols-rounded text-[18px]">arrow_back_ios</span>
          <span>Terug</span>
        </button>

        {/* Section label */}
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-gold mb-1">
          Technische oplevering
        </div>

        {/* Title + counter row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="font-display text-[22px] font-extrabold tracking-tight leading-[1.15] text-text-primary min-w-0 flex-1 break-words">
            {category.name}
          </h2>
          <div className="flex items-baseline gap-0.5 pt-1 flex-shrink-0">
            <span className="font-display text-[28px] font-extrabold text-text-primary leading-none">{step + 1}</span>
            <span className="font-display text-[14px] font-medium text-text-faint">/{total}</span>
          </div>
        </div>

        {/* Elegant thin progress bar */}
        <div className="h-[3px] bg-on-surface/6 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Content area — no scroll, fills viewport ── */}
      <div className="flex-1 flex flex-col px-2 pt-4 pb-20 gap-3 overflow-y-auto min-h-0 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>

        {/* Instruction — collapsed by default, expandable */}
        <div className="bg-primary/[0.06] rounded-2xl border border-primary/12">
          <button
            onClick={onToggleTip}
            className="w-full flex items-center gap-3 px-5 py-4 text-left active:scale-[0.99] transition-transform"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-rounded text-primary text-[18px]">info</span>
            </div>
            <span className="text-[13px] font-semibold text-on-surface-variant/70 flex-1">Instructie bekijken</span>
            <span className="material-symbols-rounded text-[18px] text-on-surface-variant/40">{tipOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          {tipOpen && (
            <div className="px-5 pb-4 pt-0">
              <p className="text-[13px] leading-[1.7] text-on-surface-variant">{category.instruction}</p>
              {category.tip && (
                <p className="mt-3 text-[12px] leading-[1.6] text-on-surface-variant/50 border-t border-primary/5 pt-3">
                  {category.tip}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Conditional warnings */}
        {isVermogensveld && (
          <div className="rounded-2xl px-5 py-4 flex gap-3 items-start bg-amber-50/60 border border-amber-200/30">
            <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
            <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>vermogensveld aanwezig</strong> is bij dit station.</span>
          </div>
        )}
        {isDaKast && (
          <div className="rounded-2xl px-5 py-4 flex gap-3 items-start bg-amber-50/60 border border-amber-200/30">
            <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
            <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>DA-kast aanwezig</strong> is bij dit station.</span>
          </div>
        )}

        {/* Example photos — compact pill */}
        {voorbeelden.length > 0 && (
          <div>
            <button
              onClick={() => setShowVoorbeeld(!showVoorbeeld)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold transition-all active:scale-95 ${
                showVoorbeeld
                  ? 'bg-primary/8 text-primary'
                  : 'bg-on-surface/4 text-on-surface-variant/60 hover:text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-rounded text-[16px]">{showVoorbeeld ? 'visibility_off' : 'visibility'}</span>
              {showVoorbeeld ? 'Verberg voorbeeld' : 'Voorbeeld bekijken'}
            </button>
            {showVoorbeeld && (
              <div className="flex gap-2.5 overflow-x-auto pb-2 mt-3 -mx-1 px-1 snap-x snap-mandatory">
                {voorbeelden.map((v, i) => (
                  <button key={v.id} onClick={() => setVoorbeeldLightbox(i)} className="flex-shrink-0 snap-start w-28 h-28 rounded-2xl overflow-hidden border border-outline-variant/10 active:scale-95 transition-transform">
                    <img src={v.url} alt="Voorbeeld" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <Lightbox open={voorbeeldLightbox !== null} close={() => setVoorbeeldLightbox(null)} slides={voorbeelden.map(v => ({ src: v.url }))} index={voorbeeldLightbox ?? 0} />
          </div>
        )}

        {/* ── Hidden file input ── */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />

        {/* ── Upload zone — premium empty state ── */}
        {!hasPhotos && (
          <DropZone onFiles={onUpload} disabled={isUploading} onClick={() => fileRef.current?.click()}>
            <div className="flex flex-col items-center justify-center py-6">
              <div className="w-16 h-16 rounded-full bg-primary/6 flex items-center justify-center mb-5">
                <span className="material-symbols-rounded text-[32px] text-primary/70">photo_camera</span>
              </div>
               <div className="font-display text-[17px] font-extrabold text-text-primary mb-1.5">Tik om foto's te maken</div>
              <div className="text-[13px] text-text-muted leading-relaxed text-center max-w-[240px]">
                Hoge resolutie aanbevolen voor verificatie.
              </div>
            </div>
          </DropZone>
        )}

        {/* Upload progress */}
        {isUploading && uploadProgress !== undefined && (
          <div className="h-[3px] overflow-hidden rounded-full bg-on-surface/6">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        {/* Status badge + photo grid */}
        {hasPhotos && (
          <>
            <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-primary/5">
              <span className="material-symbols-rounded text-[18px] text-primary/70">check_circle</span>
              <span className="text-[13px] font-semibold text-primary/80">{fotos.length} foto{fotos.length > 1 ? "'s" : ""} geüpload</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {fotos.map((foto, i) => (
                <div key={foto.id} className="relative aspect-square rounded-2xl bg-surface-container overflow-hidden">
                  <button onClick={() => onClickThumb(i)} className="w-full h-full">
                    <img src={foto.url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="absolute top-1.5 right-1.5 w-6 h-6 bg-on-surface/60 backdrop-blur-sm rounded-full text-white flex items-center justify-center active:scale-90 transition-transform">
                        <span className="material-symbols-rounded text-[14px]">close</span>
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Foto verwijderen?</AlertDialogTitle><AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(foto.id, foto.storage_path)}>Verwijderen</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="aspect-square rounded-2xl border-2 border-dashed border-on-surface/10 bg-transparent flex flex-col items-center justify-center gap-1.5 text-on-surface-variant/40 hover:border-primary/30 hover:text-primary/60 active:scale-95 transition-all"
              >
                <span className="material-symbols-rounded text-[24px]">add</span>
                <span className="text-[10px] font-semibold">Meer</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Premium bottom action bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] bg-surface-white/90 backdrop-blur-2xl border-t border-outline-variant/10 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {/* Vorige */}
          <button
            onClick={onPrev}
            disabled={step === 0}
            className="min-h-[48px] px-4 flex items-center gap-1.5 font-display text-[14px] font-semibold text-text-muted active:scale-[0.97] transition-all disabled:opacity-20"
          >
            <span className="material-symbols-rounded text-[18px]">chevron_left</span>
            Vorige
          </button>

          {/* NVT */}
          <button
            onClick={() => { onSkip(); toast("Overgeslagen"); }}
            className="min-h-[48px] px-3 font-display text-[12px] font-semibold text-text-faint uppercase tracking-wider active:scale-[0.97] transition-all"
          >
            NVT
          </button>

          {/* Volgende — primary CTA */}
          <button
            onClick={onNext}
            className="flex-1 min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[15px] font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
          >
            {step === total - 1 ? "Afronden" : "Volgende"}
            <span className="material-symbols-rounded text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== COMPLETION SCREEN — Saudia "Klaar!" style ==================== */

function CompletionScreen({ filledCount, total, stationName, fotos, onReset, onBack, onPdf }: { filledCount: number; total: number; stationName: string; fotos: { id: string; categorie: string; url: string }[]; onReset: () => void; onBack: () => void; onPdf: () => void }) {
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const pct = Math.round((filledCount / total) * 100);

  const handleZip = async () => {
    const { downloadStationZip } = await import("@/lib/zip-download");
    setZipProgress(0);
    try {
      await downloadStationZip(stationName, fotos, (pct) => setZipProgress(pct));
      toast.success("ZIP gedownload ✓");
    } catch {
      toast.error("ZIP downloaden mislukt");
    }
    setZipProgress(null);
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col px-2 pt-8 pb-10 animate-fade-up min-h-[calc(100dvh-120px)]">

      {/* Success icon */}
      <div className="flex justify-center mb-8">
        <div className="w-20 h-20 rounded-full bg-primary/8 flex items-center justify-center">
          <span className="material-symbols-rounded text-primary text-[40px]">check_circle</span>
        </div>
      </div>

      {/* Heading area */}
      <div className="text-center mb-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-gold mb-3">
          Oplevering voltooid
        </div>
        <h2 className="font-display text-[36px] font-extrabold tracking-tight text-text-primary leading-none mb-3">
          Klaar!
        </h2>
        <p className="text-[14px] text-text-muted leading-relaxed max-w-[260px] mx-auto">
          Alle gegevens en foto's voor <strong className="text-text-primary font-semibold">{stationName}</strong> zijn verwerkt.
        </p>
      </div>

      {/* Progress card */}
      <div className="bg-surface-low rounded-3xl px-6 py-5 border border-outline-variant/10 mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent-gold">Voortgang</span>
          <div className="flex items-baseline gap-0.5">
            <span className="font-display text-[28px] font-extrabold text-text-primary leading-none">{pct}</span>
            <span className="font-display text-[14px] font-medium text-text-faint">%</span>
          </div>
        </div>
        <div className="h-[3px] bg-surface-high rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[13px] text-text-muted leading-relaxed">
          {filledCount} van de {total} categorieën gevalideerd.
        </p>
      </div>

      {/* Downloads card */}
      <div className="bg-surface-low rounded-3xl px-6 py-5 border border-outline-variant/10 mb-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-accent-gold mb-4">
          Bestanden downloaden
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onPdf}
            className="w-full min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[14px] font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-2.5"
          >
            <span className="material-symbols-rounded text-[18px]">description</span>
            PDF rapport
          </button>
          <button
            onClick={handleZip}
            disabled={zipProgress !== null || fotos.length === 0}
            className="w-full min-h-[48px] bg-surface-high rounded-2xl font-display text-[14px] font-semibold text-text-primary active:scale-[0.97] transition-all flex items-center justify-center gap-2.5 disabled:opacity-40"
          >
            <span className="material-symbols-rounded text-[18px] text-text-muted">folder_zip</span>
            {zipProgress !== null ? `Downloaden… ${zipProgress}%` : "Foto's als ZIP"}
          </button>
        </div>
      </div>

      {/* Back link */}
      <button
        onClick={onBack}
        className="flex items-center justify-center gap-1.5 py-3 font-display text-[13px] font-semibold text-text-muted hover:text-primary active:scale-[0.97] transition-all mx-auto"
      >
        <span className="material-symbols-rounded text-[16px]">chevron_left</span>
        Terug naar overzicht
      </button>

      {/* Brand footer */}
      <div className="mt-auto pt-12 text-center">
        <span className="font-display text-[13px] font-extrabold text-primary/20 tracking-tight">TerreVolt</span>
        <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-text-faint/40 mt-0.5">Technische Oplevering</div>
      </div>
    </div>
  );
}

/* ==================== CATEGORY CARD (OVERZICHT MODE) ==================== */

interface CategoryCardProps {
  category: { id: number; name: string };
  fotos: FotoRow[];
  icon: string;
  isUploading: boolean;
  uploadProgress?: number;
  onUpload: (files: FileList) => void;
  onDelete: (id: string, storagePath: string) => void;
  onClickThumb: (index: number) => void;
}

function CategoryCard({ category, fotos, icon, isUploading, uploadProgress, onUpload, onDelete, onClickThumb }: CategoryCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const filled = fotos.length > 0;

  return (
    <div className="group bg-surface-low hover:bg-surface-white transition-all duration-200 rounded-[1.5rem] p-3 border border-transparent hover:border-outline-variant/20 hover:shadow-md space-y-2 relative overflow-hidden cursor-pointer active:scale-[0.98]">
      <div className={`relative aspect-square rounded-xl flex items-center justify-center overflow-hidden ${
        filled ? "bg-primary-container/40" : "bg-surface-high border-2 border-dashed border-outline-variant/40"
      }`}>
        {filled ? (
          <>
            <span className="material-symbols-rounded text-primary text-3xl">{icon}</span>
            <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center shadow-sm">
              <span className="material-symbols-rounded text-primary-foreground text-xs">check</span>
            </div>
          </>
        ) : (
          <span className="material-symbols-rounded text-on-surface-variant/30 text-3xl">photo_camera</span>
        )}

        {/* Thumbnail overlay on hover for filled cards */}
        {filled && fotos.length > 0 && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            {fotos.slice(0, 2).map((foto, i) => (
              <button key={foto.id} onClick={(e) => { e.stopPropagation(); onClickThumb(i); }} className="w-10 h-10 rounded-lg overflow-hidden">
                <img src={foto.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {fotos.length > 2 && <span className="text-primary-foreground text-xs font-bold">+{fotos.length - 2}</span>}
          </div>
        )}
      </div>

      <div className="px-0.5">
        <div className="text-[9px] font-black text-text-faint uppercase tracking-wider">#{String(category.id).padStart(2, "0")}</div>
        <div className="text-xs font-bold leading-tight text-text-primary">{category.name}</div>
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${filled ? "bg-accent-gold-bright" : "bg-text-faint"}`} />
          <span className={`text-[9px] font-black uppercase tracking-wide ${filled ? "text-accent-gold" : "text-text-faint"}`}>
            {filled ? `${fotos.length} FOTO${fotos.length > 1 ? "'S" : ""}` : "ONTBREEKT"}
          </span>
        </div>
      </div>

      {isUploading && uploadProgress !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-high">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />

      <DropZone onFiles={onUpload} disabled={isUploading} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} compact>
        <span className="material-symbols-rounded text-sm">photo_camera</span>
        {isUploading ? "Uploaden..." : "Toevoegen"}
      </DropZone>
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
