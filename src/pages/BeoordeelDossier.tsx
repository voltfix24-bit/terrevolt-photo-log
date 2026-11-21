import { BEHEER_NODIG, zorgVoorBeheer } from "@/lib/require-pin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sharepointStatusBijwerken } from "@/lib/station-service";
import { internetVereist } from "@/lib/internet";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBeoordelaar, setBeoordelaar } from "@/pages/Beoordelen";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  type BeoordeelFoto as Foto, type Eindcontrole, eindcontroleOk, geldigeSelectie, inFilter, isOpenAfkeur,
  rpcFoutTekst, sneltoetsToegestaan, volgendeNaBesluit,
} from "@/lib/beoordeling";

const D = {
  bg: "#DCE8D6", content: "#F4F8F2", panel: "rgba(220,232,214,0.55)", surface: "#FFFFFF",
  green: "#1F5C3A", title: "#0A2A18", body: "#3D4F42", sub: "#5E7A66", rowSub: "#7A857A",
  done: "#8FA893", warn: "#BA7517", danger: "#B3352C", hairline: "#E6EBE5",
};
const glass = { background: "rgba(220,232,214,0.7)", WebkitBackdropFilter: "saturate(180%) blur(30px)", backdropFilter: "saturate(180%) blur(30px)" } as const;
const REDENEN = ["Onscherp", "Verkeerd onderwerp", "Onvolledig", "Anders"];
const FOCUS = "focus-visible:outline focus-visible:outline-[2.5px] focus-visible:outline-offset-2 focus-visible:outline-[#1F5C3A]";

type RpcUitkomst = { ok: boolean; reden?: string; beoordeling_id?: string; versie?: number; station_status?: string; station_hersteld?: boolean; controle?: Eindcontrole; al_afgerond?: boolean };
type Laatste = { beoordelingId: string; fotoId: string; label: string; stationGewijzigd: boolean };

function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  return <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: size, color, lineHeight: 1 }}>{name}</span>;
}

function SidebarItem({ icon, label, count, color, active, onClick }: { icon: string; label: string; count: number; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={FOCUS} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, marginBottom: 2, border: "none", background: active ? D.surface : "transparent", textAlign: "left" }}>
      <Icon name={icon} color={color ?? D.sub} />
      <span style={{ flex: 1, fontSize: 13, color: active ? "#0A0A0A" : D.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span className="font-mono" style={{ fontSize: 12, color: color ?? D.rowSub }}>{count}</span>
    </button>
  );
}

function MetaRij({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ padding: "9px 12px", display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
      <span style={{ color: D.rowSub }}>{label}</span>
      <span style={{ color: valueColor ?? "#0A0A0A", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Melding({ titel, tekst, actie }: { titel: string; tekst?: string; actie?: { label: string; onClick: () => void } }) {
  return (
    <div role="status" style={{ padding: "48px 20px", textAlign: "center", color: D.body }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: D.title }}>{titel}</div>
      {tekst && <div style={{ fontSize: 13, color: D.sub, marginTop: 6, lineHeight: 1.5 }}>{tekst}</div>}
      {actie && <button onClick={actie.onClick} className={FOCUS} style={{ marginTop: 16, minHeight: 44, padding: "0 18px", borderRadius: 10, border: "none", background: D.green, color: "#fff", fontSize: 14 }}>{actie.label}</button>}
    </div>
  );
}

export default function BeoordeelDossier({ stationId }: { stationId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = stationId ?? params.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [filter, setFilterRaw] = useState<string>("pending");
  const [gekozenId, setGekozenId] = useState<string | null>(null);
  const [weergave, setWeergave] = useState<"inspectie" | "raster">("inspectie");
  const [rejectFor, setRejectFor] = useState<{ id: string; versie: number } | null>(null);
  const [afhandelFor, setAfhandelFor] = useState<{ id: string; versie: number } | null>(null);
  const [reden, setReden] = useState(REDENEN[0]);
  const [toelichting, setToelichting] = useState("");
  const [afhandelTekst, setAfhandelTekst] = useState("");
  const [afrondenOpen, setAfrondenOpen] = useState(false);
  const [groot, setGroot] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const bezigRef = useRef(false);
  const [laatste, setLaatste] = useState<Laatste | null>(null);
  const [beoordelaar, setBeoordelaarState] = useState(getBeoordelaar());
  const regioRef = useRef<HTMLDivElement>(null);

  const station = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      if (!id) throw new Error("Station ontbreekt");
      const { data, error } = await supabase.from("stations").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
  const fotosQ = useQuery({
    queryKey: ["review-fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fotos").select("*").eq("station_id", id!).order("categorie").order("volgorde").order("id");
      if (error) throw error;
      return (data ?? []) as unknown as Foto[];
    },
    enabled: !!id,
  });
  const notitiesQ = useQuery({
    queryKey: ["opmerkingen", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorie_opmerkingen").select("categorie, opmerking").eq("station_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
  const skipsQ = useQuery({
    queryKey: ["categorie-skips", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorie_skips").select("categorie, reden").eq("station_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
  const controleQ = useQuery({
    queryKey: ["dossier-eindcontrole", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dossier_eindcontrole", { _station_id: id! });
      if (error || !data) throw error ?? new Error("Eindcontrole onbekend");
      return data as unknown as Eindcontrole;
    },
    enabled: !!id,
  });

  const queries = [station, fotosQ, notitiesQ, skipsQ, controleQ];
  const laden = queries.some((q) => q.isLoading);
  const leesfout = queries.some((q) => q.isError);
  const dataBekend = !laden && !leesfout && queries.every((q) => q.data !== undefined);

  const photos = useMemo(() => fotosQ.data ?? [], [fotosQ.data]);
  const skips = useMemo(() => skipsQ.data ?? [], [skipsQ.data]);
  const notitieVan = (naam: string) => notitiesQ.data?.find((n) => n.categorie === naam)?.opmerking?.trim();
  const zichtbaar = useMemo(() => photos.filter((f) => inFilter(f, filter)), [photos, filter]);
  const selectedId = geldigeSelectie(zichtbaar, gekozenId);
  const selected = zichtbaar.find((f) => f.id === selectedId) ?? null;
  const selectedIndex = selected ? zichtbaar.indexOf(selected) : -1;
  const afgerond = station.data?.status === "goedgekeurd";
  const beoordeelbaar = dataBekend && station.data?.submitted_at != null && !afgerond;

  const setFilter = (f: string) => { setFilterRaw(f); setGekozenId(null); };

  const tellingen = {
    all: photos.length,
    approved: photos.filter((f) => f.review_status === "approved").length,
    pending: photos.filter((f) => f.review_status === "pending").length,
    rejected: photos.filter(isOpenAfkeur).length,
    historie: photos.filter((f) => f.review_status === "rejected" && f.afkeur_afgehandeld_op).length,
    nvt: skips.length,
  };
  const categorieen = useMemo(() => [...new Set(photos.map((f) => f.categorie))], [photos]);
  const perCategorie = useMemo(() => categorieen.map((naam) => ({ naam, items: zichtbaar.filter((f) => f.categorie === naam) })).filter((g) => g.items.length > 0), [categorieen, zichtbaar]);

  const ververs = useCallback(() => {
    for (const key of [["review-fotos", id], ["station", id], ["dossier-eindcontrole", id], ["stations"], ["dossiers"]]) void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, id]);

  /** Eén beslissing tegelijk: het slot gaat dicht vóór de (asynchrone) PIN-controle. */
  const metSlot = useCallback(async (label: string, werk: () => Promise<void>) => {
    if (bezigRef.current) return;
    bezigRef.current = true; setBezig(label);
    try {
      if (!internetVereist()) return;
      if (!await zorgVoorBeheer()) { toast.error(BEHEER_NODIG); return; }
      await werk();
    } catch {
      toast.error("Geen verbinding met de server. Er is niets gewijzigd; probeer het opnieuw.");
    } finally {
      bezigRef.current = false; setBezig(null);
    }
  }, []);

  const focusRegio = () => requestAnimationFrame(() => regioRef.current?.focus({ preventScroll: true }));

  const besluit = useCallback(async (foto: Foto, versie: number, soort: "approved" | "rejected" | "afgehandeld", tekst?: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("foto_beoordelen", { _foto_id: foto.id, _verwacht_versie: versie, _besluit: soort, _reden: tekst ?? null });
    const r = data as unknown as RpcUitkomst | null;
    if (error || !r?.ok || !r.beoordeling_id || r.versie == null) {
      setGekozenId(foto.id);
      toast.error(error?.code === "42501" ? `Niet opgeslagen. ${BEHEER_NODIG}` : error ? "Niet opgeslagen. Controleer de verbinding en probeer het opnieuw." : rpcFoutTekst(r?.reden));
      if (r?.reden) ververs();
      return false;
    }
    const nieuw: Foto = soort === "afgehandeld"
      ? { ...foto, review_versie: r.versie, afkeur_afgehandeld_op: new Date().toISOString(), afkeur_afgehandeld_toelichting: tekst ?? null }
      : { ...foto, review_status: soort, review_reden: soort === "rejected" ? tekst ?? null : null, review_versie: r.versie };
    setGekozenId(volgendeNaBesluit(zichtbaar, foto.id, nieuw, filter));
    queryClient.setQueryData<Foto[]>(["review-fotos", id], (oud) => oud?.map((f) => (f.id === foto.id ? nieuw : f)));
    setLaatste({ beoordelingId: r.beoordeling_id, fotoId: foto.id, label: soort === "approved" ? "goedkeuring" : soort === "rejected" ? "afkeuring" : "afhandeling", stationGewijzigd: soort === "rejected" });
    ververs();
    focusRegio();
    return true;
  }, [zichtbaar, filter, queryClient, id, ververs]);

  const keurGoed = useCallback(() => {
    const foto = selected;
    if (!foto || !beoordeelbaar || foto.review_status === "approved") return;
    const versie = foto.review_versie;
    void metSlot("approve", async () => { if (await besluit(foto, versie, "approved")) toast.success("Foto goedgekeurd"); });
  }, [selected, beoordeelbaar, metSlot, besluit]);

  const openAfkeuren = useCallback(() => {
    if (!selected || !beoordeelbaar || bezigRef.current || selected.review_status === "rejected") return;
    setRejectFor({ id: selected.id, versie: selected.review_versie });
  }, [selected, beoordeelbaar]);

  const bevestigAfkeuren = () => {
    const doel = rejectFor && photos.find((f) => f.id === rejectFor.id);
    if (!doel || !rejectFor || !id) return;
    const tekst = reden === "Anders" ? toelichting.trim() : `${reden}${toelichting.trim() ? ` — ${toelichting.trim()}` : ""}`;
    if (!tekst) return;
    void metSlot("reject", async () => {
      if (!await besluit(doel, rejectFor.versie, "rejected", tekst)) return;
      setRejectFor(null); setToelichting(""); setReden(REDENEN[0]);
      toast.success("Afgekeurd — de taak staat weer open bij de monteur");
      if (!await sharepointStatusBijwerken(id)) toast.error("Status in SharePoint is niet bijgewerkt — zie SharePoint-status bij het station");
    });
  };

  const bevestigAfhandelen = () => {
    const doel = afhandelFor && photos.find((f) => f.id === afhandelFor.id);
    const tekst = afhandelTekst.trim();
    if (!doel || !afhandelFor || !tekst) return;
    void metSlot("afhandelen", async () => {
      if (!await besluit(doel, afhandelFor.versie, "afgehandeld", tekst)) return;
      setAfhandelFor(null); setAfhandelTekst("");
      toast.success("Afkeur afgehandeld en vastgelegd in de historie");
    });
  };

  const herstel = () => {
    const l = laatste;
    if (!l || !id) return;
    void metSlot("undo", async () => {
      const { data, error } = await supabase.rpc("foto_beoordeling_herstellen", { _beoordeling_id: l.beoordelingId });
      const r = data as unknown as RpcUitkomst | null;
      if (error || !r?.ok) {
        toast.error(error?.code === "42501" ? `Niet hersteld. ${BEHEER_NODIG}` : error ? "Niet hersteld. Controleer de verbinding en probeer het opnieuw." : `Niet hersteld. ${rpcFoutTekst(r?.reden)}`);
        if (r?.reden === "gewijzigd" || r?.reden === "al_hersteld") setLaatste(null);
        ververs();
        return;
      }
      setLaatste(null);
      setFilterRaw("all"); setGekozenId(l.fotoId);
      ververs();
      toast.success(`Laatste ${l.label} hersteld`);
      if (l.stationGewijzigd && !r.station_hersteld) toast("Foto hersteld; de taak blijft heropend omdat er intussen iets anders is gewijzigd.");
      if (l.stationGewijzigd && r.station_hersteld && !await sharepointStatusBijwerken(id)) toast.error("Status in SharePoint is niet bijgewerkt — zie SharePoint-status bij het station");
      focusRegio();
    });
  };

  const afronden = () => {
    if (!id || !dataBekend || !eindcontroleOk(controleQ.data)) return;
    void metSlot("afronden", async () => {
      const { data, error } = await supabase.rpc("dossier_afronden", { _station_id: id });
      const r = data as unknown as RpcUitkomst | null;
      if (error || !r?.ok) {
        toast.error(error?.code === "42501" ? `Dossier niet afgerond. ${BEHEER_NODIG}` : error ? "Dossier niet afgerond. Controleer de verbinding en probeer het opnieuw." : "Dossier niet afgerond: de eindcontrole is intussen veranderd. Bekijk de punten hieronder.");
        ververs();
        return;
      }
      setAfrondenOpen(false); setLaatste(null);
      ververs();
      toast.success("Dossier afgerond en goedgekeurd");
      if (!r.al_afgerond && !await sharepointStatusBijwerken(id)) toast.error("Status in SharePoint is niet bijgewerkt — zie SharePoint-status bij het station");
    });
  };

  const openRapport = async () => {
    if (!internetVereist()) return;
    const { data, error } = await supabase.functions.invoke("oplever-rapport", { body: { station_id: id, actie: "rapport-url" } });
    const url = (data as { rapport_url?: string })?.rapport_url;
    if (error || !url) { toast.error("Rapport nog niet beschikbaar"); return; }
    if ((data as { pdf_status?: string })?.pdf_status === "bezig") toast("PDF-rapport wordt gemaakt, je ziet nu de eenvoudige versie");
    window.open(url, "_blank");
  };

  const dialoogOpen = !!rejectFor || !!afhandelFor || afrondenOpen || groot;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !sneltoetsToegestaan(event, regioRef.current, dialoogOpen)) return;
      const k = event.key;
      if (k === "a" || k === "A") { event.preventDefault(); keurGoed(); }
      else if (k === "x" || k === "X") { event.preventDefault(); openAfkeuren(); }
      else if (k === "ArrowRight" && zichtbaar[selectedIndex + 1]) { event.preventDefault(); setGekozenId(zichtbaar[selectedIndex + 1].id); }
      else if (k === "ArrowLeft" && selectedIndex > 0) { event.preventDefault(); setGekozenId(zichtbaar[selectedIndex - 1].id); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialoogOpen, keurGoed, openAfkeuren, zichtbaar, selectedIndex]);

  if (laden) return <PaginaLader label="Dossier laden…" />;
  if (leesfout || !station.data) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Melding titel="Dossier kon niet volledig worden geladen" tekst="Beoordelen en afronden zijn geblokkeerd tot alle gegevens bekend zijn." actie={{ label: "Opnieuw proberen", onClick: () => queries.forEach((q) => void q.refetch()) }} />
      </div>
    );
  }
  if (beoordelaar && station.data.opdrachtgever !== beoordelaar) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Melding titel={`Dit dossier is niet aan ${beoordelaar} opgeleverd.`} tekst={station.data.opdrachtgever ? `Opdrachtgever: ${station.data.opdrachtgever}` : undefined}
          actie={station.data.opdrachtgever ? { label: `Beoordelen als ${station.data.opdrachtgever}`, onClick: () => { setBeoordelaar(station.data.opdrachtgever!); setBeoordelaarState(station.data.opdrachtgever); } } : undefined} />
      </div>
    );
  }

  const controle = controleQ.data!;
  const kanAfronden = beoordeelbaar && eindcontroleOk(controle);
  const actiesUit = !beoordeelbaar || !!bezig;

  const statusLabel = (f: Foto) => f.review_status === "approved" ? { t: "Goedgekeurd", c: D.green } : f.review_status === "pending" ? { t: "Te beoordelen", c: D.warn } : f.afkeur_afgehandeld_op ? { t: "Afkeur afgehandeld (historie)", c: D.sub } : { t: "Afgekeurd — open", c: D.danger };

  const leeg = () => {
    if (filter === "pending" && tellingen.pending === 0) {
      return <Melding titel={photos.length === 0 ? "Dit dossier heeft geen foto's" : "Alle foto's zijn beoordeeld"}
        tekst={afgerond ? "Het dossier is afgerond." : kanAfronden ? "Controleer de eindcontrole en rond het dossier af." : "Bekijk de eindcontrole voor wat nog openstaat."}
        actie={afgerond ? undefined : { label: "Eindcontrole bekijken", onClick: () => setAfrondenOpen(true) }} />;
    }
    if (filter === "nvt") return null;
    return <Melding titel="Geen foto's in deze selectie" />;
  };

  const thumbs = (
    <div role="listbox" aria-label="Foto's in werklijst" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0 2px" }}>
      {zichtbaar.map((f, i) => (
        <button key={f.id} role="option" aria-selected={f.id === selectedId} aria-label={`Foto ${i + 1}: ${f.categorie}`} onClick={() => setGekozenId(f.id)} className={FOCUS}
          style={{ flexShrink: 0, width: 56, height: 42, borderRadius: 6, padding: 0, border: "none", overflow: "hidden", position: "relative", outline: f.id === selectedId ? `2.5px solid ${D.green}` : "none", outlineOffset: -1 }}>
          <LaadAfbeelding src={f.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} wrapperStyle={{ position: "absolute", inset: 0 }} />
        </button>
      ))}
    </div>
  );

  const acties = selected && (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {!beoordeelbaar && <div style={{ fontSize: 12, color: D.sub, textAlign: "center" }}>{afgerond ? "Dossier is afgerond; beoordelen is gesloten." : "Dit dossier is (nog) niet opgeleverd."}</div>}
      {isOpenAfkeur(selected) ? (
        <button onClick={() => setAfhandelFor({ id: selected.id, versie: selected.review_versie })} disabled={actiesUit} className={FOCUS}
          style={{ minHeight: 46, borderRadius: 10, border: "none", background: actiesUit ? D.done : D.green, color: "#fff", fontSize: 14 }}>Afkeur afhandelen…</button>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={keurGoed} disabled={actiesUit || selected.review_status === "approved"} className={FOCUS}
            style={{ flex: 1, minHeight: 46, background: actiesUit || selected.review_status === "approved" ? D.done : D.green, color: "#fff", borderRadius: 10, border: "none", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {bezig === "approve" ? <KnopLader label="Opslaan…" /> : null}Foto goedkeuren
          </button>
          <button onClick={openAfkeuren} disabled={actiesUit || selected.review_status === "rejected"} className={FOCUS}
            style={{ flex: 1, minHeight: 46, background: "rgba(179,53,44,0.1)", border: "0.5px solid rgba(179,53,44,0.25)", borderRadius: 10, color: D.danger, fontSize: 14, opacity: actiesUit || selected.review_status === "rejected" ? 0.5 : 1 }}>
            Foto afkeuren
          </button>
        </div>
      )}
      {!isMobile && <div className="font-mono" style={{ textAlign: "center", fontSize: 11, color: D.sub }}>A goedkeuren · X afkeuren · ← → bladeren</div>}
    </div>
  );

  const meta = selected && (
    <>
      <div style={{ background: D.surface, borderRadius: 10, overflow: "hidden", marginBottom: 11 }}>
        <MetaRij label="Status" value={statusLabel(selected).t} valueColor={statusLabel(selected).c} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Gemaakt" value={selected.created_at ? new Date(selected.created_at).toLocaleString("nl-NL") : "Onbekend"} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Monteur" value={station.data.ingevuld_door ?? "Onbekend"} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Locatie" value={selected.gps_afstand_m == null ? "Niet vastgelegd" : selected.gps_afstand_m <= 100 ? "Op station" : `${selected.gps_afstand_m} m afwijking`}
          valueColor={selected.gps_afstand_m == null ? D.rowSub : selected.gps_afstand_m <= 100 ? D.green : D.danger} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Scherpte" value={selected.scherpte ?? "Niet gemeten"} valueColor={selected.scherpte === "Laag" ? D.warn : selected.scherpte ? undefined : D.rowSub} />
      </div>
      {selected.review_status === "rejected" && selected.review_reden && (
        <div style={{ background: "rgba(179,53,44,0.08)", borderRadius: 10, padding: "11px 12px", marginBottom: 11 }}>
          <div style={{ fontSize: 11, color: D.danger, marginBottom: 4 }}>Afgekeurd</div>
          <div style={{ fontSize: 12, color: "#0A0A0A", lineHeight: 1.45 }}>{selected.review_reden}</div>
          {selected.afkeur_afgehandeld_toelichting && <div style={{ fontSize: 12, color: D.sub, marginTop: 6 }}>Afgehandeld: {selected.afkeur_afgehandeld_toelichting}</div>}
        </div>
      )}
      {notitieVan(selected.categorie) && <div style={{ background: "#FFF6DB", borderRadius: 8, padding: "9px 12px", marginBottom: 11, fontSize: 12, color: "#3D2E00", whiteSpace: "pre-wrap" }}>Notitie: {notitieVan(selected.categorie)}</div>}
    </>
  );

  const inspectie = selected ? (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, minHeight: 0, height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: D.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.categorie}</div>
            <div aria-live="polite" style={{ fontSize: 12, color: D.sub }}>Foto {selectedIndex + 1} van {zichtbaar.length} in deze lijst</div>
          </div>
          <button onClick={() => setGroot(true)} className={FOCUS} style={{ border: "none", background: "rgba(255,255,255,0.85)", borderRadius: 8, padding: "7px 11px", fontSize: 13, color: D.green, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <Icon name="zoom_in" size={18} color={D.green} /> Zoomen
          </button>
        </div>
        <button onClick={() => setGroot(true)} aria-label="Foto vergroten en zoomen" className={FOCUS}
          style={{ flex: 1, minHeight: isMobile ? "min(52vh, 420px)" : 320, borderRadius: 10, border: "none", padding: 0, background: "#0E1A12", overflow: "hidden", position: "relative", width: "100%" }}>
          <LaadAfbeelding key={selected.id} src={selected.url} alt={selected.categorie} style={{ width: "100%", height: "100%", objectFit: "contain" }} wrapperStyle={{ position: "absolute", inset: 0 }} />
        </button>
        {thumbs}
      </div>
      <div style={{ width: isMobile ? "100%" : 268, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        {meta}
        <div style={{ flex: 1 }} />
        <div style={isMobile ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 4, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", borderTop: "0.5px solid rgba(31,92,58,0.14)", ...glass } : undefined}>{acties}</div>
      </div>
    </div>
  ) : leeg();

  const raster = (
    <>
      {zichtbaar.length === 0 && leeg()}
      {filter === "nvt" && (skips.length === 0 ? <Melding titel="Geen taken als niet van toepassing gemarkeerd" /> : skips.map((skip) => (
        <div key={skip.categorie} style={{ background: D.surface, borderRadius: 8, padding: "11px 13px", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: D.title }}>{skip.categorie}</div>
          <div style={{ fontSize: 12, color: D.sub, marginTop: 2 }}>N.v.t. · {skip.reden}</div>
          {notitieVan(skip.categorie) && <div style={{ fontSize: 12, color: "#6B5200", marginTop: 6, whiteSpace: "pre-wrap" }}>Notitie: {notitieVan(skip.categorie)}</div>}
        </div>
      )))}
      {perCategorie.map((groep) => (
        <section key={groep.naam} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", marginBottom: 8 }}>{groep.naam.toUpperCase()} · {groep.items.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 11 }}>
            {groep.items.map((foto) => (
              <button key={foto.id} onClick={() => { setGekozenId(foto.id); setWeergave("inspectie"); }} className={FOCUS} aria-label={`${foto.categorie}: ${statusLabel(foto).t}`} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
                <div style={{ aspectRatio: "4/3", borderRadius: 8, position: "relative", overflow: "hidden", outline: foto.id === selectedId ? `2.5px solid ${D.green}` : "none", outlineOffset: -1 }}>
                  <LaadAfbeelding src={foto.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} wrapperStyle={{ position: "absolute", inset: 0 }} />
                  {foto.review_status !== "pending" && (
                    <div style={{ position: "absolute", top: 5, right: 5, width: 17, height: 17, borderRadius: 9, background: foto.review_status === "approved" ? D.green : foto.afkeur_afgehandeld_op ? D.sub : D.danger, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={foto.review_status === "approved" ? "check" : "close"} size={11} color="#fff" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );

  const filters: { key: string; icon: string; label: string; count: number; color?: string }[] = [
    { key: "pending", icon: "error", label: "Te beoordelen", count: tellingen.pending, color: D.warn },
    { key: "all", icon: "photo_library", label: "Alle foto's", count: tellingen.all },
    { key: "approved", icon: "check_circle", label: "Goedgekeurd", count: tellingen.approved, color: D.done },
    { key: "rejected", icon: "cancel", label: "Open afkeuren", count: tellingen.rejected, color: D.danger },
    { key: "historie", icon: "history", label: "Afgehandelde afkeuren", count: tellingen.historie },
    { key: "nvt", icon: "block", label: "Niet van toepassing", count: tellingen.nvt },
  ];
  const toonRaster = weergave === "raster" || filter === "nvt";

  const checks = [
    { ok: controle.station_status === "opgeleverd", tekst: controle.station_status === "opgeleverd" ? "Dossier is opgeleverd" : `Dossierstatus is "${controle.station_status}" — eerst opnieuw opleveren door de monteur` },
    { ok: controle.te_beoordelen === 0, tekst: controle.te_beoordelen === 0 ? "Geen foto's meer te beoordelen" : `${controle.te_beoordelen} foto('s) nog te beoordelen` },
    { ok: controle.open_afkeuren === 0, tekst: controle.open_afkeuren === 0 ? `Geen open afkeuren${controle.afgehandelde_afkeuren ? ` (${controle.afgehandelde_afkeuren} afgehandeld in historie)` : ""}` : `${controle.open_afkeuren} afkeur(en) nog niet afgehandeld` },
    { ok: controle.ontbrekend.length === 0, tekst: controle.ontbrekend.length === 0 ? "Alle vereiste onderdelen hebben een goedgekeurde foto of N.v.t." : `Ontbreekt: ${controle.ontbrekend.join(", ")}` },
  ];

  return (
    <div style={{ height: "100dvh", background: D.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ minHeight: 52, borderBottom: "0.5px solid rgba(31,92,58,0.14)", display: "flex", alignItems: "center", padding: "6px 12px", gap: 8, flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap", ...glass }}>
        <button onClick={() => navigate("/beoordelen")} aria-label="Terug naar dossiers" className={FOCUS} style={{ border: "none", background: "none", color: D.green, display: "flex", alignItems: "center", gap: 2, fontSize: 13, padding: "8px 4px" }}>
          <Icon name="chevron_left" size={20} color={D.green} /> Dossiers
        </button>
        <div style={{ flex: isMobile ? "1 1 calc(100% - 110px)" : 1, textAlign: isMobile ? "left" : "center", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: D.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station.data.naam_msr}</div>
          <div style={{ fontSize: 12, color: D.sub }}>{afgerond ? "Afgerond" : station.data.status === "opgeleverd" ? "In beoordeling" : station.data.status ?? ""} · opgeleverd {station.data.submitted_at ? new Date(station.data.submitted_at).toLocaleDateString("nl-NL") : "-"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : undefined, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {laatste && (
          <button onClick={herstel} disabled={!!bezig} className={FOCUS} style={{ padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.8)", border: "none", fontSize: 13, color: D.green, display: "flex", alignItems: "center", gap: 5 }}>
            {bezig === "undo" ? <KnopLader label="Herstellen…" /> : <Icon name="undo" size={16} color={D.green} />} Herstel {laatste.label}
          </button>
        )}
        <button onClick={() => void openRapport()} className={FOCUS} style={{ padding: "7px 11px", borderRadius: 8, background: "rgba(255,255,255,0.8)", border: "none", fontSize: 13, color: D.green }}>Rapport (PDF)</button>
        <button onClick={() => setAfrondenOpen(true)} disabled={afgerond} className={FOCUS}
          style={{ padding: "7px 13px", borderRadius: 8, border: "none", fontSize: 13, color: "#fff", background: afgerond ? D.done : kanAfronden ? D.green : D.warn }}>
          {afgerond ? "Dossier afgerond" : "Dossier afronden…"}
        </button>
        </div>
      </div>

      {isMobile && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 12px", flexShrink: 0, ...glass }}>
          {[...filters, { key: "__weergave", icon: "", label: toonRaster ? "Inspectie" : "Raster", count: -1 }].map((item) => (
            <button key={item.key} onClick={() => item.key === "__weergave" ? setWeergave(toonRaster ? "inspectie" : "raster") : setFilter(item.key)} aria-pressed={filter === item.key} className={FOCUS}
              style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 13px", fontSize: 13, background: filter === item.key ? D.green : "rgba(255,255,255,0.8)", color: filter === item.key ? "#fff" : D.body }}>
              {item.label}{item.count >= 0 ? ` ${item.count}` : ""}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {!isMobile && (
          <nav aria-label="Filters" style={{ width: 214, background: D.panel, borderRight: "0.5px solid rgba(31,92,58,0.12)", padding: "14px 10px", flexShrink: 0, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", padding: "0 8px 7px" }}>WEERGAVE</div>
            <SidebarItem icon="fullscreen" label="Inspectie" count={zichtbaar.length} active={!toonRaster} onClick={() => setWeergave("inspectie")} />
            <SidebarItem icon="grid_view" label="Raster" count={zichtbaar.length} active={weergave === "raster"} onClick={() => setWeergave("raster")} />
            <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", padding: "18px 8px 7px" }}>STATUS</div>
            {filters.map((item) => <SidebarItem key={item.key} icon={item.icon} label={item.label} count={item.count} color={item.color} active={filter === item.key} onClick={() => setFilter(item.key)} />)}
            <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", padding: "18px 8px 7px" }}>CATEGORIEËN</div>
            {categorieen.map((naam) => <SidebarItem key={naam} icon="photo" label={naam} count={photos.filter((f) => f.categorie === naam).length} active={filter === `cat:${naam}`} onClick={() => setFilter(`cat:${naam}`)} />)}
          </nav>
        )}
        <main style={{ flex: 1, background: D.content, padding: isMobile ? `12px 12px ${selected && !toonRaster ? 130 : 16}px` : "16px 18px", minWidth: 0, overflowY: "auto" }}>
          <div ref={regioRef} tabIndex={-1} data-testid="beoordeel-regio" aria-label="Fotobeoordeling" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1F5C3A] rounded-lg" style={{ height: toonRaster ? undefined : "100%", outlineOffset: 2 }}>
            {toonRaster ? raster : inspectie}
          </div>
        </main>
      </div>

      <Sheet open={Boolean(rejectFor)} onOpenChange={(open) => { if (!open && !bezig) setRejectFor(null); }}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Waarom keur je deze foto af?</SheetTitle>
            <SheetDescription>De monteur krijgt deze reden te zien en de taak gaat weer open.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            {REDENEN.map((optie) => (
              <button key={optie} onClick={() => setReden(optie)} aria-pressed={reden === optie} className={FOCUS}
                style={{ minHeight: 48, borderRadius: 12, border: "none", textAlign: "left", padding: "0 14px", fontSize: 15, background: reden === optie ? "rgba(31,92,58,0.1)" : "#F2F6F1", color: reden === optie ? D.green : D.body }}>{optie}</button>
            ))}
            <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} maxLength={400} placeholder={reden === "Anders" ? "Beschrijf wat er mis is" : "Toelichting (optioneel)"} rows={3}
              style={{ marginTop: 4, borderRadius: 12, background: "#F2F6F1", border: "none", padding: "12px 14px", fontSize: 16, outline: "none", resize: "none" }} />
            <button onClick={bevestigAfkeuren} disabled={!!bezig || (reden === "Anders" && !toelichting.trim())} className={FOCUS}
              style={{ marginTop: 6, minHeight: 52, borderRadius: 14, border: "none", background: bezig || (reden === "Anders" && !toelichting.trim()) ? D.done : D.danger, color: "#fff", fontSize: 16, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {bezig === "reject" && <KnopLader label="Opslaan…" />}Afkeuring opslaan
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(afhandelFor)} onOpenChange={(open) => { if (!open && !bezig) setAfhandelFor(null); }}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Afkeur afhandelen</SheetTitle>
            <SheetDescription>Leg vast waarom deze afkeur is opgelost, bijvoorbeeld "vervangen door nieuwe foto". De afkeur blijft zichtbaar in de historie.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            <textarea value={afhandelTekst} onChange={(e) => setAfhandelTekst(e.target.value)} maxLength={400} rows={3} placeholder="Toelichting (verplicht)" aria-label="Toelichting afhandeling"
              style={{ borderRadius: 12, background: "#F2F6F1", border: "none", padding: "12px 14px", fontSize: 16, outline: "none", resize: "none" }} />
            <button onClick={bevestigAfhandelen} disabled={!!bezig || !afhandelTekst.trim()} className={FOCUS}
              style={{ marginTop: 6, minHeight: 52, borderRadius: 14, border: "none", background: bezig || !afhandelTekst.trim() ? D.done : D.green, color: "#fff", fontSize: 16, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {bezig === "afhandelen" && <KnopLader label="Opslaan…" />}Afhandeling opslaan
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={afrondenOpen} onOpenChange={(open) => { if (!open && !bezig) setAfrondenOpen(false); if (open) void controleQ.refetch(); }}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Eindcontrole dossier</SheetTitle>
            <SheetDescription>Het dossier kan pas worden afgerond als alle punten in orde zijn. De server controleert dit opnieuw.</SheetDescription>
          </SheetHeader>
          {controleQ.isFetching ? <BlokLader label="Controle laden…" /> : (
            <ul className="mt-4 flex flex-col gap-2" aria-label="Eindcontrole">
              {checks.map((c) => (
                <li key={c.tekst} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: D.body }}>
                  <Icon name={c.ok ? "check_circle" : "error"} size={20} color={c.ok ? D.green : D.danger} />
                  <span>{c.tekst}</span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={afronden} disabled={!kanAfronden || controleQ.isFetching || controleQ.isError || !!bezig} className={FOCUS}
            style={{ marginTop: 16, width: "100%", minHeight: 52, borderRadius: 14, border: "none", background: !kanAfronden || controleQ.isFetching || bezig ? D.done : D.green, color: "#fff", fontSize: 16, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {bezig === "afronden" && <KnopLader label="Afronden…" />}Dossier afronden
          </button>
        </SheetContent>
      </Sheet>

      <Lightbox open={groot} close={() => { setGroot(false); focusRegio(); }} plugins={[Zoom]} zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }} slides={selected ? [{ src: selected.url, alt: selected.categorie }] : []} />
    </div>
  );
}
