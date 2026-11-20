import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pressable, T } from "@/components/apple/Primitives";
import { KnopLader } from "@/components/Laden";
import { toast } from "sonner";
import { internetVereist } from "@/lib/internet";
import { ketenWeergave, type KetenRun } from "@/lib/opleverketen";

// Monitor van de opleverketen (rapport + SharePoint) met foutmelding en handmatig opnieuw proberen.
export function OpleverStatus({ stationId }: { stationId: string }) {
  const qc = useQueryClient();
  const [bezig, setBezig] = useState(false);
  const { data: run } = useQuery({
    queryKey: ["opleverketen", stationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("opleverketen", { body: { actie: "status", station_id: stationId } });
      if (error) throw error;
      return ((data as { run?: KetenRun | null })?.run ?? null);
    },
    refetchInterval: (q) => (ketenWeergave(q.state.data)?.actief ? 5000 : false),
  });
  const w = ketenWeergave(run);
  if (!w) return null;

  const opnieuw = async () => {
    if (!internetVereist()) return;
    setBezig(true);
    const { error } = await supabase.functions.invoke("opleverketen", { body: { actie: "retry", station_id: stationId } });
    setBezig(false);
    if (error) toast.error("Opnieuw proberen lukte niet");
    qc.invalidateQueries({ queryKey: ["opleverketen", stationId] });
    qc.invalidateQueries({ queryKey: ["sharepoint-sync", stationId] });
  };

  const kleur = w.toon === "fout" ? T.danger : w.toon === "goed" ? T.green : T.titleOnBg;
  const icon = w.toon === "fout" ? "error" : w.toon === "goed" ? "task_alt" : w.toon === "wacht" ? "schedule" : "sync";
  if (w.toon === "goed") return null; // compleet: SharePoint-regel toont het resultaat al
  return (
    <div role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, fontSize: 15 }}>
      <span className="material-symbols-rounded" style={{ fontSize: 20, color: kleur, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: kleur }}>{w.titel}</div>
        <div style={{ color: T.bodyOnBg, fontSize: 14, lineHeight: 1.45 }}>{w.tekst}</div>
        {w.retry && (
          <Pressable onClick={opnieuw} disabled={bezig} style={{ minHeight: 44, color: T.green, fontSize: 15, padding: 0 }}>
            {bezig ? <KnopLader /> : "Nu opnieuw proberen"}
          </Pressable>
        )}
      </div>
    </div>
  );
}
