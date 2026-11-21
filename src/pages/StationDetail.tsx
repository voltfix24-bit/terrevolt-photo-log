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
import { useRef, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { generatePdfHtml } from "@/lib/pdf-generator";
import { useVoorbeelden } from "@/components/CategorieSettings";
import { useInstellingen } from "@/hooks/use-theme";
import { deelLink } from "@/components/url/Kruimelpad";
import { beoordeelUrl, categorieUrl, caseUrl, jaarVan, korteUrl, opleverUrl, sectieUrl, type Sub } from "@/lib/urls";
import { GlassBar, Pressable, T, R, ROW_MIN } from "@/components/apple/Primitives";
import { useSkippedCategories } from "@/hooks/use-skipped-categories";
import { useStationUpload } from "@/hooks/use-station-upload";
import { EditStationDialog } from "@/components/station/EditStationDialog";
import { SectieKaart } from "@/components/station/SectieKaart";
import { ShareSheet } from "@/components/station/ShareSheet";
import type { FotoRow } from "@/components/station/types";
import { BeheerCompact } from "@/components/BeheerStatus";
import { useCompacteBeheer } from "@/lib/beheer-status-store";
import { useStationWachtrij } from "@/hooks/use-station-wachtrij";
import { stationWerkfase } from "@/lib/station-werkfase";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const { skipped, skippedReasons, addSkip, removeSkip, isSkipped, skipsGeladen, skipsFout } = useSkippedCategories(id);
  const [gegevensOpen, setGegevensOpen] = useState(false);
  const scrollNaarDocumenten = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [barH, setBarH] = useState(0);
  const wachtrij = useStationWachtrij(id);
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

  // Afgekeurde foto's tellen als eerdere context (herindiening is geen nieuw station); prefix ["fotos", id] houdt invalidaties gelijk.
  const { data: afgekeurd, isError: afgekeurdFout } = useQuery({
    queryKey: ["fotos", id, "afgekeurd-aantal"],
    queryFn: async () => {
      const { count, error } = await supabase.from("fotos").select("id", { count: "exact", head: true }).eq("station_id", id!).eq("review_status", "rejected");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: fotos, isError: fotosFout, refetch: refetchFotos } = useQuery({
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
      // Documenten staan in de ingeklapte Casegegevens: eerst openen, scrollen pas na zichtbaarheid.
      scrollNaarDocumenten.current = true;
      setGegevensOpen(true);
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

  const vergrendeld = station?.status === 'opgeleverd' || station?.status === 'goedgekeurd';
  const bewarenAantal = Object.values(bewaren).reduce((a, b) => a + b, 0);

  const werkfase = useMemo(() => stationWerkfase({
    status: station?.status ?? null,
    submittedAt: station?.submitted_at ?? null,
    reviewReden: station?.review_reden ?? null,
    categorieen: applicableCategories,
    fotosPerCategorie: fotos ? Object.fromEntries(applicableCategories.map((c) => [c.name, fotosByCategorie(c.name).length])) : null,
    overgeslagen: skipsGeladen ? new Set(skipped) : null,
    afgekeurd: afgekeurdFout ? null : (afgekeurd ?? null),
    lokaal: wachtrij.samenvatting ? wachtrij.samenvatting.totaal : null,
    bewaren: bewarenAantal,
    leesFout: fotosFout || skipsFout,
  }), [station, applicableCategories, fotos, fotosByCategorie, skipsGeladen, skipped, afgekeurd, afgekeurdFout, wachtrij.samenvatting, bewarenAantal, fotosFout, skipsFout]);

  useCompacteBeheer(!!station);

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

  useEffect(() => {
    if (!gegevensOpen || !scrollNaarDocumenten.current) return;
    const f = requestAnimationFrame(() => {
      if (!documentenRef.current) return;
      scrollNaarDocumenten.current = false;
      documentenRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(f);
  }, [gegevensOpen, station]);

  const toonBar = !!station && !wizardOpen && werkfase.soort !== "laden" && werkfase.soort !== "leesfout";
  useEffect(() => {
    const el = barRef.current;
    if (!toonBar || !el) { setBarH(0); return; }
    const meet = () => setBarH(el.getBoundingClientRect().height);
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, [toonBar, werkfase.soort]);

  if (isLoading) return <PaginaLader label="Station laden…" />;

  if (!station) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">Station niet gevonden</div>;
  }

  const og = station.opdrachtgever ?? 'de opdrachtgever';
  const alleFotosBekijken = () => {
    if (!fotos || fotos.length === 0) { toast.info("Geen foto's"); return; }
    setLightboxSlides(fotos.map((f) => ({ src: f.url })));
    setLightboxIndex(0);
    setLightboxOpen(true);
  };
  const toonDocumenten = () => {
    if (gegevensOpen) documentenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else { scrollNaarDocumenten.current = true; setGegevensOpen(true); }
  };
  const wijzig = async () => { if (vergrendeld && !(await requirePin("Dossier is opgeleverd", "Voer de toegangscode in om te wijzigen."))) return; setEditOpen(true); };

  const beoordeelbaar = station.status === 'opgeleverd' && station.uitvoerder === 'terrevolt';
  const actie: { label: string; hint?: string; icoon: string; doe: () => void } | null =
    werkfase.soort === "nieuw" ? { label: "Start fotowerk", hint: `Eerst: ${werkfase.volgende.name}`, icoon: "photo_camera", doe: () => openWizardAt(werkfase.volgende as MergedCategory) }
    : werkfase.soort === "bezig" ? { label: "Verder met fotowerk", hint: `Volgende: ${werkfase.volgende.name}`, icoon: "arrow_forward", doe: () => openWizardAt(werkfase.volgende as MergedCategory) }
    : werkfase.soort === "ingevuld" ? { label: "Opleveren", hint: "Controleer en lever het fotodossier op.", icoon: "arrow_forward", doe: () => navigate(opleverUrl(station)) }
    : werkfase.soort === "opgeleverd" ? (beoordeelbaar
        ? { label: "Dossier beoordelen", hint: "Wijzigen kan alleen met de toegangscode.", icoon: "fact_check", doe: () => navigate(beoordeelUrl(station)) }
        : { label: "Foto's bekijken", hint: "Wijzigen kan alleen met de toegangscode.", icoon: "photo_library", doe: alleFotosBekijken })
    : werkfase.soort === "goedgekeurd" ? { label: "Foto's bekijken", hint: "Wijzigen kan alleen met de toegangscode.", icoon: "photo_library", doe: alleFotosBekijken }
    : null;

  const aantalFotos = fotos?.length ?? 0;
  const metFoto = applicableCategories.filter(c => fotosByCategorie(c.name).length > 0).length;
  const nvt = applicableCategories.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name)).length;
  const fotosTekst = (n: number) => `${n} foto${n === 1 ? "" : "'s"}`;
  const casenaamAnders = !!station.casenaam?.trim() && station.casenaam.trim().toLowerCase() !== station.naam_msr.trim().toLowerCase();
  const ids = [station.casenummer?.trim() && `Case ${station.casenummer.trim()}`, station.behuizingsnummer?.trim() && `Behuizing ${station.behuizingsnummer.trim()}`].filter(Boolean) as string[];
  const q = wachtrij.samenvatting;
  const nogTeVersturen = q ? q.open - q.fout : 0;

  const voortgang = (() => {
    switch (werkfase.soort) {
      case "laden": return { titel: "Fotostatus laden…", sub: null as string | null, deel: null as number | null };
      case "leesfout": return { titel: "Fotostatus kon niet worden gelezen", sub: "Er wordt geen voortgang getoond tot de gegevens geladen zijn.", deel: null };
      case "nieuw": return { titel: `Nog niet gestart · 0 van ${werkfase.totaal} onderdelen`, sub: null, deel: 0 };
      case "bezig": return { titel: `${werkfase.ingevuld} van ${werkfase.totaal} onderdelen ingevuld`, sub: null, deel: werkfase.ingevuld / werkfase.totaal };
      case "ingevuld": return { titel: "Fotochecklist ingevuld", sub: `Nog niet opgeleverd · ${fotosTekst(werkfase.fotos)}`, deel: null };
      case "opgeleverd": return { titel: `Opgeleverd aan ${og}`, sub: `Wacht op beoordeling · ${fotosTekst(aantalFotos)}`, deel: null };
      case "goedgekeurd": return { titel: `Goedgekeurd door ${og}`, sub: fotosTekst(aantalFotos), deel: null };
    }
  })();

  const meerItem = "min-h-[48px] text-[16px] gap-3";
  const rij = (label: string, waarde: ReactNode) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", padding: "10px 0", borderTop: `1px solid ${T.hairline}` }}>
      <dt style={{ minWidth: 120, fontSize: 15, color: T.subOnBg }}>{label}</dt>
      <dd style={{ flex: "1 1 160px", fontSize: 16, color: T.rowText, overflowWrap: "anywhere" }}>{waarde}</dd>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
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

      <main className="px-3 max-w-3xl mx-auto animate-fade-up" style={{ paddingTop: "calc(6px + env(safe-area-inset-top))", paddingBottom: toonBar ? barH + 24 : 32 }}>
        <div className="px-2 pb-3">
          {/* 1. Navigatierij */}
          <nav aria-label="Stationnavigatie" className="-mx-2 flex flex-wrap items-center justify-between gap-x-1 gap-y-1 mb-2">
            <Pressable
              onClick={() => navigate('/')}
              aria-label="Terug naar stations"
              style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 2, color: T.green, fontSize: 17, fontWeight: 500, marginLeft: -10, padding: "0 10px" }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 21, width: 21, overflow: "hidden" }} aria-hidden>chevron_left</span>
              <span>Stations</span>
            </Pressable>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              <BeheerCompact />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex min-h-[44px] min-w-[44px] items-center gap-0.5 rounded-full px-2 text-[16px] font-semibold" style={{ color: T.green }} aria-label="Meer acties">
                    Meer<span className="material-symbols-rounded" style={{ fontSize: 22, width: 22, overflow: "hidden" }} aria-hidden>more_horiz</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 max-w-[calc(100vw-24px)]">
                  <DropdownMenuItem className={meerItem} onSelect={openPdf}><span className="material-symbols-rounded" aria-hidden>picture_as_pdf</span>PDF bekijken</DropdownMenuItem>
                  <DropdownMenuItem className={meerItem} onSelect={() => { setShareStation(station.naam_msr); setShareOpen(true); }}><span className="material-symbols-rounded" aria-hidden>ios_share</span>Delen</DropdownMenuItem>
                  <DropdownMenuItem className={meerItem} onSelect={() => void deelLink(korteUrl(station), [station.casenummer, station.casenaam].filter(Boolean).join(" ") || station.naam_msr, toast)}><span className="material-symbols-rounded" aria-hidden>link</span>Link kopiëren</DropdownMenuItem>
                  {vergrendeld && actie?.label !== "Foto's bekijken" && <DropdownMenuItem className={meerItem} onSelect={alleFotosBekijken}><span className="material-symbols-rounded" aria-hidden>photo_library</span>Foto's bekijken</DropdownMenuItem>}
                  {aantalFotos > 0 && <DropdownMenuItem className={meerItem} onSelect={() => void downloadZip()}><span className="material-symbols-rounded" aria-hidden>download</span>ZIP downloaden</DropdownMenuItem>}
                  <DropdownMenuItem className={meerItem} onSelect={toonDocumenten}><span className="material-symbols-rounded" aria-hidden>folder_open</span>Documenten</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className={meerItem} onSelect={() => void wijzig()}><span className="material-symbols-rounded" aria-hidden>edit</span>Wijzig station</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </nav>

          {/* 2. Titel + identifiers */}
          <h1 className="font-display leading-tight" style={{ overflowWrap: "anywhere", fontSize: 24, fontWeight: 600, color: T.titleOnBg }}>{station.naam_msr}</h1>
          {ids.length > 0 && <p style={{ marginTop: 4, fontSize: 15, color: T.subOnBg }}>{ids.map((x, i) => <span key={x}>{i > 0 && " · "}<span style={{ whiteSpace: "nowrap" }}>{x}</span></span>)}</p>}

          {/* 3. Casegegevens */}
          <Collapsible open={gegevensOpen} onOpenChange={setGegevensOpen} className="mt-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}>
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 text-left" style={{ minHeight: 48, fontSize: 16, fontWeight: 600, color: T.titleOnBg }}>
              Casegegevens
              <span className="material-symbols-rounded" aria-hidden style={{ fontSize: 22, color: T.green, transform: gegevensOpen ? "rotate(180deg)" : undefined }}>expand_more</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-3">
              <dl>
                {station.opdrachtgever && rij("Opdrachtgever", station.opdrachtgever)}
                {rij("Jaar", jaarVan(station))}
                {casenaamAnders && rij("Casenaam", station.casenaam)}
                {station.type_ruimte && rij("Type ruimte", station.type_ruimte)}
                {station.datum && rij("Datum", station.datum)}
                {station.ingevuld_door && rij("Ingevuld door", station.ingevuld_door)}
                {fotos && rij("Foto's", `${metFoto} met foto · ${nvt} N.v.t. · ${fotosTekst(aantalFotos)}`)}
              </dl>
              <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 4 }}><SharePointStatus station={station} deel="normaal" /></div>
              <div ref={documentenRef} style={{ scrollMarginTop: 16 }}><SharePointDocumenten stationId={station.id} /></div>
            </CollapsibleContent>
          </Collapsible>

          {/* Uitzonderingen blijven altijd zichtbaar */}
          <div className="mt-3">
            <OpleverStatus stationId={station.id} />
            <SharePointStatus station={station} deel="uitzondering" />
            {station.status === 'in uitvoering' && station.review_reden && (
              <div role="status" style={{ background: T.dangerBg, borderRadius: R.group, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: T.danger, fontWeight: 600, marginBottom: 3 }}>Afgekeurd door {og}</div>
                <div style={{ fontSize: 15, color: T.rowText, lineHeight: 1.4 }}>{station.review_reden}</div>
              </div>
            )}
            {wachtrij.leesFout && (
              <div role="alert" style={{ fontSize: 15, color: T.danger, fontWeight: 600, marginBottom: 8 }}>Fotowachtrij op dit toestel kan niet worden gelezen — controleer de opslag van dit apparaat.</div>
            )}
            {bewarenAantal > 0 && <div role="status" style={{ fontSize: 15, color: T.bodyOnBg, marginBottom: 8 }}>{fotosTekst(bewarenAantal)} worden bewaard op dit toestel…</div>}
            {q && q.fout > 0 && (
              <div role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 12px", marginBottom: 8 }}>
                <span style={{ fontSize: 15, color: T.danger, fontWeight: 600 }}>{fotosTekst(q.fout)} niet verstuurd</span>
                <Pressable onClick={() => { if (internetVereist()) void verstuur(); }} style={{ minHeight: 44, color: T.green, fontSize: 15, fontWeight: 600, padding: 0 }}>Versturen mislukt — opnieuw proberen</Pressable>
              </div>
            )}
            {nogTeVersturen > 0 && (
              <div role="status" style={{ fontSize: 15, color: T.upload, fontWeight: 600, marginBottom: 8 }}>
                {q!.bezig > 0 ? `Bezig met versturen · ${fotosTekst(nogTeVersturen)}` : `${fotosTekst(nogTeVersturen)} nog te versturen`}
              </div>
            )}
          </div>

          {/* 4. Voortgang */}
          <div className="mt-2" role="status" aria-live="polite">
            <div style={{ fontSize: 18, fontWeight: 600, color: werkfase.soort === "leesfout" ? T.danger : T.titleOnBg, lineHeight: 1.3 }}>{voortgang.titel}</div>
            {voortgang.sub && <div style={{ marginTop: 2, fontSize: 15, color: T.subOnBg }}>{voortgang.sub}</div>}
            {voortgang.deel !== null && (
              <div aria-hidden style={{ marginTop: 8, height: 6, borderRadius: 3, background: T.softBorder, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(voortgang.deel * 100)}%`, height: "100%", background: T.green }} />
              </div>
            )}
            {werkfase.soort === "leesfout" && (
              <Pressable onClick={() => { void refetchFotos(); void queryClient.invalidateQueries({ queryKey: ['categorie-skips', id] }); }} style={{ minHeight: 44, color: T.green, fontSize: 15, fontWeight: 600, padding: 0 }}>Opnieuw proberen</Pressable>
            )}
          </div>
        </div>

        {/* 5. Categorieën */}
        <div className="mb-4">
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
      </main>

      {/* ── Eén hoofdactie onderin ── */}
      {toonBar && actie && (
        <div ref={barRef} data-testid="hoofdactie-balk" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <GlassBar style={{ position: "relative" }}>
            <div className="max-w-3xl mx-auto" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {actie.hint && <div style={{ fontSize: 15, color: T.bodyOnBg, lineHeight: 1.35, overflowWrap: "anywhere" }}>{actie.hint}</div>}
              <Pressable
                onClick={actie.doe}
                style={{ width: "100%", minHeight: 52, background: T.green, color: T.surface, borderRadius: R.control, fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "8px 16px", whiteSpace: "normal", textAlign: "center" }}
              >
                {actie.label}<span className="material-symbols-rounded" style={{ fontSize: 20 }} aria-hidden>{actie.icoon}</span>
              </Pressable>
            </div>
          </GlassBar>
        </div>
      )}
      {/* Share bottom sheet */}
      {shareOpen && <ShareSheet stationNaam={shareStation} onClose={() => setShareOpen(false)} onZip={downloadZip} />}
    </div>
  );
}
