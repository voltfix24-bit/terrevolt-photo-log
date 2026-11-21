import { useEffect, useMemo, useState } from "react";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getQueueCountVoor, QUEUE_EVENT } from "@/lib/offline-queue";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlassBar, Group, Hairline, NavText, PrimaryButton, Row, T, INSET_ROW, ROW_PAD_X } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { internetVereist } from "@/lib/internet";
import { aantalLokaleNotities, heeftBeheerGeblokkeerdeNotities, verstuurNotities, verstuurNotitiesNaBeheer } from "@/lib/notities";
import { zorgVoorBeheer } from "@/lib/require-pin";
import { opleverGereedheid, type Lezing } from "@/lib/oplever-gereedheid";

export default function Opleveren({ stationId }: { stationId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = stationId ?? params.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState<number | null | "fout">(null);
  const [nvtOpen, setNvtOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [versturen, setVersturen] = useState(false);
  const [gekozen, setGekozen] = useState<string | null>(null);

  const stationQ = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      if (!id) throw new Error("Station ontbreekt");
      const { data, error } = await supabase.from("stations").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
  const station = stationQ.data;

  const fotosQ = useQuery({
    queryKey: ["fotos", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase.from("fotos").select("id").eq("station_id", id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
  const fotos = fotosQ.data;

  const skipsQ = useQuery({
    queryKey: ["categorie-skips", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase.from("categorie_skips").select("categorie, reden").eq("station_id", id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });
  const skips = skipsQ.data;

  const ogQ = useQuery({
    queryKey: ["opdrachtgevers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opdrachtgevers").select("id, naam").order("naam");
      if (error) throw error;
      return data ?? [];
    },
  });
  const opdrachtgevers = ogQ.data;

  useEffect(() => {
    let mounted = true;
    const tel = async () => {
      try { const n = await getQueueCountVoor(id); if (mounted) setQueued(n); } catch { if (mounted) setQueued("fout"); }
    };
    void tel();
    window.addEventListener(QUEUE_EVENT, tel);
    return () => { mounted = false; window.removeEventListener(QUEUE_EVENT, tel); };
  }, [id]);

  const nvt = skips ?? [];
  const client = useMemo(
    () => gekozen ?? station?.opdrachtgever ?? opdrachtgevers?.[0]?.naam ?? "de opdrachtgever",
    [gekozen, station?.opdrachtgever, opdrachtgevers],
  );
  const monteur = station?.ingevuld_door || "Onbekend";
  const lezing = (q: { isError: boolean; data: unknown }): Lezing => (q.isError ? "fout" : q.data === undefined ? "laden" : "ok");
  const ogLezing: Lezing = station?.opdrachtgever || gekozen ? "ok" : lezing(ogQ);
  const status = opleverGereedheid({ fotos: lezing(fotosQ), skips: lezing(skipsQ), wachtrij: queued, opdrachtgever: ogLezing });
  const gereed = status.kan;
  const opnieuwLezen = () => {
    void fotosQ.refetch(); void skipsQ.refetch(); void ogQ.refetch();
    getQueueCountVoor(id).then(setQueued, () => setQueued("fout"));
  };

  const versturenClick = async () => {
    if (!internetVereist()) return;
    if (!gereed || !id || versturen) return;
    setVersturen(true);
    try {
    await verstuurNotities();
    if (heeftBeheerGeblokkeerdeNotities(id)) {
      toast.error("Notities blijven lokaal bewaard — beheer vergrendeld of verlopen", {
        action: { label: "Beheer ontgrendelen", onClick: async () => {
          if (!await zorgVoorBeheer("Notities versturen")) return;
          try { await verstuurNotitiesNaBeheer(); }
          catch { toast.error("Notities blijven lokaal bewaard — probeer opnieuw"); }
        } },
      });
      return;
    }
    if ((await getQueueCountVoor(id)) > 0 || aantalLokaleNotities(id) > 0) {
      toast.error("Nog niet alles verstuurd — wacht tot foto's en notities zijn gesynchroniseerd.");
      return;
    }
    const { data, error } = await supabase.functions.invoke("oplever-rapport", {
      body: { station_id: id, opdrachtgever: client, submitted_by: monteur },
    });
    setVersturen(false);
    if (error || (data as { ok?: boolean } | null)?.ok !== true) {
      toast.error("Opleveren mislukt. Probeer het opnieuw.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    queryClient.invalidateQueries({ queryKey: ["station", id] });
    queryClient.invalidateQueries({ queryKey: ["opleverketen", id] });
    // Niet "alles gelukt": rapport en SharePoint lopen nog; de stationspagina toont de voortgang
    toast.success("Dossier ingediend", { description: "Rapport wordt gemaakt, SharePoint wordt bijgewerkt. Volg de voortgang op de stationspagina." });
    navigate("/", { replace: true });
    } catch { toast.error("Opleveren mislukt. Probeer het opnieuw."); }
    finally { setVersturen(false); }
  };

  if (stationQ.isError && !station) {
    return (
      <div role="alert" style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", color: T.titleOnBg, fontSize: 16 }}>
        Station kon niet worden geladen.
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" onClick={() => navigate(-1)} style={{ minHeight: 48, padding: "0 18px", borderRadius: 12, border: `1px solid ${T.hairline}`, background: T.surface, color: T.green, fontWeight: 600 }}>Terug</button>
          <button type="button" onClick={() => void stationQ.refetch()} style={{ minHeight: 48, padding: "0 18px", borderRadius: 12, border: 0, background: T.green, color: T.surface, fontWeight: 600 }}>Opnieuw laden</button>
        </div>
      </div>
    );
  }
  if (!station) {
    return <PaginaLader label="Laden…" />;
  }
  const fotoTekst = fotosQ.isError ? "Kon niet laden" : fotos ? String(fotos.length) : "…";
  const leesFout = fotosQ.isError || skipsQ.isError || queued === "fout" || ogLezing === "fout";

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>
      <GlassBar position="top">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <NavText onClick={() => navigate(-1)}>Annuleer</NavText>
          <span className="font-display" style={{ fontSize: 17, fontWeight: 500, color: T.titleOnBg }}>Opleveren</span>
          <span style={{ width: 58 }} />
        </div>
      </GlassBar>

      <div style={{ flex: 1 }}>
        <div style={{ padding: "26px 20px 20px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <span className="material-symbols-rounded" style={{ fontSize: 34, color: T.surface }}>send</span>
          </div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 500, color: T.titleOnBg, marginTop: 15, letterSpacing: "-0.4px", lineHeight: 1.2, overflowWrap: "anywhere" }}>
            {station.naam_msr} opleveren
          </h1>
          <p style={{ fontSize: 16, color: T.bodyOnBg, marginTop: 8, lineHeight: 1.5 }}>
            Na opleveren gaat het dossier naar de opdrachtgever en kun je niets meer wijzigen.
          </p>
        </div>

        <div style={{ padding: "0 12px" }}>
          <Group>
            <Row icon="photo_camera" title="Foto's" chevron={false} trailing={<span className="font-mono" style={{ fontSize: 17, color: fotosQ.isError ? T.danger : T.rowSub }}>{fotoTekst}</span>} />
            {nvt.length > 0 && (
              <>
                <Hairline inset={INSET_ROW} />
                <Row icon="block" title="Niet van toepassing" onClick={() => setNvtOpen(true)} trailing={<span className="font-mono" style={{ fontSize: 17, color: T.rowSub }}>{nvt.length}</span>} />
              </>
            )}
            <Hairline inset={INSET_ROW} />
            {queued === "fout" ? (
              <Row icon="error" iconColor={T.danger} title={<span style={{ color: T.danger }}>Wachtrij op dit toestel onbekend</span>} chevron={false} />
            ) : queued === null ? (
              <Row icon="cloud_sync" title="Wachtrij controleren…" chevron={false} />
            ) : queued === 0 ? (
              <Row icon="cloud_done" title="Alles geüpload" chevron={false} trailing={<span className="material-symbols-rounded" style={{ fontSize: 20, color: T.done }}>check</span>} />
            ) : (
              <Row icon="cloud_upload" iconColor={T.upload} title={<span style={{ color: T.upload }}>{queued} foto&apos;s wachten op upload</span>} chevron={false} />
            )}
          </Group>

          <Group>
            <Row icon="person" title="Opgeleverd door" chevron={false} trailing={<span style={{ fontSize: 17, color: T.rowSub }}>{monteur}</span>} />
            <Hairline inset={INSET_ROW} />
            <Row
              icon="apartment"
              title="Naar"
              onClick={(opdrachtgevers?.length ?? 0) > 1 ? () => setClientOpen(true) : undefined}
              chevron={(opdrachtgevers?.length ?? 0) > 1}
              trailing={<span style={{ fontSize: 17, color: T.rowSub }}>{client}</span>}
            />
          </Group>

          {leesFout && (
            <div role="alert" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "0 0 16px", padding: "10px 14px", borderRadius: 14, background: T.surface, border: `1px solid ${T.hairline}`, color: T.titleOnBg, fontSize: 15 }}>
              {status.reden}
              <button type="button" onClick={opnieuwLezen} style={{ minHeight: 44, padding: "0 12px", border: 0, background: "none", color: T.green, fontSize: 16, fontWeight: 600 }}>Opnieuw laden</button>
            </div>
          )}
          {nvt.length > 0 && (
            <div style={{ padding: "0 5px 20px", fontSize: 14, color: T.subOnBg, lineHeight: 1.5 }}>
              {nvt.length === 1 ? "Eén taak is" : `${nvt.length} taken zijn`} als niet van toepassing gemarkeerd. De opgegeven reden komt in het rapport te staan.
            </div>
          )}
        </div>
      </div>

      <GlassBar>
        <PrimaryButton
          onClick={versturenClick}
          disabled={!gereed || versturen}
          caption={gereed ? `Je krijgt bericht zodra ${client} heeft beoordeeld` : status.reden ?? undefined}
        >
          {versturen ? <><KnopLader />Versturen</> : <>Oplevering versturen<span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span></>}
        </PrimaryButton>
      </GlassBar>

      <Sheet open={nvtOpen} onOpenChange={setNvtOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Niet van toepassing</SheetTitle>
            <SheetDescription>Deze taken worden met reden in het rapport opgenomen.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {nvt.map((item, index) => (
              <div key={item.categorie}>
                {index > 0 && <Hairline inset={ROW_PAD_X} />}
                <div style={{ padding: "12px 0" }}>
                  <div style={{ fontSize: 17, color: T.rowText }}>{item.categorie}</div>
                  <div style={{ marginTop: 2, fontSize: 14, color: T.rowSub }}>{item.reden}</div>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={clientOpen} onOpenChange={setClientOpen}>
        <SheetContent side="bottom" className="rounded-t-[20px] border-0 bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6">
          <SheetHeader className="pr-7 text-left">
            <SheetTitle>Naar welke opdrachtgever?</SheetTitle>
            <SheetDescription>Het dossier wordt alleen aan deze opdrachtgever getoond.</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {(opdrachtgevers ?? []).map((item, index) => (
              <div key={item.id}>
                {index > 0 && <Hairline inset={ROW_PAD_X} />}
                <Row
                  title={item.naam}
                  chevron={false}
                  onClick={() => { setGekozen(item.naam); setClientOpen(false); }}
                  trailing={item.naam === client ? <span className="material-symbols-rounded" style={{ fontSize: 20, color: T.green }}>check</span> : null}
                />
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
