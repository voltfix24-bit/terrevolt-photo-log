import { zorgVoorBeheer } from "@/lib/require-pin";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pressable, T } from "@/components/apple/Primitives";
import { toast } from "sonner";
import { internetVereist } from "@/lib/internet";
import { handmatigeSyncToegestaan, syncUitkomst, type KetenRun } from "@/lib/opleverketen";
import { Button } from "@/components/ui/button";

// Klein statuslabel voor de SharePoint-koppeling + handmatig opnieuw synchroniseren
type StationInfo = { id: string; uitvoerder?: string | null; status: string | null; casenummer: string | null; casenaam: string | null };

// Zelfde regel als de koppeling: alleen opgeleverd + casenummer én casenaam
export function nietSyncReden(s: StationInfo): string | null {
  if (s.uitvoerder === "van_gelder") return "uitvoering Van Gelder";
  if (!s.casenummer?.trim() || !s.casenaam?.trim()) return "case ontbreekt";
  if (s.status !== "opgeleverd" && s.status !== "goedgekeurd") return "nog niet opgeleverd";
  return null;
}

export function SharePointStatus({ station }: { station: StationInfo }) {
  const stationId = station.id;
  const reden = nietSyncReden(station);
  const qc = useQueryClient();
  const [bezig, setBezig] = useState(false);
  const { data: sync, error: syncError, refetch: refetchSync } = useQuery({
    queryKey: ["sharepoint-sync", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharepoint_sync").select("*").eq("station_id", stationId).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.status === "bezig" ? 3000 : false),
  });
  // Lopende opleverketen: die werkt SharePoint zelf bij, dus geen parallelle handmatige sync
  const { data: run, error: runError, refetch: refetchRun } = useQuery({
    queryKey: ["opleverrun-actief", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opleverruns").select("id, status").eq("station_id", stationId).order("gestart_op", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Pick<KetenRun, "id" | "status"> | null;
    },
    refetchInterval: (q) => (handmatigeSyncToegestaan(q.state.data) ? false : 5000),
  });
  const { data: wachtrij, error: queueError, refetch: refetchQueue } = useQuery({ queryKey:["sharepoint-wachtrij",stationId], queryFn:async () => {
    const { data,error } = await supabase.from("sharepoint_wachtrij").select("fout").eq("station_id",stationId).maybeSingle();
    if (error) throw error; return data;
  }, refetchInterval: 10000 });
  const vorigeVersie = !!run?.id && sync?.status === "gelukt" && sync.pdf_run !== run.id;
  const ketenActief = !handmatigeSyncToegestaan(run);

  if (reden) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: -8, marginBottom: 16, fontSize: 15, color: T.subOnBg, fontWeight: 600, minHeight: 44 }}>
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>cloud_off</span>Nog niet naar SharePoint: {reden}
      </div>
    );
  }

  const opnieuw = async () => {
    if (!internetVereist() || !await zorgVoorBeheer()) return;
    if (ketenActief) { toast.info("Oplevering loopt nog — SharePoint wordt automatisch bijgewerkt"); return; }
    setBezig(true);
    try {
    const { data, error } = await supabase.functions.invoke("sharepoint-sync", { body: { station_id: stationId } });
    qc.invalidateQueries({ queryKey: ["sharepoint-sync", stationId] });
    qc.invalidateQueries({ queryKey: ["opleverrun-actief", stationId] });
    const uitkomst = syncUitkomst(data, error);
    if (uitkomst === "gelukt") toast.success("Bijgewerkt in SharePoint");
    else if (uitkomst === "bezig") toast.info("Oplevering loopt nog — SharePoint wordt automatisch bijgewerkt");
    else if (uitkomst === "overgeslagen") toast.info("Niet naar SharePoint gestuurd");
    else toast.error("Naar SharePoint sturen is mislukt");
    } catch { toast.error("Naar SharePoint sturen is niet bevestigd — probeer opnieuw"); }
    finally { setBezig(false); }
  };

  if (syncError || runError || queueError) return <div role="alert" className="mb-4 text-sm">SharePoint-status kon niet worden gecontroleerd. <Button variant="ghost" onClick={() => void Promise.all([refetchSync(),refetchRun(),refetchQueue()])}>Opnieuw proberen</Button></div>;

  const loopt = bezig || sync?.status === "bezig";
  const label = loopt
    ? { icon: "cloud_sync", tekst: "Bezig met SharePoint…", kleur: T.subOnBg }
    : wachtrij ? { icon: "schedule", tekst: "SharePoint uitgesteld — wordt opnieuw geprobeerd", kleur: T.subOnBg }
    : vorigeVersie ? { icon: "history", tekst: "Vorige rapportversie in SharePoint", kleur: T.subOnBg }
    : sync?.status === "gelukt"
      ? { icon: "cloud_done", tekst: "In SharePoint ✓", kleur: T.green }
      : sync?.status === "mislukt"
        ? { icon: "cloud_off", tekst: "SharePoint mislukt", kleur: T.danger }
        : { icon: "cloud_upload", tekst: "Nog niet in SharePoint", kleur: T.subOnBg };

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 12px", marginTop: -8, marginBottom: 16, fontSize: 15 }}>
      {sync?.status === "gelukt" && sync.sharepoint_url && !loopt ? (
        <a href={sync.sharepoint_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, color: label.kleur, fontWeight: 600, minHeight: 44 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{label.icon}</span>{label.tekst}
        </a>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 6, color: label.kleur, fontWeight: 600, minHeight: 44 }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>{label.icon}</span>{label.tekst}
        </span>
      )}
      {!loopt && ketenActief && (
        <span style={{ minHeight: 44, display: "flex", alignItems: "center", color: T.subOnBg, fontSize: 14 }}>Wordt bijgewerkt door de oplevering</span>
      )}
      {!loopt && !ketenActief && (
        <Pressable onClick={opnieuw} style={{ minHeight: 44, color: T.green, fontSize: 15, padding: "0 4px" }}>
          {sync?.status === "mislukt" ? "Opnieuw proberen" : "Opnieuw naar SharePoint"}
        </Pressable>
      )}
    </div>
  );
}
