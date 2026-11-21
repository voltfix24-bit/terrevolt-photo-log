import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { categorieKlaar } from "@/lib/foto-regels";
import { internetVereist } from "@/lib/internet";
import { PaginaLader } from "@/components/Laden";
import { WizardView } from "@/components/WizardView";
import { SharePointStatus } from "@/components/SharePointStatus";
import { OpleverStatus } from "@/components/OpleverStatus";
import { SharePointDocumenten } from "@/components/SharePointDocumenten";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requirePin } from "@/lib/require-pin";
import { SECTIONS, type Category } from "@/lib/categories";
import { useMergedCategories, type MergedCategory } from "@/hooks/use-categories";
import { toast } from "sonner";
import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { useVoorbeelden } from "@/components/CategorieSettings";
import { useInstellingen } from "@/hooks/use-theme";
import { Kruimelpad, deelLink } from "@/components/url/Kruimelpad";
import { beoordeelUrl, categorieUrl, caseUrl, korteUrl, opleverUrl, sectieUrl, type Sub } from "@/lib/urls";
import { GlassBar, Pressable, T, R, ROW_MIN } from "@/components/apple/Primitives";
import { useSkippedCategories } from "@/hooks/use-skipped-categories";
import { useStationUpload } from "@/hooks/use-station-upload";
import { EditStationDialog } from "@/components/station/EditStationDialog";
import { SectieKaart } from "@/components/station/SectieKaart";
import { ShareSheet } from "@/components/station/ShareSheet";
import type { FotoRow } from "@/components/station/types";

/* ==================== MAIN COMPONENT ==================== */

export default function StationDetail({ stationId, sub }: { stationId?: string; sub?: Sub } = {}) {
  const params = useParams<{ id: string }>();
  const id = stationId ?? params.id;
  const documentenRef = useRef<HTMLDivElement | null>(null);
  const deeplinkRef = useRef<string>("");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
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

  // Aantal benodigde foto's staat centraal in src/lib/foto-regels.ts
  const catDone = useCallback(
    (c: { id: number; name: string }) => categorieKlaar(c.id, fotosByCategorie(c.name).length),
    [fotosByCategorie]
  );

  const filledCount = applicableCategories.filter(catDone).length;

  const { uploadingCat, uploadProgress, bewaren, handleUpload, handleDelete, verstuur } = useStationUpload(id, { fotosByCategorie, isSkipped, removeSkip, beschermd: !!station?.submitted_at || station?.status === "opgeleverd" || station?.status === "goedgekeurd" });

  const openLightbox = (cat: string, index: number) => {
    const catFotos = fotosByCategorie(cat);
    setLightboxSlides(catFotos.map((f) => ({ src: f.url })));
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const downloadZip = async () => {
    if (!station || !fotos || fotos.length === 0) {
      toast.error("Geen foto's om te downloaden");
      return;
    }
    const toastId = toast.loading("ZIP wordt voorbereid...");
    try {
      const { downloadStationZip } = await import("@/lib/zip-download");
      const r = await downloadStationZip(station.naam_msr, fotos, (pct) => toast.loading(`ZIP wordt voorbereid... ${pct}%`, { id: toastId }));
      if (r.mislukt > 0) toast.warning(`ZIP gedownload, maar ${r.mislukt} van ${r.totaal} foto's ontbreken`, { id: toastId, duration: 8000 });
      else toast.success("ZIP gedownload", { id: toastId });
    } catch {
      toast.error("ZIP download mislukt", { id: toastId });
    }
  };

  const openPdf = () => {
    if (!internetVereist()) return;
    if (!station || !fotos) return;
    const html = generatePdfHtml(station, fotos, instellingenData ?? undefined, opmerkingen ?? undefined, skipped.map(categorie => ({ categorie, reden: skippedReasons[categorie] || 'Geen reden opgegeven' })));
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    setShareStation(station.naam_msr);
    setTimeout(() => setShareOpen(true), 500);
  };

  const openWizardAt = useCallback((cat: MergedCategory | Category) => {
    if (station?.status === 'opgeleverd' || station?.status === 'goedgekeurd') {
      // Opgeleverd: foto's direct bekijken zonder code; wijzigen gaat via "Wijzig" (met code).
      const catFotos = fotosByCategorie(cat.name);
      if (catFotos.length > 0) {
        setLightboxSlides(catFotos.map((f) => ({ src: f.url })));
        setLightboxIndex(0);
        setLightboxOpen(true);
      } else {
        toast.info("Geen foto's in deze categorie");
      }
      return;
    }
    const idx = applicableCategories.findIndex(c => c.id === cat.id);
    setWizardStartIndex(idx >= 0 ? idx : 0);
    setWizardOpen(true);
  }, [applicableCategories, station?.status, fotosByCategorie]);

  useEffect(() => {
    const categoryId = Number(searchParams.get("categorie"));
    if (!categoryId || applicableCategories.length === 0) return;
    const category = applicableCategories.find((item) => item.id === categoryId);
    if (!category) return;
    openWizardAt(category);
    setSearchParams({}, { replace: true });
  }, [applicableCategories, openWizardAt, searchParams, setSearchParams]);

  // Deeplinks via de url: sectie openen/scrollen, categorie direct openen, documenten-blok tonen
  const subKey = sub ? JSON.stringify(sub) : "";
  useEffect(() => {
    if (!sub || !station || deeplinkRef.current === subKey) return;
    if (sub.soort === "sectie") {
      deeplinkRef.current = subKey;
      setOpenSections([sub.sectionId]);
      setTimeout(() => sectionRefs.current[sub.sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } else if (sub.soort === "documenten") {
      deeplinkRef.current = subKey;
      setTimeout(() => documentenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } else if (sub.soort === "categorie") {
      if (applicableCategories.length === 0 || !fotos) return;
      deeplinkRef.current = subKey;
      setOpenSections([sub.sectionId]);
      const cat = applicableCategories.find((c) => c.id === sub.categorieId);
      if (cat) openWizardAt(cat);
      else navigate(caseUrl(station), { replace: true });
    } else deeplinkRef.current = subKey;
  }, [subKey, station, applicableCategories, fotos, openWizardAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCategorie = useCallback((cat: MergedCategory) => {
    openWizardAt(cat);
    if (station && sub) {
      deeplinkRef.current = JSON.stringify({ soort: "categorie", sectionId: cat.section, categorieId: cat.id });
      navigate(categorieUrl(station, cat), { replace: true });
    }
  }, [openWizardAt, station, sub, navigate]);

  const sluitWizard = useCallback(() => {
    setWizardOpen(false);
    if (station && sub?.soort === "categorie") {
      deeplinkRef.current = JSON.stringify({ soort: "sectie", sectionId: sub.sectionId });
      navigate(sectieUrl(station, sub.sectionId), { replace: true });
    }
  }, [station, sub, navigate]);

  // Find next incomplete category across applicable categories
  const nextIncomplete = useMemo(() => {
    for (const cat of applicableCategories) {
      if (!catDone(cat) && !isSkipped(cat.name)) {
        return cat;
      }
    }
    return null;
  }, [catDone, isSkipped, applicableCategories]);

  const allDone = !nextIncomplete;
  const vergrendeld = station?.status === 'opgeleverd' || station?.status === 'goedgekeurd';

  // Auto-expand first incomplete section on load
  useEffect(() => {
    if (!fotos) return;
    const firstIncomplete = SECTIONS.find(s => {
      const cats = applicableCategories.filter(c => c.section === s.id);
      return cats.some(c => !catDone(c) && !isSkipped(c.name));
    });
    if (firstIncomplete && openSections.length === 0) {
      setOpenSections([firstIncomplete.id]);
    }
  }, [fotos]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PaginaLader label="Station laden…" />;

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
          onClose={sluitWizard}
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
          bewaren={bewaren}
          onVerstuur={verstuur}
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
          <div className="flex flex-wrap items-center justify-between gap-x-2 mb-4">
            <Pressable
              onClick={() => navigate('/')}
              aria-label="Terug naar stations"
              style={{ minHeight: 44, minWidth: 70, display: "flex", alignItems: "center", gap: 2, color: T.green, fontSize: 17, fontWeight: 500, textAlign: "left", marginLeft: -10, padding: "0 10px" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 21 }}>chevron_left</span>
              <span>Stations</span>
            </Pressable>
            <div className="flex items-center gap-2">
              <Pressable onClick={() => void deelLink(korteUrl(station), [station.casenummer, station.casenaam].filter(Boolean).join(" ") || station.naam_msr, toast)} style={{ minHeight: 44, padding: "0 8px", color: T.green, fontSize: 17 }}>Link kopiëren</Pressable>
              <Pressable onClick={openPdf} style={{ minHeight: 44, padding: "0 8px", color: T.green, fontSize: 17 }}>Pdf</Pressable>
              <Pressable onClick={async () => { if (vergrendeld && !(await requirePin("Dossier is opgeleverd", "Voer de toegangscode in om te wijzigen."))) return; setEditOpen(true); }} style={{ minHeight: 44, padding: "0 4px 0 8px", color: T.green, fontSize: 17 }}>Wijzig</Pressable>
            </div>
          </div>

          {sub && <Kruimelpad station={station} sectionId={sub.soort === "sectie" || sub.soort === "categorie" ? sub.sectionId : undefined} categorieId={sub.soort === "categorie" ? sub.categorieId : undefined} />}
          {/* ROW 2: Station info */}
          {station.behuizingsnummer && <div style={{ fontSize: 14, color: T.subOnBg, fontFamily: "ui-monospace, monospace", marginBottom: 4 }}>{station.behuizingsnummer}</div>}
          {(station.casenummer || station.casenaam) && <div style={{ overflowWrap: "anywhere", fontSize: 14, color: T.subOnBg, marginBottom: 4 }}>Case: {[station.casenummer, station.casenaam].filter(Boolean).join(" · ")}</div>}
          <h1 className="font-display leading-tight mb-1" style={{ overflowWrap: "anywhere", fontSize: 28, fontWeight: 500, color: T.titleOnBg }}>
            {station.naam_msr}
          </h1>
          <p className="mb-5" style={{ fontSize: 14, color: T.subOnBg }}>
            {[station.datum, station.ingevuld_door].filter(Boolean).join(' · ')}
          </p>
          <OpleverStatus stationId={station.id} />
          <SharePointStatus station={station} />
          <div ref={documentenRef} style={{ scrollMarginTop: 16 }}><SharePointDocumenten stationId={station.id} /></div>

          {station.status === 'in uitvoering' && station.review_reden && (
            <div style={{ background: T.dangerBg, borderRadius: R.group, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: T.danger, marginBottom: 3 }}>Afgekeurd door {station.opdrachtgever ?? 'de opdrachtgever'}</div>
              <div style={{ fontSize: 15, color: T.rowText, lineHeight: 1.4 }}>{station.review_reden}</div>
            </div>
          )}

          {/* Progress row */}
          <div>
            <div className="font-display leading-tight" style={{ fontSize: 34, fontWeight: 500, color: T.titleOnBg }}>
              {allDone ? 'Alle taken afgerond' : `${applicableCategories.filter(c => !catDone(c) && !isSkipped(c.name)).length} taken open`}
            </div>
            <div className="mt-1" style={{ fontSize: 15, color: T.subOnBg }}>{applicableCategories.filter(c => fotosByCategorie(c.name).length > 0).length} gefotografeerd · {applicableCategories.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name)).length} N.v.t. · {fotos?.length ?? 0} foto&apos;s</div>
          </div>
        </div>

        {/* ── 2. SECTION ACCORDION ── */}
        <div className="mb-8">
          {sectionGroups.map(({ section, categories: cats }) => (
            <SectieKaart
              key={section.id}
              ref={el => { sectionRefs.current[section.id] = el; }}
              section={section}
              cats={cats}
              isSectionOpen={openSections.includes(section.id)}
              onToggle={() => toggleSection(section.id)}
              catDone={catDone}
              isSkipped={isSkipped}
              fotosByCategorie={fotosByCategorie}
              skippedReasons={skippedReasons}
              opmerkingVan={(naam) => opmerkingen?.find(o => o.categorie === naam)?.opmerking?.trim() || undefined}
              onOpen={openCategorie}
            />
          ))}
        </div>
        {vergrendeld && !wizardOpen && <div aria-hidden="true" style={{ height: station?.status === 'opgeleverd' ? 250 : 190 }} />}
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
              onClick={() => navigate(opleverUrl(station))}
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
          <div className="max-w-3xl mx-auto" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ textAlign: "center", fontSize: 14, color: T.subOnBg, lineHeight: 1.4 }}>
              {station?.status === 'goedgekeurd'
                ? `Goedgekeurd door ${station?.opdrachtgever ?? 'de opdrachtgever'}. Wijzigen kan alleen met de toegangscode.`
                : `Opgeleverd aan ${station?.opdrachtgever ?? 'de opdrachtgever'}. Wijzigen kan alleen met de toegangscode.`}
            </div>
            {station?.status === 'opgeleverd' && station?.uitvoerder === 'terrevolt' && (
              <Pressable onClick={() => navigate(beoordeelUrl(station))} style={{ minHeight: ROW_MIN, background: T.surface, color: T.green, borderRadius: R.control, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: `1px solid ${T.green}` }}>
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>fact_check</span>
                Dossier beoordelen
              </Pressable>
            )}
            <div className="flex gap-2.5">
              <Pressable
                onClick={() => {
                  if (!fotos || fotos.length === 0) { toast.info("Geen foto's"); return; }
                  setLightboxSlides(fotos.map((f) => ({ src: f.url })));
                  setLightboxIndex(0);
                  setLightboxOpen(true);
                }}
                style={{ flex: 1, minHeight: ROW_MIN, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
              >
                Foto's bekijken
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>photo_library</span>
              </Pressable>
              <Pressable
                onClick={downloadZip}
                style={{ minHeight: ROW_MIN, padding: "0 16px", background: T.surface, color: T.green, borderRadius: R.control, fontSize: 17, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, flexShrink: 0 }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>download</span>
                ZIP
              </Pressable>
            </div>
          </div>
        </GlassBar>
      )}
      {/* Share bottom sheet */}
      {shareOpen && <ShareSheet stationNaam={shareStation} onClose={() => setShareOpen(false)} onZip={downloadZip} />}
    </div>
  );
}
