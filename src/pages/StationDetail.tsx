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
  const [viewMode, setViewMode] = useState<"overzicht" | "invullen">("overzicht");
  const [currentStep, setCurrentStep] = useState(0);
  const [tipOpen, setTipOpen] = useState<Record<number, boolean>>({});
  const [completed, setCompleted] = useState(false);

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
    return <div className="flex min-h-screen items-center justify-center bg-background text-on-surface">Station niet gevonden</div>;
  }

  const isCS = station.type_ruimte === "Compact Station";

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={lightboxSlides} index={lightboxIndex} />
      <EditStationDialog station={station} open={editOpen} onOpenChange={setEditOpen} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["station", id] }); queryClient.invalidateQueries({ queryKey: ["stations"] }); }} />

      <main className="pt-24 pb-8 px-6 max-w-7xl mx-auto animate-fade-up">
        {/* Back row */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold">
            <span className="material-symbols-outlined text-lg">arrow_back_ios</span> Alle stations
          </button>
          <div className="flex gap-2">
            <button onClick={() => setEditOpen(true)} className="p-2.5 bg-card border border-outline-variant/30 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 text-on-surface-variant">
              <span className="material-symbols-outlined text-lg">edit</span>
            </button>
            <button onClick={openPdf} className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-light text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-primary/30 active:scale-95 transition-transform">
              <span className="material-symbols-outlined fill text-base">picture_as_pdf</span> PDF downloaden
            </button>
          </div>
        </div>

        {/* Hero card */}
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-outline-variant/10 mb-6 flex items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={isCS
                  ? { background: "rgba(232,84,26,0.1)", color: "#E8541A" }
                  : { background: "rgba(107,45,139,0.1)", color: "#6B2D8B" }
                }
              >
                {station.type_ruimte}
              </span>
              {station.behuizingsnummer && (
                <span className="text-xs text-on-surface-variant font-mono">{station.behuizingsnummer}</span>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight mb-1 text-on-surface">{station.naam_msr}</h2>
            <p className="text-sm text-muted-foreground font-medium">
              {station.datum} {station.ingevuld_door && `· ${station.ingevuld_door}`}
            </p>
            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold text-on-surface-variant">Categorieën ingevuld</span>
                <span className="text-xs font-black text-primary">{filledCount} / {FOTO_CATEGORIEEN.length}</span>
              </div>
              <div className="h-2 bg-surface-high rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-800" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          {/* Progress ring */}
          <div className="relative w-24 h-24 flex-shrink-0 hidden sm:block">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path className="stroke-slate-200" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="2.5" />
              <path className="stroke-primary-light" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeDasharray={`${pct},100`} strokeLinecap="round" strokeWidth="2.5" style={{ transition: "stroke-dasharray 1s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-black text-on-surface">{pct}%</span>
              <span className="text-[10px] text-muted-foreground font-semibold">{pct === 100 ? "volledig" : "voortgang"}</span>
            </div>
          </div>
        </div>

        {/* Continue CTA */}
        {filledCount < FOTO_CATEGORIEEN.length && (
          <div className="glass rounded-2xl p-4 shadow-sm border border-white/50 flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700">
                <span className="material-symbols-outlined fill">photo_camera</span>
              </div>
              <div>
                <div className="font-bold text-sm text-on-surface">Foto's invullen</div>
                <div className="text-xs text-on-surface-variant">{FOTO_CATEGORIEEN.length - filledCount} categorieën resterend</div>
              </div>
            </div>
            <button
              onClick={() => { setViewMode("invullen"); setCompleted(false); }}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined fill text-lg">arrow_forward_ios</span>
            </button>
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex gap-1 bg-surface-container rounded-2xl p-1 border border-outline-variant/20 mb-5 shadow-sm">
          <button
            onClick={() => { setViewMode("overzicht"); setCompleted(false); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
              viewMode === "overzicht" ? "bg-card shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-base">grid_view</span>Overzicht
          </button>
          <button
            onClick={() => { setViewMode("invullen"); setCompleted(false); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
              viewMode === "invullen" ? "bg-card shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-base">photo_camera</span>Invullen
          </button>
        </div>

        {viewMode === "overzicht" ? (
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
        ) : viewMode === "invullen" && !completed ? (
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
          />
        ) : (
          <CompletionScreen
            filledCount={filledCount}
            total={CATEGORIES.length}
            stationName={station.naam_msr}
            onReset={() => { setCurrentStep(0); setCompleted(false); }}
            onBack={() => { setViewMode("overzicht"); setCompleted(false); }}
            onPdf={openPdf}
          />
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
}

function StepByStepView({ station, category, step, total, fotos, tipOpen, onToggleTip, isUploading, uploadProgress, onUpload, onDelete, onNext, onPrev, onSkip, onClickThumb }: StepByStepViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isVermogensveld = category.id === 14;
  const isDaKast = category.id === 15;
  const notApplicable = (isVermogensveld && !station.vermogensveld) || (isDaKast && !station.da_kast);
  const hasPhotos = fotos.length > 0;
  const progressPct = Math.round((step / total) * 100);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Progress */}
      <div className="bg-card rounded-2xl p-4 shadow-sm border border-outline-variant/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-on-surface-variant">Stap {step + 1} van {total}</span>
          <span className="text-xs font-black text-primary">{progressPct}% voltooid</span>
        </div>
        <div className="h-2 bg-surface-high rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Main step card */}
      <div className="bg-card rounded-3xl p-5 shadow-sm border border-outline-variant/10">
        <div className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Categorie {String(category.id).padStart(2, "0")} van {total}</div>
        <h3 className="text-xl font-black tracking-tight mb-4 text-on-surface">{category.name}</h3>

        {/* Instruction box */}
        <div className="rounded-2xl p-4 mb-3 flex gap-3 items-start" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)" }}>
          <span className="material-symbols-outlined fill text-blue-400 flex-shrink-0 mt-0.5 text-xl">info</span>
          <p className="text-sm leading-relaxed text-blue-500">{category.instruction}</p>
        </div>

        {/* Conditional warnings */}
        {isVermogensveld && (
          <div className="rounded-2xl p-3 mb-3 flex gap-2 text-xs" style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)", color: "#fbbf24" }}>
            <span className="material-symbols-outlined fill text-yellow-400 text-base flex-shrink-0">warning</span>
            <span>Alleen fotograferen als <strong>vermogensveld aanwezig</strong> is bij dit station.</span>
          </div>
        )}
        {isDaKast && (
          <div className="rounded-2xl p-3 mb-3 flex gap-2 text-xs" style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)", color: "#fbbf24" }}>
            <span className="material-symbols-outlined fill text-yellow-400 text-base flex-shrink-0">warning</span>
            <span>Alleen fotograferen als <strong>DA-kast aanwezig</strong> is bij dit station.</span>
          </div>
        )}

        {/* Tip toggle */}
        {category.tip && (
          <>
            <button onClick={onToggleTip} className={`flex items-center gap-1.5 text-xs font-semibold mb-3 transition-colors ${tipOpen ? "text-yellow-500" : "text-on-surface-variant hover:text-yellow-500"}`}>
              <span className={`material-symbols-outlined ${tipOpen ? "fill" : ""} text-base`}>lightbulb</span>
              {tipOpen ? "Verberg tip" : "Toon tip"}
            </button>
            {tipOpen && (
              <div className="rounded-2xl p-3 mb-3 text-xs leading-relaxed" style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.18)", color: "#fbbf24" }}>
                {category.tip}
              </div>
            )}
          </>
        )}

        {/* Upload zone */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />

        <DropZone onFiles={onUpload} disabled={isUploading} onClick={() => fileRef.current?.click()}>
          <div className={`w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center ${
            hasPhotos ? "bg-gradient-to-br from-primary to-primary-light shadow-lg shadow-primary/20" : "bg-surface-high"
          }`}>
            <span className={`material-symbols-outlined fill text-2xl ${hasPhotos ? "text-primary-foreground" : "text-on-surface-variant"}`}>
              {hasPhotos ? "check_circle" : "photo_camera"}
            </span>
          </div>
          <div className="text-sm font-bold mb-1 text-on-surface">{hasPhotos ? "Foto's geüpload — tik voor meer" : "Tik of sleep foto's hierheen"}</div>
          <div className="text-xs text-on-surface-variant">JPG · PNG · HEIC · max <span className="font-bold text-primary">10MB</span></div>
        </DropZone>

        {isUploading && uploadProgress !== undefined && (
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-high">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        {/* Uploaded photos */}
        {hasPhotos && (
          <>
            <div className="flex items-center gap-1.5 text-xs font-bold mb-3 text-primary">
              <span className="material-symbols-outlined fill text-base">check_circle</span>
              {fotos.length} foto{fotos.length > 1 ? "'s" : ""} geüpload
            </div>
            <div className="flex gap-2 flex-wrap mb-4">
              {fotos.map((foto, i) => (
                <div key={foto.id} className="w-16 h-16 rounded-xl bg-surface-low border border-outline-variant/20 overflow-hidden relative group">
                  <button onClick={() => onClickThumb(i)} className="w-full h-full">
                    <img src={foto.url} alt="" className="w-full h-full object-cover" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-primary-foreground text-xs hidden group-hover:flex items-center justify-center border-2 border-white active:scale-90">×</button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Foto verwijderen?</AlertDialogTitle><AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(foto.id, foto.storage_path)}>Verwijderen</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Nav buttons */}
        <div className="flex gap-2">
          <button
            onClick={onPrev}
            disabled={step === 0}
            className="flex-1 py-3.5 bg-surface-low border border-outline-variant/20 rounded-xl text-sm font-semibold text-on-surface-variant active:scale-95 transition-transform disabled:opacity-30"
          >
            ← Vorige
          </button>
          <button
            onClick={onNext}
            className="flex-[2] py-3.5 bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
          >
            {step === total - 1 ? "✓ Afronden" : "Volgende →"}
          </button>
        </div>
        <button onClick={onSkip} className="w-full mt-2 text-xs text-on-surface-variant/50 hover:text-on-surface-variant py-2 transition-colors">
          Overslaan (niet van toepassing)
        </button>
      </div>
    </div>
  );
}

/* ==================== COMPLETION SCREEN ==================== */

function CompletionScreen({ filledCount, total, stationName, onReset, onBack, onPdf }: { filledCount: number; total: number; stationName: string; onReset: () => void; onBack: () => void; onPdf: () => void }) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-outline-variant/10 text-center animate-pop">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-light rounded-3xl mx-auto mb-5 flex items-center justify-center shadow-xl shadow-primary/25">
          <span className="material-symbols-outlined fill text-primary-foreground text-4xl">check_circle</span>
        </div>
        <h2 className="text-2xl font-black mb-2 text-on-surface">Klaar! 🎉</h2>
        <p className="text-on-surface-variant text-sm mb-6">
          {filledCount === total ? "Alle" : `${filledCount} van ${total}`} categorieën ingevuld voor<br /><strong>{stationName}</strong>
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onReset} className="w-full py-3 bg-surface-low border border-outline-variant/20 rounded-xl text-sm font-semibold text-on-surface-variant active:scale-95 transition-transform">↺ Opnieuw beginnen</button>
          <button onClick={onBack} className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform">Terug naar overzicht</button>
          <button onClick={onPdf} className="w-full py-3 bg-surface-low border border-outline-variant/20 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform text-on-surface-variant">
            <span className="material-symbols-outlined fill text-primary text-base">picture_as_pdf</span>PDF downloaden
          </button>
        </div>
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
    <div className="group bg-surface-low hover:bg-card transition-all duration-200 rounded-[1.5rem] p-3 border border-transparent hover:border-outline-variant/20 hover:shadow-md space-y-2 relative overflow-hidden cursor-pointer active:scale-[0.98]">
      <div className={`relative aspect-square rounded-xl flex items-center justify-center overflow-hidden ${
        filled ? "bg-primary-container/40" : "bg-surface-high border-2 border-dashed border-outline-variant/40"
      }`}>
        {filled ? (
          <>
            <span className="material-symbols-outlined fill text-primary text-3xl">{icon}</span>
            <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined fill text-primary-foreground text-xs">check</span>
            </div>
          </>
        ) : (
          <span className="material-symbols-outlined text-on-surface-variant/30 text-3xl">photo_camera</span>
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
        <div className="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-wider">#{String(category.id).padStart(2, "0")}</div>
        <div className="text-xs font-bold leading-tight text-on-surface">{category.name}</div>
        <div className="flex items-center gap-1 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${filled ? "bg-primary" : "bg-slate-300"}`} />
          <span className={`text-[9px] font-black uppercase tracking-wide ${filled ? "text-primary" : "text-on-surface-variant/40"}`}>
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

      <button
        onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        disabled={isUploading}
        className="w-full py-2 bg-card border border-outline-variant/20 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all active:scale-95 flex items-center justify-center gap-1"
      >
        <span className="material-symbols-outlined text-sm">photo_camera</span>
        {isUploading ? "Uploaden..." : "Toevoegen"}
      </button>
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
          <button onClick={handleSave} disabled={saving} className="w-full bg-gradient-to-r from-primary to-primary-light text-primary-foreground font-bold py-3 rounded-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform disabled:opacity-50">
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
