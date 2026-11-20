import { useState } from "react";
import { BlokLader, KnopLader, LaadAfbeelding, PaginaLader } from "@/components/Laden";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInstellingen } from "@/hooks/use-theme";
import { zorgVoorBeheer } from "@/lib/require-pin";
import { dagenTotVerlopen } from "@/components/SharePointSleutelBanner";

// Exacte namen zoals ze in Microsoft Entra (API-machtigingen → Microsoft Graph → Toepassingsmachtigingen) staan
const MACHTIGING_UITLEG: Record<string, string> = {
  "Sites.Manage.All": "nodig om de metadata-kolommen (Behuizingsnummer, Casenummer, Status …) in de documentbibliotheek aan te maken",
  "Application.Read.All": "nodig om de verloopdatum van de sleutel automatisch op te halen",
};

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
  const { data: instRaw } = useInstellingen();
  const inst = instRaw as any;
  const [controle, setControle] = useState(false);
  const nodig: string[] = inst?.sp_machtigingen_nodig ?? [];
  const dagen = dagenTotVerlopen(inst?.sp_sleutel_verloopt_op);

  const controleer = async () => {
    if (!(await zorgVoorBeheer())) return;
    setControle(true);
    const { error } = await supabase.functions.invoke("sharepoint-sync", { body: { controle: true } });
    setControle(false);
    qc.invalidateQueries({ queryKey: ["instellingen"] });
    if (error) toast.error("Controleren is mislukt"); else toast.success("SharePoint gecontroleerd");
  };
  const zetDatum = async (v: string) => {
    if (!inst?.id) return;
    const { error } = await supabase.from("instellingen").update({ sp_sleutel_verloopt_op: v || null } as any).eq("id", inst.id);
    if (error) toast.error("Opslaan mislukt"); else qc.invalidateQueries({ queryKey: ["instellingen"] });
  };

  const loopt = !!run && !run.klaar_op;
  const fouten = Array.isArray(run?.fouten) ? run!.fouten.length : 0;

  const nu = async () => {
    if (!(await zorgVoorBeheer())) return;
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
        <div>
          <div className="text-muted-foreground text-xs">Sleutel verloopt op</div>
          {inst?.sp_sleutel_automatisch ? (
            <div className="font-semibold text-on-surface">
              {new Date(`${inst.sp_sleutel_verloopt_op}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
              <span className="text-muted-foreground font-normal"> · automatisch opgehaald{dagen !== null ? ` · nog ${dagen} dagen` : ""}</span>
            </div>
          ) : (
            <input type="date" value={inst?.sp_sleutel_verloopt_op ?? ""} onChange={(e) => zetDatum(e.target.value)}
              className="bg-transparent font-semibold text-on-surface outline-none" />
          )}
          {inst?.sp_auth_fout && <div className="text-destructive font-semibold">Microsoft weigert de sleutel: maak een nieuw clientgeheim en vervang MS_CLIENT_SECRET.</div>}
        </div>
        {nodig.length > 0 && (
          <div>
            <div className="text-muted-foreground text-xs">Extra machtiging nodig in Microsoft Entra</div>
            {nodig.map((m) => (
              <div key={m} className="text-on-surface"><span className="font-semibold">{m}</span> <span className="text-muted-foreground">(Microsoft Graph, type Toepassing, daarna beheerderstoestemming verlenen) — {MACHTIGING_UITLEG[m] ?? ""}</span></div>
            ))}
          </div>
        )}
        <div className="flex gap-5">
        <button onClick={nu} disabled={start || loopt} className="text-primary font-semibold disabled:opacity-50">
          {loopt || start ? <span className="inline-flex items-center gap-2"><KnopLader />{loopt ? "Synchronisatie loopt" : "Starten"}</span> : "Nu volledig synchroniseren"}
        </button>
        <button onClick={controleer} disabled={controle} className="text-primary font-semibold disabled:opacity-50">
          {controle ? <span className="inline-flex items-center gap-2"><KnopLader />Controleren</span> : "Opnieuw controleren"}
        </button>
        </div>
      </div>
    </div>
  );
}
