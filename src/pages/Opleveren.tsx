import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPendingPhotos } from "@/lib/offline-queue";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlassBar, Group, Hairline, NavText, PrimaryButton, Row, T, INSET_ROW, ROW_PAD_X } from "@/components/apple/Primitives";
import { toast } from "sonner";

export default function Opleveren() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState(0);
  const [nvtOpen, setNvtOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [versturen, setVersturen] = useState(false);
  const [gekozen, setGekozen] = useState<string | null>(null);

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
    queryKey: ["fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("fotos").select("id").eq("station_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: skips } = useQuery({
    queryKey: ["categorie-skips", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("categorie_skips").select("categorie, reden").eq("station_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: opdrachtgevers } = useQuery({
    queryKey: ["opdrachtgevers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opdrachtgevers").select("id, naam").order("naam");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    let mounted = true;
    const tel = async () => {
      const pending = await getPendingPhotos(id);
      if (mounted) setQueued(pending.length);
    };
    tel();
    const interval = window.setInterval(tel, 3000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [id]);

  const nvt = skips ?? [];
  const client = useMemo(
    () => gekozen ?? station?.opdrachtgever ?? opdrachtgevers?.[0]?.naam ?? "de opdrachtgever",
    [gekozen, station?.opdrachtgever, opdrachtgevers],
  );
  const monteur = station?.ingevuld_door || "Onbekend";
  const gereed = queued === 0;

  const versturenClick = async () => {
    if (!gereed || !id || versturen) return;
    setVersturen(true);
    const { data, error } = await supabase.functions.invoke("oplever-rapport", {
      body: { station_id: id, opdrachtgever: client, submitted_by: monteur },
    });
    setVersturen(false);
    if (error) {
      toast.error("Opleveren mislukt. Probeer het opnieuw.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    queryClient.invalidateQueries({ queryKey: ["station", id] });
    toast.success(`Opgeleverd aan ${client}`, { description: (data as { rapport_url?: string })?.rapport_url ? "Het rapport is klaargezet." : undefined });
    navigate("/", { replace: true });
  };

  if (!station) {
    return <div style={{ minHeight: "100vh", background: T.bg }} />;
  }

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
            <span className="material-symbols-rounded" style={{ fontSize: 34, color: T.surface }}>check</span>
          </div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 500, color: T.titleOnBg, marginTop: 15, letterSpacing: "-0.4px", lineHeight: 1.2, overflowWrap: "anywhere" }}>
            {station.naam_msr} is compleet
          </h1>
          <p style={{ fontSize: 16, color: T.bodyOnBg, marginTop: 8, lineHeight: 1.5 }}>
            Na opleveren gaat het dossier naar de opdrachtgever en kun je niets meer wijzigen.
          </p>
        </div>

        <div style={{ padding: "0 12px" }}>
          <Group>
            <Row icon="photo_camera" title="Foto's" chevron={false} trailing={<span className="font-mono" style={{ fontSize: 17, color: T.rowSub }}>{fotos?.length ?? 0}</span>} />
            {nvt.length > 0 && (
              <>
                <Hairline inset={INSET_ROW} />
                <Row icon="block" title="Niet van toepassing" onClick={() => setNvtOpen(true)} trailing={<span className="font-mono" style={{ fontSize: 17, color: T.rowSub }}>{nvt.length}</span>} />
              </>
            )}
            <Hairline inset={INSET_ROW} />
            {gereed ? (
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

          {nvt.length > 0 && (
            <div style={{ padding: "0 5px 20px", fontSize: 13, color: T.subOnBg, lineHeight: 1.5 }}>
              {nvt.length === 1 ? "Eén taak is" : `${nvt.length} taken zijn`} als niet van toepassing gemarkeerd. De opgegeven reden komt in het rapport te staan.
            </div>
          )}
        </div>
      </div>

      <GlassBar>
        <PrimaryButton
          onClick={versturenClick}
          disabled={!gereed || versturen}
          caption={gereed ? `Je krijgt bericht zodra ${client} heeft beoordeeld` : "Wacht tot alle foto's geüpload zijn"}
        >
          {versturen ? "Versturen…" : "Oplevering versturen"}
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_forward</span>
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
