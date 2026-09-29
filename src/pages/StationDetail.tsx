import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { WizardView } from "@/components/WizardView";
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
import { downloadStationZip } from "@/lib/zip-download";
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
      className="mb-2 w-full cursor-pointer px-6 py-10 text-center active:scale-[0.99]"
      style={{
        minHeight: 190,
        border: "none",
        borderRadius: R.group,
        background: T.surface,
        transform: dragging ? "scale(1.01)" : undefined,
        transition: `transform 0.2s ${M.spring}`,
      }}
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
      const { data, error } = await supabase.from("fotos").select("*").eq("station_id", id!).neq("review_status", "rejected").order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const fotosByCategorie = useCallback(
    (cat: string) => (fotos?.filter((f) => f.categorie === cat) ?? []) as FotoRow[],
    [fotos]
  );

  const filledCount = new Set(fotos?.map((f) => f.categorie).filter(c => applicableCategories.some(ac => ac.name === c))).size;

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
    if (station?.status === 'opgeleverd' || station?.status === 'goedgekeurd') {
      toast.info('Dit dossier is opgeleverd en kan niet meer worden gewijzigd');
      return;
    }
    const idx = applicableCategories.findIndex(c => c.id === cat.id);
    setWizardStartIndex(idx >= 0 ? idx : 0);
    setWizardOpen(true);
  }, [applicableCategories, station?.status]);

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
  const vergrendeld = station?.status === 'opgeleverd' || station?.status === 'goedgekeurd';

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
            <Pressable
              onClick={() => navigate('/')}
              aria-label="Terug naar stations"
              style={{ minHeight: 44, minWidth: 70, display: "flex", alignItems: "center", gap: 2, color: T.green, fontSize: 17, fontWeight: 500, textAlign: "left", marginLeft: -10, padding: "0 10px" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 21 }}>chevron_left</span>
              <span>Stations</span>
            </Pressable>
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

          {station.status === 'in uitvoering' && station.review_reden && (
            <div style={{ background: T.dangerBg, borderRadius: R.group, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.danger, marginBottom: 3 }}>Afgekeurd door {station.opdrachtgever ?? 'de opdrachtgever'}</div>
              <div style={{ fontSize: 15, color: T.rowText, lineHeight: 1.4 }}>{station.review_reden}</div>
            </div>
          )}

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
      {nextIncomplete && !wizardOpen && !vergrendeld && (
        <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
          <Pressable
            onClick={() => openWizardAt(nextIncomplete)}
            style={{ width: "100%", maxWidth: 768, margin: "0 auto", minHeight: ROW_MIN, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "0 16px" }}
          >
            Doorgaan: <span className="truncate">{nextIncomplete.name}</span><span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
          </Pressable>
        </GlassBar>
      )}
      {allDone && !wizardOpen && !vergrendeld && (
        <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
          <div className="flex gap-2.5 max-w-3xl mx-auto">
            <Pressable
              onClick={() => navigate(`/stations/${id}/opleveren`)}
              style={{ flex: 1, minHeight: ROW_MIN, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
            >
              Opleveren
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
            </Pressable>
            <Pressable onClick={openPdf} style={{ minHeight: ROW_MIN, padding: "0 8px", color: T.green, fontSize: 17, flexShrink: 0 }}>Pdf</Pressable>
            <Pressable
              onClick={() => { setShareStation(station?.naam_msr || ''); setShareOpen(true); }}
              style={{ minHeight: ROW_MIN, padding: "0 8px", color: T.green, fontSize: 17, flexShrink: 0 }}
            >
              Delen
            </Pressable>
          </div>
        </GlassBar>
      )}
      {vergrendeld && !wizardOpen && (
        <GlassBar style={{ position: "fixed", left: 0, right: 0 }}>
          <div className="max-w-3xl mx-auto" style={{ textAlign: "center", fontSize: 14, color: T.subOnBg, lineHeight: 1.4 }}>
            {station?.status === 'goedgekeurd'
              ? `Goedgekeurd door ${station?.opdrachtgever ?? 'de opdrachtgever'}. Dit dossier is afgesloten.`
              : `Opgeleverd aan ${station?.opdrachtgever ?? 'de opdrachtgever'}. Wijzigen kan niet meer.`}
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
            <button
              onClick={async () => {
                if (!station || !fotos || fotos.length === 0) {
                  toast.error("Geen foto's om te downloaden");
                  return;
                }
                const toastId = toast.loading("ZIP wordt voorbereid...");
                try {
                  await downloadStationZip(station.naam_msr, fotos, (pct) => toast.loading(`ZIP wordt voorbereid... ${pct}%`, { id: toastId }));
                  toast.success("ZIP gedownload", { id: toastId });
                } catch {
                  toast.error("ZIP download mislukt", { id: toastId });
                }
                setShareOpen(false);
              }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15 hover:bg-primary/[0.08] transition-all active:scale-[0.97] mb-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-rounded text-primary-foreground text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>folder_zip</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm text-on-surface">Foto's als ZIP</div>
                <div className="text-xs text-muted-foreground">Alle foto's van dit station</div>
              </div>
            </button>
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
