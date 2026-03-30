import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, FOTO_CATEGORIEEN, slugify } from "@/lib/categories";
import { ArrowLeft, FileDown, Check, Trash2, Camera, Pencil, ChevronLeft, ChevronRight, SkipForward, Info, Lightbulb, CheckCircle2, X, LayoutGrid, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRef, useState, useCallback } from "react";
import imageCompression from "browser-image-compression";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/webp"];

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
  const [mode, setMode] = useState<"overzicht" | "invullen">("overzicht");
  const [currentStep, setCurrentStep] = useState(0);
  const [showTip, setShowTip] = useState(false);
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
    if (currentStep < CATEGORIES.length - 1) { setCurrentStep(currentStep + 1); setShowTip(false); }
    else { setCompleted(true); }
  };
  const goPrev = () => { if (currentStep > 0) { setCurrentStep(currentStep - 1); setShowTip(false); } };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <div className="container mx-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div><Skeleton className="mb-1 h-5 w-40" /><Skeleton className="h-3 w-24" /></div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4"><Skeleton className="mb-2 h-4 w-3/4" /><Skeleton className="mb-2 h-16 w-full" /><Skeleton className="h-8 w-full" /></div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!station) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-foreground">Station niet gevonden</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={lightboxSlides} index={lightboxIndex} />
      <EditStationDialog station={station} open={editOpen} onOpenChange={setEditOpen} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["station", id] }); queryClient.invalidateQueries({ queryKey: ["stations"] }); }} />

      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="container mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground">{station.naam_msr}</h1>
                  <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {station.behuizingsnummer && <span className="font-mono">{station.behuizingsnummer}</span>}
                  <Badge variant={station.type_ruimte === "Compact Station" ? "default" : "secondary"} className={station.type_ruimte === "Compact Station" ? "bg-primary/15 text-primary border-primary/30 text-[10px]" : "bg-secondary/15 text-secondary-foreground border-secondary/30 text-[10px]"}>{station.type_ruimte}</Badge>
                  {station.datum && <span>{station.datum}</span>}
                </div>
              </div>
            </div>
            <Button onClick={openPdf} size="sm"><FileDown className="mr-1.5 h-4 w-4" />PDF downloaden</Button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="shrink-0 text-xs text-muted-foreground">{filledCount} van {FOTO_CATEGORIEEN.length} categorieën ingevuld</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${(filledCount / FOTO_CATEGORIEEN.length) * 100}%` }} />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:px-6">
        <Tabs value={mode} onValueChange={(v) => { setMode(v as "overzicht" | "invullen"); setCompleted(false); }} className="mb-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overzicht" className="flex-1 sm:flex-none gap-1.5"><LayoutGrid className="h-4 w-4" />Overzicht</TabsTrigger>
            <TabsTrigger value="invullen" className="flex-1 sm:flex-none gap-1.5"><ListChecks className="h-4 w-4" />Invullen</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "overzicht" ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {CATEGORIES.map((cat, i) => {
              const catFotos = fotosByCategorie(cat.name);
              return (
                <CategoryCard key={cat.id} index={i} categorie={cat.name} fotos={catFotos} hasFotos={catFotos.length > 0}
                  isUploading={uploadingCat === cat.name} uploadProgress={uploadProgress[cat.name]}
                  onUpload={(files) => handleUpload(cat.name, files)} onDelete={handleDelete}
                  onClickThumb={(idx) => openLightbox(cat.name, idx)} />
              );
            })}
          </div>
        ) : completed ? (
          <CompletionScreen filledCount={filledCount} total={CATEGORIES.length} onBack={() => { setMode("overzicht"); setCompleted(false); }} onPdf={openPdf} />
        ) : (
          <StepByStepView
            station={station} category={CATEGORIES[currentStep]} step={currentStep} total={CATEGORIES.length}
            fotos={fotosByCategorie(CATEGORIES[currentStep].name)} showTip={showTip} onToggleTip={() => setShowTip(!showTip)}
            isUploading={uploadingCat === CATEGORIES[currentStep].name} uploadProgress={uploadProgress[CATEGORIES[currentStep].name]}
            onUpload={(files) => handleUpload(CATEGORIES[currentStep].name, files)} onDelete={handleDelete}
            onNext={goNext} onPrev={goPrev} onSkip={goNext}
            onClickThumb={(idx) => openLightbox(CATEGORIES[currentStep].name, idx)}
          />
        )}
      </main>
    </div>
  );
}

/* ==================== STEP-BY-STEP VIEW ==================== */

interface StepByStepViewProps {
  station: { vermogensveld: boolean | null; da_kast: boolean | null };
  category: { id: number; name: string; instruction: string; tip?: string };
  step: number; total: number;
  fotos: FotoRow[]; showTip: boolean; onToggleTip: () => void;
  isUploading: boolean; uploadProgress?: number;
  onUpload: (files: FileList) => void; onDelete: (id: string, path: string) => void;
  onNext: () => void; onPrev: () => void; onSkip: () => void;
  onClickThumb: (idx: number) => void;
}

function StepByStepView({ station, category, step, total, fotos, showTip, onToggleTip, isUploading, uploadProgress, onUpload, onDelete, onNext, onPrev, onSkip, onClickThumb }: StepByStepViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isVermogensveld = category.id === 14;
  const isDaKast = category.id === 15;
  const notApplicable = (isVermogensveld && !station.vermogensveld) || (isDaKast && !station.da_kast);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress header */}
      <div className="mb-4 flex items-center gap-3">
        <span className="shrink-0 text-sm font-medium text-muted-foreground">Stap {step + 1} / {total}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      {/* Category heading */}
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">{category.id}</span>
        <h2 className="text-xl font-bold text-foreground">{category.name}</h2>
      </div>

      {/* Instruction box */}
      <div className="mb-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
          <p className="text-sm text-blue-200">{category.instruction}</p>
        </div>
      </div>

      {/* Tip box */}
      {category.tip && (
        <div className="mb-4">
          <button onClick={onToggleTip} className="mb-1 flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300">
            <Lightbulb className="h-3.5 w-3.5" />
            {showTip ? "Verberg tip" : "Toon tip"}
          </button>
          {showTip && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="text-sm text-yellow-200">{category.tip}</p>
            </div>
          )}
        </div>
      )}

      {/* Not applicable warning */}
      {notApplicable && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            {isVermogensveld ? "Vermogensveld is niet aanwezig bij dit station." : "DA-kast is niet aanwezig bij dit station."}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onSkip}>
            <SkipForward className="mr-1.5 h-4 w-4" />Niet van toepassing — overslaan
          </Button>
        </div>
      )}

      {/* Upload zone */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={isUploading}
        className="mb-4 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-accent/50 p-8 transition-colors hover:border-primary disabled:opacity-50 sm:p-12"
      >
        <Camera className="h-10 w-10 text-muted-foreground" />
        <span className="text-sm text-muted-foreground sm:hidden">Tik om foto's te selecteren</span>
        <span className="text-sm text-muted-foreground hidden sm:block">Klik of sleep foto's hierheen</span>
      </button>

      {isUploading && uploadProgress !== undefined && (
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {/* Uploaded photos */}
      {fotos.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {fotos.length} foto{fotos.length !== 1 ? "'s" : ""} geüpload
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fotos.map((foto, fi) => (
              <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-lg">
                <button className="h-full w-full" onClick={() => onClickThumb(fi)}>
                  <img src={foto.url} alt="" className="h-full w-full object-cover" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="absolute right-1 top-1 rounded-full bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Foto verwijderen?</AlertDialogTitle><AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(foto.id, foto.storage_path)}>Verwijderen</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="outline" size="lg" onClick={onPrev} disabled={step === 0} className="flex-1">
          <ChevronLeft className="mr-1 h-5 w-5" />Vorige
        </Button>
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs text-muted-foreground shrink-0">
          <SkipForward className="mr-1 h-3.5 w-3.5" />Overslaan
        </Button>
        <Button size="lg" onClick={onNext} className="flex-1">
          {step === total - 1 ? "Afronden" : "Volgende"}<ChevronRight className="ml-1 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

/* ==================== COMPLETION SCREEN ==================== */

function CompletionScreen({ filledCount, total, onBack, onPdf }: { filledCount: number; total: number; onBack: () => void; onPdf: () => void }) {
  const allDone = filledCount === total;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20">
        <CheckCircle2 className="h-10 w-10 text-green-400" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-foreground">
        {allDone ? "Alle categorieën ingevuld!" : `${filledCount} van ${total} categorieën ingevuld`}
      </h2>
      <p className="mb-8 text-sm text-muted-foreground">
        {allDone ? "Het fotorapport is compleet." : "Je kunt ontbrekende categorieën later nog invullen."}
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}><LayoutGrid className="mr-1.5 h-4 w-4" />Terug naar overzicht</Button>
        <Button onClick={onPdf}><FileDown className="mr-1.5 h-4 w-4" />PDF downloaden</Button>
      </div>
    </div>
  );
}

/* ==================== CATEGORY CARD (OVERZICHT MODE) ==================== */

interface CategoryCardProps {
  index: number; categorie: string;
  fotos: FotoRow[]; hasFotos: boolean;
  isUploading: boolean; uploadProgress?: number;
  onUpload: (files: FileList) => void;
  onDelete: (id: string, storagePath: string) => void;
  onClickThumb: (index: number) => void;
}

function CategoryCard({ index, categorie, fotos, hasFotos, isUploading, uploadProgress, onUpload, onDelete, onClickThumb }: CategoryCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const visibleFotos = fotos.slice(0, 4);
  const extra = fotos.length - 4;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{index + 1}</span>
          <h3 className="text-xs font-medium text-foreground leading-tight sm:text-sm">{categorie}</h3>
        </div>
        {hasFotos ? (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20"><Check className="h-3 w-3 text-green-400" /></div>
        ) : (
          <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
        )}
      </div>

      {fotos.length > 0 && (
        <div className="mb-2 grid grid-cols-2 gap-1">
          {visibleFotos.map((foto, fi) => (
            <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-lg">
              <button className="h-full w-full" onClick={() => onClickThumb(fi)}>
                <img src={foto.url} alt="" className="h-full w-full object-cover" />
              </button>
              {fi === 3 && extra > 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-sm font-semibold text-foreground">+{extra} meer</div>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="absolute right-1 top-1 rounded-md bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Foto verwijderen?</AlertDialogTitle><AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Annuleren</AlertDialogCancel><AlertDialogAction onClick={() => onDelete(foto.id, foto.storage_path)}>Verwijderen</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      {isUploading && uploadProgress !== undefined && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
        onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />
      <Button variant="outline" size="sm" className="w-full text-xs" disabled={isUploading} onClick={() => fileRef.current?.click()}>
        <Camera className="mr-1.5 h-3 w-3" />{isUploading ? "Uploaden..." : "Foto's toevoegen"}
      </Button>
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
          <div><Label>Naam MSR</Label><Input value={form.naam_msr} onChange={(e) => setForm({ ...form, naam_msr: e.target.value })} /></div>
          <div><Label>Behuizingsnummer</Label><Input value={form.behuizingsnummer} onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })} /></div>
          <div><Label>Type ruimte</Label><Select value={form.type_ruimte} onValueChange={(v) => setForm({ ...form, type_ruimte: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Compact Station">Compact Station</SelectItem><SelectItem value="Betreedbaar station">Betreedbaar station</SelectItem></SelectContent></Select></div>
          <div><Label>Ingevuld door</Label><Input value={form.ingevuld_door} onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })} /></div>
          <div><Label>Datum</Label><Input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} /></div>
          <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
