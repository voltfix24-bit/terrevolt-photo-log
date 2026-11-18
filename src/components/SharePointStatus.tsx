import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pressable, T } from "@/components/apple/Primitives";
import { toast } from "sonner";

// Klein statuslabel voor de SharePoint-koppeling + handmatig opnieuw synchroniseren
export function SharePointStatus({ stationId, opgeleverd }: { stationId: string; opgeleverd: boolean }) {
  const qc = useQueryClient();
  const [bezig, setBezig] = useState(false);
  const { data: sync } = useQuery({
    queryKey: ["sharepoint-sync", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharepoint_sync").select("*").eq("station_id", stationId).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.status === "bezig" ? 3000 : false),
  });

  if (!sync && !opgeleverd) return null;

  const opnieuw = async () => {
    setBezig(true);
    const { error } = await supabase.functions.invoke("sharepoint-sync", { body: { station_id: stationId } });
    setBezig(false);
    qc.invalidateQueries({ queryKey: ["sharepoint-sync", stationId] });
    if (error) toast.error("Naar SharePoint sturen is mislukt");
    else toast.success("Bijgewerkt in SharePoint");
  };

  const loopt = bezig || sync?.status === "bezig";
  const label = loopt
    ? { icon: "cloud_sync", tekst: "Bezig met SharePoint…", kleur: T.subOnBg }
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
      {!loopt && (
        <Pressable onClick={opnieuw} style={{ minHeight: 44, color: T.green, fontSize: 15, padding: "0 4px" }}>
          {sync?.status === "mislukt" ? "Opnieuw proberen" : "Opnieuw naar SharePoint"}
        </Pressable>
      )}
    </div>
  );
}
