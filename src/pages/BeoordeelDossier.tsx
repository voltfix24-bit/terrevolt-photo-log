import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBeoordelaar } from "@/pages/Beoordelen";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

const D = {
  bg: "#DCE8D6",
  content: "#F4F8F2",
  panel: "rgba(220,232,214,0.55)",
  surface: "#FFFFFF",
  green: "#1F5C3A",
  title: "#0A2A18",
  body: "#3D4F42",
  sub: "#5E7A66",
  rowSub: "#7A857A",
  done: "#8FA893",
  warn: "#BA7517",
  danger: "#B3352C",
  hairline: "#E6EBE5",
  thumb: "#C9D6C4",
};

const glass = {
  background: "rgba(220,232,214,0.7)",
  WebkitBackdropFilter: "saturate(180%) blur(30px)",
  backdropFilter: "saturate(180%) blur(30px)",
} as const;

const REDENEN = ["Onscherp", "Verkeerd onderwerp", "Onvolledig", "Anders"];

type Foto = {
  id: string;
  categorie: string;
  url: string;
  created_at: string | null;
  review_status: string;
  review_reden: string | null;
  gps_afstand_m: number | null;
  scherpte: string | null;
};

function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  return <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: size, color, lineHeight: 1 }}>{name}</span>;
}

function SidebarItem({ icon, label, count, color, active, onClick }: { icon: string; label: string; count: number; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        padding: "8px 10px", borderRadius: 8, marginBottom: 2, border: "none",
        background: active ? D.surface : "transparent", textAlign: "left",
      }}
    >
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

export default function BeoordeelDossier() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<string>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reden, setReden] = useState(REDENEN[0]);
  const [toelichting, setToelichting] = useState("");
  const [groot, setGroot] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const { data: station } = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: fotos } = useQuery({
    queryKey: ["review-fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fotos").select("*").eq("station_id", id!).order("categorie");
      if (error) throw error;
      return (data ?? []) as unknown as Foto[];
    },
    enabled: !!id,
  });

  const { data: skips } = useQuery({
    queryKey: ["categorie-skips", id],
    queryFn: async () => {
      const { data } = await supabase.from("categorie_skips").select("categorie, reden").eq("station_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  const photos = useMemo(() => fotos ?? [], [fotos]);

  const zichtbaar = useMemo(() => photos.filter((foto) => {
    if (filter === "all") return true;
    if (filter === "nvt") return false;
    if (filter.startsWith("cat:")) return foto.categorie === filter.slice(4);
    return foto.review_status === filter;
  }), [photos, filter]);

  useEffect(() => {
    if (!photos.length) return;
    if (selectedId && photos.some((foto) => foto.id === selectedId)) return;
    setSelectedId((photos.find((foto) => foto.review_status === "pending") ?? photos[0]).id);
  }, [photos, selectedId]);

  const selected = photos.find((foto) => foto.id === selectedId) ?? null;

  const tellingen = {
    all: photos.length,
    approved: photos.filter((foto) => foto.review_status === "approved").length,
    pending: photos.filter((foto) => foto.review_status === "pending").length,
    rejected: photos.filter((foto) => foto.review_status === "rejected").length,
    nvt: (skips ?? []).length,
  };

  const categorieen = useMemo(() => {
    const namen: string[] = [];
    for (const foto of photos) if (!namen.includes(foto.categorie)) namen.push(foto.categorie);
    return namen;
  }, [photos]);

  const perCategorie = useMemo(() => categorieen
    .map((naam) => ({ naam, items: zichtbaar.filter((foto) => foto.categorie === naam) }))
    .filter((groep) => groep.items.length > 0), [categorieen, zichtbaar]);

  const volgende = useCallback(() => {
    const index = zichtbaar.findIndex((foto) => foto.id === selectedId);
    const next = zichtbaar[index + 1] ?? photos.find((foto) => foto.review_status === "pending" && foto.id !== selectedId);
    if (next) setSelectedId(next.id);
  }, [zichtbaar, selectedId, photos]);

  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ["review-fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["station", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
  };

  const keurGoed = useCallback(async () => {
    if (!selected) return;
    await supabase.from("fotos").update({ review_status: "approved", review_reden: null, reviewed_at: new Date().toISOString() }).eq("id", selected.id);
    volgende();
    ververs();
  }, [selected, volgende]); // eslint-disable-line react-hooks/exhaustive-deps

  const bevestigAfkeuren = async () => {
    if (!rejectFor || !id) return;
    const tekst = reden === "Anders" ? (toelichting.trim() || "Anders") : `${reden}${toelichting.trim() ? ` — ${toelichting.trim()}` : ""}`;
    await supabase.from("fotos").update({ review_status: "rejected", review_reden: tekst, reviewed_at: new Date().toISOString() }).eq("id", rejectFor);
    await supabase.from("stations").update({ status: "in uitvoering", review_reden: tekst }).eq("id", id);
    setRejectFor(null);
    setToelichting("");
    setReden(REDENEN[0]);
    ververs();
    toast.success("Afgekeurd — de taak staat weer open bij de monteur");
  };

  const afronden = async () => {
    if (!id || tellingen.pending > 0) return;
    await supabase.from("stations").update({ status: "goedgekeurd", review_reden: null }).eq("id", id);
    ververs();
    toast.success("Dossier goedgekeurd en afgesloten");
  };

  const openRapport = async () => {
    const { data, error } = await supabase.functions.invoke("oplever-rapport", { body: { station_id: id, actie: "rapport-url" } });
    const url = (data as { rapport_url?: string })?.rapport_url;
    if (error || !url) { toast.error("Rapport nog niet beschikbaar"); return; }
    window.open(url, "_blank");
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || rejectFor) return;
      const index = zichtbaar.findIndex((foto) => foto.id === selectedId);
      if (event.key === "a" || event.key === "A") { event.preventDefault(); void keurGoed(); }
      if (event.key === "x" || event.key === "X") { event.preventDefault(); if (selectedId) setRejectFor(selectedId); }
      if (event.key === "ArrowRight" && zichtbaar[index + 1]) setSelectedId(zichtbaar[index + 1].id);
      if (event.key === "ArrowLeft" && zichtbaar[index - 1]) setSelectedId(zichtbaar[index - 1].id);
      if (event.key === " ") { event.preventDefault(); setGroot(true); }
      if (event.key === "Enter") { event.preventDefault(); void afronden(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zichtbaar, selectedId, keurGoed, rejectFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const beoordelaar = getBeoordelaar();
  if (station && beoordelaar && station.opdrachtgever !== beoordelaar) {
    return (
      <div style={{ minHeight: "100vh", background: D.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: D.body }}>
        Dit dossier is niet aan {beoordelaar} opgeleverd.
      </div>
    );
  }

  const inspector = selected && (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <button
        onClick={() => setGroot(true)}
        style={{ aspectRatio: "4/3", borderRadius: 10, border: "none", padding: 0, background: `${D.thumb} center/cover url(${selected.url})`, marginBottom: 13, width: "100%" }}
        aria-label="Groot bekijken"
      />
      <div style={{ fontSize: 15, fontWeight: 500, color: D.title }}>{selected.categorie}</div>
      <div style={{ fontSize: 12, color: D.sub, marginTop: 2, marginBottom: 13 }}>
        {selected.categorie} · foto {photos.filter((foto) => foto.categorie === selected.categorie).findIndex((foto) => foto.id === selected.id) + 1} van {photos.filter((foto) => foto.categorie === selected.categorie).length}
      </div>
      <div style={{ background: D.surface, borderRadius: 10, overflow: "hidden", marginBottom: 11 }}>
        <MetaRij label="Gemaakt" value={selected.created_at ? new Date(selected.created_at).toLocaleString("nl-NL") : "Onbekend"} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Monteur" value={station?.ingevuld_door ?? "Onbekend"} />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij
          label="Locatie"
          value={selected.gps_afstand_m == null ? "Niet vastgelegd" : selected.gps_afstand_m <= 100 ? "Op station" : `${selected.gps_afstand_m} m afwijking`}
          valueColor={selected.gps_afstand_m == null ? D.rowSub : selected.gps_afstand_m <= 100 ? D.green : D.danger}
        />
        <div style={{ height: "0.5px", background: D.hairline, marginLeft: 12 }} />
        <MetaRij label="Scherpte" value={selected.scherpte ?? "Niet gemeten"} valueColor={selected.scherpte === "Laag" ? D.warn : selected.scherpte ? undefined : D.rowSub} />
      </div>
      {selected.review_status === "rejected" && selected.review_reden && (
        <div style={{ background: "rgba(179,53,44,0.08)", borderRadius: 10, padding: "11px 12px", marginBottom: 11 }}>
          <div style={{ fontSize: 11, color: D.danger, marginBottom: 4 }}>Afgekeurd</div>
          <div style={{ fontSize: 12, color: "#0A0A0A", lineHeight: 1.45 }}>{selected.review_reden}</div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
        <button onClick={() => void keurGoed()} style={{ flex: 1, background: D.green, color: "#fff", borderRadius: 9, padding: 12, border: "none", fontSize: 13 }}>Keur goed</button>
        <button onClick={() => setRejectFor(selected.id)} aria-label="Afkeuren" style={{ width: 44, background: "rgba(179,53,44,0.1)", border: "0.5px solid rgba(179,53,44,0.25)", borderRadius: 9, padding: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" color={D.danger} />
        </button>
      </div>
      <div className="font-mono" style={{ textAlign: "center", fontSize: 11, color: D.sub }}>
        A goedkeuren · X afkeuren · ← → bladeren · spatie groot · enter afronden
      </div>
    </div>
  );

  const raster = (
    <>
      {perCategorie.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center", color: D.sub, fontSize: 14 }}>
          {filter === "nvt"
            ? (skips ?? []).length === 0 ? "Geen taken als niet van toepassing gemarkeerd" : ""
            : "Geen foto's in deze selectie"}
        </div>
      ) : null}
      {filter === "nvt" && (skips ?? []).map((skip) => (
        <div key={skip.categorie} style={{ background: D.surface, borderRadius: 8, padding: "11px 13px", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: D.title }}>{skip.categorie}</div>
          <div style={{ fontSize: 12, color: D.sub, marginTop: 2 }}>{skip.reden}</div>
        </div>
      ))}
      {perCategorie.map((groep) => (
        <section key={groep.naam} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", marginBottom: 8 }}>
            {groep.naam.toUpperCase()} · {groep.items.length}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 11 }}>
            {groep.items.map((foto) => (
              <button
                key={foto.id}
                onClick={() => { setSelectedId(foto.id); if (isMobile) setInspectorOpen(true); }}
                style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}
              >
                <div style={{
                  aspectRatio: "4/3", borderRadius: 8, position: "relative",
                  background: `${D.thumb} center/cover url(${foto.url})`,
                  outline: foto.id === selectedId ? `2.5px solid ${D.green}` : "none",
                  outlineOffset: -1,
                }}>
                  {foto.review_status === "rejected" && (
                    <div style={{ position: "absolute", top: 5, right: 5, width: 17, height: 17, borderRadius: 9, background: D.danger, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="close" size={11} color="#fff" />
                    </div>
                  )}
                  {foto.review_status === "approved" && (
                    <div style={{ position: "absolute", top: 5, right: 5, width: 17, height: 17, borderRadius: 9, background: D.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="check" size={11} color="#fff" />
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: D.body, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{foto.categorie}</div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );

  const filters: { key: string; icon: string; label: string; count: number; color?: string }[] = [
    { key: "all", icon: "photo_library", label: "Alle foto's", count: tellingen.all },
    { key: "approved", icon: "check_circle", label: "Goedgekeurd", count: tellingen.approved, color: D.done },
    { key: "pending", icon: "error", label: "Te beoordelen", count: tellingen.pending, color: D.warn },
    { key: "rejected", icon: "cancel", label: "Afgekeurd", count: tellingen.rejected, color: D.danger },
    { key: "nvt", icon: "block", label: "Niet van toepassing", count: tellingen.nvt },
  ];

  return (
    <div style={{ height: "100vh", background: D.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ minHeight: 52, borderBottom: "0.5px solid rgba(31,92,58,0.14)", display: "flex", alignItems: "center", padding: "0 12px", gap: 10, flexShrink: 0, ...glass }}>
        <button onClick={() => navigate("/beoordelen")} aria-label="Terug" style={{ border: "none", background: "none", color: D.green, display: "flex", alignItems: "center", gap: 2, fontSize: 13, padding: "8px 4px" }}>
          <Icon name="chevron_left" size={20} color={D.green} /> Dossiers
        </button>
        <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: D.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station?.naam_msr ?? ""}</div>
          <div style={{ fontSize: 12, color: D.sub }}>
            TerreVolt BV · opgeleverd {station?.submitted_at ? new Date(station.submitted_at).toLocaleDateString("nl-NL") : "-"}
          </div>
        </div>
        <button onClick={() => void openRapport()} style={{ padding: "7px 13px", borderRadius: 8, background: "rgba(255,255,255,0.8)", border: "none", fontSize: 13, color: D.green }}>Rapport</button>
        <button
          onClick={() => void afronden()}
          disabled={tellingen.pending > 0 || station?.status === "goedgekeurd"}
          style={{ padding: "7px 13px", borderRadius: 8, border: "none", fontSize: 13, color: "#fff", background: tellingen.pending > 0 || station?.status === "goedgekeurd" ? D.done : D.green }}
        >
          {station?.status === "goedgekeurd" ? "Goedgekeurd" : "Goedkeuren"}
        </button>
      </div>

      {isMobile && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 12px", flexShrink: 0, ...glass }}>
          {filters.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              style={{
                flexShrink: 0, border: "none", borderRadius: 999, padding: "8px 13px", fontSize: 13,
                background: filter === item.key ? D.green : "rgba(255,255,255,0.8)",
                color: filter === item.key ? "#fff" : D.body,
              }}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {!isMobile && (
          <nav style={{ width: 214, background: D.panel, borderRight: "0.5px solid rgba(31,92,58,0.12)", padding: "14px 10px", flexShrink: 0, overflowY: "auto" }}>
            <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", padding: "0 8px 7px" }}>STATUS</div>
            {filters.map((item) => (
              <SidebarItem key={item.key} icon={item.icon} label={item.label} count={item.count} color={item.color} active={filter === item.key} onClick={() => setFilter(item.key)} />
            ))}
            <div style={{ fontSize: 11, color: D.sub, letterSpacing: "0.05em", padding: "18px 8px 7px" }}>CATEGORIEËN</div>
            {categorieen.map((naam) => (
              <SidebarItem
                key={naam}
                icon="photo"
                label={naam}
                count={photos.filter((foto) => foto.categorie === naam).length}
                active={filter === `cat:${naam}`}
                onClick={() => setFilter(`cat:${naam}`)}
              />
            ))}
          </nav>
        )}

        <main style={{ flex: 1, background: D.content, padding: "16px 18px", minWidth: 0, overflowY: "auto" }}>{raster}</main>

        {!isMobile && selected && (
          <aside style={{ width: 268, background: D.panel, borderLeft: "0.5px solid rgba(31,92,58,0.12)", padding: "16px 15px", flexShrink: 0, overflowY: "auto" }}>
            {inspector}
          </aside>
        )}
      </div>

      {isMobile && (
        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[20px] border-0 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5" style={{ background: D.bg }}>
            <SheetHeader className="sr-only">
              <SheetTitle>Foto beoordelen</SheetTitle>
              <SheetDescription>Bekijk de gegevens en keur de foto goed of af.</SheetDescription>
            </SheetHeader>
            {inspector}
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={Boolean(rejectFor)} onOpenChange={(open) => !open && setRejectFor(null)}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Waarom keur je deze foto af?</SheetTitle>
            <SheetDescription>De monteur krijgt deze reden te zien en de taak gaat weer open.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            {REDENEN.map((optie) => (
              <button
                key={optie}
                onClick={() => setReden(optie)}
                style={{
                  minHeight: 48, borderRadius: 12, border: "none", textAlign: "left", padding: "0 14px", fontSize: 15,
                  background: reden === optie ? "rgba(31,92,58,0.1)" : "#F2F6F1",
                  color: reden === optie ? D.green : D.body,
                }}
              >
                {optie}
              </button>
            ))}
            <textarea
              value={toelichting}
              onChange={(event) => setToelichting(event.target.value)}
              placeholder={reden === "Anders" ? "Beschrijf wat er mis is" : "Toelichting (optioneel)"}
              rows={3}
              style={{ marginTop: 4, borderRadius: 12, background: "#F2F6F1", border: "none", padding: "12px 14px", fontSize: 15, outline: "none", resize: "none" }}
            />
            <button
              onClick={() => void bevestigAfkeuren()}
              disabled={reden === "Anders" && !toelichting.trim()}
              style={{ marginTop: 6, minHeight: 52, borderRadius: 14, border: "none", background: reden === "Anders" && !toelichting.trim() ? D.done : D.danger, color: "#fff", fontSize: 16, fontWeight: 500 }}
            >
              Afkeuren
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Lightbox open={groot} close={() => setGroot(false)} slides={selected ? [{ src: selected.url }] : []} />
    </div>
  );
}
