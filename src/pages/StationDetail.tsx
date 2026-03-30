import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, FOTO_CATEGORIEEN, SECTIONS, getCategoriesBySection, slugify, type Category, type Section } from "@/lib/categories";
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
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { useVoorbeelden } from "@/components/CategorieSettings";

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/webp"];

type FotoRow = { id: string; url: string; storage_path: string; categorie: string };

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

  const toggleSkip = useCallback((catName: string) => {
    setSkipped(prev =>
      prev.includes(catName)
        ? prev.filter(n => n !== catName)
        : [...prev, catName]
    );
  }, [setSkipped]);

  const isSkipped = useCallback((catName: string) => skipped.includes(catName), [skipped]);

  return { skipped, toggleSkip, isSkipped };
}

/* ==================== CATEGORY ROW ==================== */
function CategoryRow({ cat, fotos, isLast, isSkipped, onOpen }: {
  cat: Category; fotos: FotoRow[]; isLast?: boolean; isSkipped?: boolean; onOpen: () => void;
}) {
  const isDone = fotos.length > 0;
  return (
    <button
      onClick={onOpen}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-low transition-colors ${
        !isLast ? 'border-b border-outline-variant/[0.08]' : ''
      }`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isDone
          ? 'bg-primary'
          : isSkipped
          ? 'bg-surface-high'
          : 'border-2 border-accent-gold/40 bg-accent-gold/5'
      }`}>
        <span className={`material-symbols-rounded text-sm ${
          isDone ? 'text-primary-foreground' : isSkipped ? 'text-text-faint' : 'text-accent-gold'
        }`} style={{ fontVariationSettings: "'FILL' 1" }}>
          {isDone ? 'check' : isSkipped ? 'remove' : 'photo_camera'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold leading-tight ${isSkipped ? 'text-text-faint line-through' : 'text-on-surface'}`}>
          {cat.name}
        </div>
        {isDone ? (
          <div className="flex gap-1.5 mt-1.5">
            {fotos.slice(0, 5).map(f => (
              <img key={f.id} src={f.url} className="w-9 h-9 rounded-lg object-cover border border-outline-variant/20" alt="" />
            ))}
            {fotos.length > 5 && (
              <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
                <span className="text-[10px] font-bold text-muted-foreground">+{fotos.length - 5}</span>
              </div>
            )}
          </div>
        ) : isSkipped ? (
          <div className="text-xs text-text-faint mt-0.5">Overgeslagen (NVT)</div>
        ) : (
          <div className="text-xs text-accent-gold font-semibold mt-0.5">Nog geen foto's</div>
        )}
      </div>
      <span className="material-symbols-rounded text-muted-foreground/30 text-lg flex-shrink-0">chevron_right</span>
    </button>
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
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [tipOpen, setTipOpen] = useState<Record<number, boolean>>({});
  const { data: voorbeelden } = useVoorbeelden();
  const { skipped, toggleSkip, isSkipped } = useSkippedCategories(id);

  const toggleSection = useCallback((sectionId: string) => {
    setOpenSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(s => s !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  const sectionGroups = useMemo(() => getCategoriesBySection(), []);

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
  const pct = Math.round((filledCount / CATEGORIES.length) * 100);

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

  // Find next incomplete category across ALL sections
  const nextIncomplete = useMemo(() => {
    for (const cat of CATEGORIES) {
      if (fotosByCategorie(cat.name).length === 0 && !isSkipped(cat.name)) {
        return cat;
      }
    }
    return null;
  }, [fotosByCategorie, isSkipped]);

  const allDone = !nextIncomplete;

  // Auto-expand first incomplete section on load
  useEffect(() => {
    if (!fotos) return;
    const firstIncomplete = SECTIONS.find(s => {
      const cats = CATEGORIES.filter(c => c.section === s.id);
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
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <Lightbox open={lightboxOpen} close={() => setLightboxOpen(false)} slides={lightboxSlides} index={lightboxIndex} />
      <EditStationDialog station={station} open={editOpen} onOpenChange={setEditOpen} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["station", id] }); queryClient.invalidateQueries({ queryKey: ["stations"] }); }} />

      {/* ── Category Detail Overlay ── */}
      {openCategory && (
        <CategoryDetailView
          station={station}
          category={openCategory}
          fotos={fotosByCategorie(openCategory.name)}
          isUploading={uploadingCat === openCategory.name}
          uploadProgress={uploadProgress[openCategory.name]}
          tipOpen={!!tipOpen[openCategory.id]}
          onToggleTip={() => setTipOpen(prev => ({ ...prev, [openCategory.id]: !prev[openCategory.id] }))}
          onUpload={(files) => handleUpload(openCategory.name, files)}
          onDelete={handleDelete}
          onClickThumb={(idx) => openLightbox(openCategory.name, idx)}
          onClose={() => setOpenCategory(null)}
          onSkip={() => { toggleSkip(openCategory.name); setOpenCategory(null); toast("Overgeslagen"); }}
          voorbeelden={voorbeelden?.filter(v => v.categorie === openCategory.name) ?? []}
        />
      )}

      <main className="pt-20 pb-0 px-4 max-w-3xl mx-auto animate-fade-up">
        {/* ── 1. HERO CARD ── */}
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-outline-variant/10 mb-4">
          {/* Top row: station name + type badge + actions */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <button onClick={() => navigate("/")} className="flex items-center text-text-secondary hover:text-primary-hover transition-colors flex-shrink-0">
                  <span className="material-symbols-rounded text-lg">arrow_back_ios</span>
                </button>
                {station.type_ruimte && (
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full"
                    style={station.type_ruimte?.toLowerCase().includes('cs')
                      ? { background: "rgba(232,84,26,0.1)", color: "#E8541A" }
                      : { background: "rgba(107,45,139,0.1)", color: "#6B2D8B" }
                    }
                  >
                    {station.type_ruimte}
                  </span>
                )}
                {station.behuizingsnummer && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {station.behuizingsnummer}
                  </span>
                )}
              </div>
              <h2 className="font-display text-[22px] font-extrabold tracking-tight text-on-surface leading-tight">
                {station.naam_msr}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {station.datum} · {station.ingevuld_door}
              </p>
            </div>
            {/* Actions */}
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={openPdf} className="p-2.5 bg-surface-white border border-outline-variant/20 rounded-xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all active:scale-95 text-text-secondary hover:text-primary">
                <span className="material-symbols-rounded text-lg">picture_as_pdf</span>
              </button>
              <button onClick={() => setEditOpen(true)} className="p-2.5 bg-surface-white border border-outline-variant/20 rounded-xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all active:scale-95 text-text-secondary hover:text-primary">
                <span className="material-symbols-rounded text-lg">edit</span>
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Voortgang</span>
              <span className="text-xs font-extrabold text-primary font-mono">{filledCount} / {CATEGORIES.length}</span>
            </div>
            <div className="h-2 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-muted-foreground">
                {pct === 100 ? "✓ Volledig afgerond" : `${pct}% compleet`}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {fotos?.length ?? 0} foto's
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. SECTION ACCORDION ── */}
        <div className="space-y-3 mb-8">
          {sectionGroups.map(({ section, categories: cats }) => {
            const doneCats = cats.filter(c => fotosByCategorie(c.name).length > 0);
            const openCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && !isSkipped(c.name));
            const skippedCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name));
            const isComplete = doneCats.length === cats.length;
            const isSectionOpen = openSections.includes(section.id);
            const totalFotosInSection = cats.reduce((sum, c) => sum + fotosByCategorie(c.name).length, 0);
            const openCount = openCats.length;

            return (
              <div
                key={section.id}
                className={`rounded-2xl overflow-hidden transition-all ${
                  isComplete
                    ? 'bg-primary/[0.06] border border-primary/20'
                    : 'bg-card border border-outline-variant/15 shadow-sm'
                }`}
              >
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isComplete
                      ? 'bg-primary shadow-sm shadow-primary/30'
                      : 'bg-surface-container relative'
                  }`}>
                    <span className={`material-symbols-rounded text-lg ${
                      isComplete ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`} style={{ fontVariationSettings: isComplete ? "'FILL' 1" : "'FILL' 0" }}>
                      {isComplete ? 'check' : 'folder_open'}
                    </span>
                    {!isComplete && openCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent-gold rounded-full flex items-center justify-center">
                        <span className="text-[9px] font-black text-white">{openCount}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-display font-extrabold text-[15px] ${isComplete ? 'text-primary' : 'text-on-surface'}`}>
                      {section.label}
                    </div>
                    <div className={`text-xs font-semibold mt-0.5 ${isComplete ? 'text-primary/60' : 'text-muted-foreground'}`}>
                      {doneCats.length} / {cats.length} klaar
                      {!isComplete && openCount > 0 && (
                        <span className="text-accent-gold ml-2">· {openCount} open</span>
                      )}
                      {isComplete && <span> · {totalFotosInSection} foto's</span>}
                    </div>
                  </div>
                  <span className={`material-symbols-rounded text-xl ${isComplete ? 'text-primary/40' : 'text-muted-foreground/40'}`}>
                    {isSectionOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {/* Expanded content */}
                {isSectionOpen && (
                  <div className={`border-t ${isComplete ? 'border-primary/15 bg-primary/[0.03]' : 'border-outline-variant/10'}`}>
                    {/* Open items first */}
                    {openCats.length > 0 && (
                      <>
                        <div className="px-4 pt-3 pb-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-accent-gold">
                            Nog te doen ({openCats.length})
                          </span>
                        </div>
                        {openCats.map((cat, idx) => (
                          <CategoryRow key={cat.id} cat={cat} fotos={[]} isLast={idx === openCats.length - 1 && doneCats.length === 0 && skippedCats.length === 0} onOpen={() => setOpenCategory(cat)} />
                        ))}
                      </>
                    )}

                    {/* Divider */}
                    {openCats.length > 0 && (doneCats.length > 0 || skippedCats.length > 0) && (
                      <div className="mx-4 my-1 h-px bg-outline-variant/15" />
                    )}

                    {/* Done items */}
                    {doneCats.length > 0 && (
                      <>
                        <div className="px-4 pt-2 pb-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-primary/60">
                            Klaar ({doneCats.length})
                          </span>
                        </div>
                        {doneCats.map((cat, idx) => (
                          <CategoryRow key={cat.id} cat={cat} fotos={fotosByCategorie(cat.name)} isLast={idx === doneCats.length - 1 && skippedCats.length === 0} onOpen={() => setOpenCategory(cat)} />
                        ))}
                      </>
                    )}

                    {/* Skipped items */}
                    {skippedCats.length > 0 && (
                      <>
                        {(openCats.length > 0 || doneCats.length > 0) && <div className="mx-4 my-1 h-px bg-outline-variant/15" />}
                        <div className="px-4 pt-2 pb-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-text-faint">
                            Overgeslagen ({skippedCats.length})
                          </span>
                        </div>
                        {skippedCats.map((cat, idx) => (
                          <CategoryRow key={cat.id} cat={cat} fotos={[]} isLast={idx === skippedCats.length - 1} isSkipped onOpen={() => setOpenCategory(cat)} />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* ── 5. BOTTOM CTA ── */}
      {nextIncomplete && !openCategory && (
        <div className="fixed bottom-0 left-0 right-0 z-[50] p-4 bg-surface-white/95 backdrop-blur-xl border-t border-outline-variant/10 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            onClick={() => {
              setOpenSections(prev => prev.includes(nextIncomplete.section) ? prev : [...prev, nextIncomplete.section]);
              setOpenCategory(nextIncomplete);
            }}
            className="w-full max-w-3xl mx-auto min-h-[52px] bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-rounded text-[20px]">arrow_forward</span>
            Doorgaan: {nextIncomplete.name}
          </button>
        </div>
      )}
      {allDone && !openCategory && (
        <div className="fixed bottom-0 left-0 right-0 z-[50] p-4 bg-surface-white/95 backdrop-blur-xl border-t border-outline-variant/10 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            onClick={openPdf}
            className="w-full max-w-3xl mx-auto min-h-[52px] bg-gradient-to-r from-primary to-primary-light text-primary-foreground rounded-2xl font-display font-bold text-[15px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-rounded text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>
            Alles klaar — PDF downloaden
          </button>
        </div>
      )}
    </div>
  );
}

/* ==================== CATEGORY DETAIL VIEW (Full-screen overlay) ==================== */

interface CategoryDetailViewProps {
  station: { vermogensveld: boolean | null; da_kast: boolean | null; naam_msr: string };
  category: Category;
  fotos: FotoRow[];
  isUploading: boolean;
  uploadProgress?: number;
  tipOpen: boolean;
  onToggleTip: () => void;
  onUpload: (files: FileList) => void;
  onDelete: (id: string, path: string) => void;
  onClickThumb: (idx: number) => void;
  onClose: () => void;
  onSkip: () => void;
  voorbeelden: { id: string; url: string }[];
}

function CategoryDetailView({ station, category, fotos, isUploading, uploadProgress, tipOpen, onToggleTip, onUpload, onDelete, onClickThumb, onClose, onSkip, voorbeelden }: CategoryDetailViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showVoorbeeld, setShowVoorbeeld] = useState(false);
  const [voorbeeldLightbox, setVoorbeeldLightbox] = useState<number | null>(null);
  const isVermogensveld = category.id === 14;
  const isDaKast = category.id === 15;
  const hasPhotos = fotos.length > 0;
  const section = SECTIONS.find(s => s.id === category.section);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col animate-fade-up">
      {/* Header */}
      <div className="shrink-0 bg-surface px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onClose} className="flex items-center gap-1 text-text-muted hover:text-primary-hover text-[13px] font-medium active:scale-95 transition-all">
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-text-faint hover:text-text-muted active:scale-[0.97] transition-all"
          >
            NVT
          </button>
        </div>

        {/* Section + category label */}
        {section && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ background: section.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: section.color }}>
              {section.label}
            </span>
          </div>
        )}
        <h2 className="font-display text-[20px] font-extrabold tracking-tight leading-tight text-text-primary">
          {category.name}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-3" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {/* Instruction */}
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
            <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>vermogensveld aanwezig</strong> is.</span>
          </div>
        )}
        {isDaKast && (
          <div className="rounded-2xl px-5 py-4 flex gap-3 items-start bg-amber-50/60 border border-amber-200/30">
            <span className="material-symbols-rounded text-amber-500/70 text-[20px] flex-shrink-0 mt-0.5">error</span>
            <span className="text-[13px] text-on-surface-variant leading-relaxed">Alleen fotograferen als <strong>DA-kast aanwezig</strong> is.</span>
          </div>
        )}

        {/* Example photos */}
        {voorbeelden.length > 0 && (
          <div>
            <button
              onClick={() => setShowVoorbeeld(!showVoorbeeld)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold transition-all active:scale-95 ${
                showVoorbeeld ? 'bg-primary/8 text-primary' : 'bg-surface-high text-text-muted hover:text-primary hover:bg-primary/[0.06]'
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

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" multiple className="hidden"
          onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ""; }} />

        {/* Upload zone */}
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

        {/* Photos */}
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
                className="aspect-square rounded-2xl border-2 border-dashed border-outline-variant/20 bg-transparent flex flex-col items-center justify-center gap-1.5 text-text-faint hover:border-primary/30 hover:text-primary hover:bg-primary/[0.04] active:scale-95 transition-all"
              >
                <span className="material-symbols-rounded text-[24px]">add</span>
                <span className="text-[10px] font-semibold">Meer</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[75] bg-surface-white/90 backdrop-blur-2xl border-t border-outline-variant/10 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button
          onClick={onClose}
          className="w-full min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-2xl font-display text-[15px] font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-rounded text-[18px]">check</span>
          Klaar
        </button>
      </div>
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
