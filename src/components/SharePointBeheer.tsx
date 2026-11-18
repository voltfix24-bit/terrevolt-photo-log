import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Eerstvolgende zondag 01:00 Amsterdamse tijd
export function volgendeRun(nu = new Date()): Date {
  for (let u = 0; u < 24 * 8; u++) {
    const d = new Date(Math.ceil(nu.getTime() / 3600_000) * 3600_000 + u * 3600_000);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
    if (p.weekday === "Sun" && Number(p.hour) === 1) return d;
  }
  return nu;
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function SharePointBeheer() {
  const qc = useQueryClient();
  const [start, setStart] = useState(false);
  const { data: run } = useQuery({
    queryKey: ["sharepoint-runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sharepoint_sync_runs").select("*").order("gestart_op", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data && !q.state.data.klaar_op ? 5000 : false),
  });
  const loopt = !!run && !run.klaar_op;
  const fouten = Array.isArray(run?.fouten) ? run!.fouten.length : 0;

  const nu = async () => {
    setStart(true);
    const { error } = await supabase.functions.invoke("sharepoint-weekly", { body: { handmatig: true } });
    setStart(false);
    qc.invalidateQueries({ queryKey: ["sharepoint-runs"] });
    if (error) toast.error("Synchronisatie starten is mislukt");
    else toast.success("Volledige synchronisatie gestart");
  };

  return (
    <div className="bg-card rounded-2xl border border-outline-variant/10 shadow-sm mb-4 overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-outline-variant/10">
        <h2 className="font-display font-bold text-[15px] text-on-surface">SharePoint</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Elke zondag om 01:00 wordt SharePoint gelijkgezet met de app</p>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Laatste run</div>
          {run ? (
            <>
              <div className="font-semibold text-on-surface">{fmt(run.gestart_op)}{run.handmatig ? " · handmatig" : ""}{loopt ? " · bezig…" : ""}</div>
              <div className="text-muted-foreground">
                {run.stations} stations · {run.toegevoegd} toegevoegd · {run.verwijderd} verwijderd · {run.verplaatst} verplaatst
                {fouten > 0 && <span className="text-destructive"> · {fouten} {fouten === 1 ? "fout" : "fouten"}</span>}
              </div>
            </>
          ) : <div className="text-on-surface">Nog niet gedraaid</div>}
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Volgende geplande run</div>
          <div className="font-semibold text-on-surface">{fmt(volgendeRun())}</div>
        </div>
        <button onClick={nu} disabled={start || loopt} className="text-primary font-semibold disabled:opacity-50">
          {loopt ? "Synchronisatie loopt…" : start ? "Starten…" : "Nu volledig synchroniseren"}
        </button>
      </div>
    </div>
  );
}
