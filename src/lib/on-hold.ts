// On hold: wie, sinds wanneer, en wachttijd zonder on-hold-tijd
import { supabase } from "@/integrations/supabase/client";

export type OnHoldPartij = "terrevolt" | "van_gelder" | "liander" | "derden";
export const HOLD_PARTIJEN: OnHoldPartij[] = ["terrevolt", "van_gelder", "liander", "derden"];
export const HOLD_PARTIJ_NAAM: Record<OnHoldPartij, "TerreVolt" | "Van Gelder" | "Liander" | "Derden"> = {
  terrevolt: "TerreVolt", van_gelder: "Van Gelder", liander: "Liander", derden: "Derden",
};
export const HOLD_KLEUR = { bg: "#F3EEF7", fg: "#6B4E8C" } as const;

export type HoldPeriode = { id: string; begin_op: string | null; einde_op: string | null; reden?: string; partij?: OnHoldPartij; verwacht_op?: string | null };
export type HoldVelden = { hold_periodes?: HoldPeriode[]; on_hold?: boolean | null; on_hold_reden?: string | null; on_hold_sinds?: string | null; on_hold_tot?: string | null; on_hold_partij?: OnHoldPartij | null };

const dag = (d: string) => Math.floor(new Date(d.slice(0, 10) + "T00:00:00Z").getTime() / 86400000);
export const amsterdamDatum = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const vandaagIso = amsterdamDatum;

export const isOnHold = (s: HoldVelden | null | undefined) => !!s?.on_hold;
export const holdPartij = (s: HoldVelden): OnHoldPartij => s.on_hold_partij ?? "terrevolt";

/** Dagen tussen start en eind (standaard vandaag), min de overlap met de lopende on-hold-periode. */
export function dagenZonderHold(start: string | null | undefined, eind: string | null | undefined, s: HoldVelden | null | undefined, nu = vandaagIso()): number {
  if (!start) return 0;
  const a = dag(start), b = dag(eind ?? nu);
  const intervals = (s?.hold_periodes ?? (s?.on_hold && s.on_hold_sinds ? [{ begin_op: s.on_hold_sinds, einde_op: null }] : []))
    .filter(h => h.begin_op)
    .map(h => [Math.max(a, dag(h.begin_op ?? "")), Math.min(b, dag(h.einde_op ?? nu))])
    .filter(([x,y]) => y>x).sort((x,y) => x[0]-y[0]);
  let paused = 0, end = a;
  for (const [x,y] of intervals) { paused += Math.max(0,y-Math.max(x,end)); end = Math.max(end,y); }
  return Math.max(0, b-a-paused);
}

export const holdDagen = (s: HoldVelden, nu = vandaagIso()) => (s.on_hold_sinds ? Math.max(0, dag(nu) - dag(s.on_hold_sinds)) : 0);
export const hervattenVoorbij = (s: HoldVelden, nu = vandaagIso()) => !!s.on_hold_tot && dag(s.on_hold_tot) < dag(nu);

const nlDatum = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const holdDatum = nlDatum;

/** Regel die bij hervatten in de notities komt. */
export const hervatRegel = (s: HoldVelden, nu = vandaagIso()) =>
  `On hold van ${s.on_hold_sinds ? nlDatum(s.on_hold_sinds) : "?"} tot ${nlDatum(nu)}: ${(s.on_hold_reden ?? "").trim() || "geen reden"}`;

export async function zetOnHold(id: string, v: { reden: string; partij: OnHoldPartij; tot: string | null; requestId?: string }): Promise<string | null> {
  const reden = v.reden.trim();
  if (!reden) return "Reden is verplicht";
  if (reden.length > 1000) return "Reden te lang";
  if (!HOLD_PARTIJEN.includes(v.partij)) return "Kies een partij";
  const { data, error } = await supabase.rpc("case_hold_start", { _station_id: id, _periode_id: v.requestId ?? crypto.randomUUID(), _reden: reden, _partij: v.partij, _verwacht: v.tot || undefined });
  return error || !data ? error?.message ?? "Opslaan mislukt — probeer opnieuw" : null;
}

export async function hervat(id: string, s: HoldVelden & { dossier_notitie?: string | null }): Promise<string | null> {
  const active = s.hold_periodes?.find(h => h.einde_op === null);
  if (!active) return "Pauze gewijzigd — vernieuw deze pagina";
  const { data, error } = await supabase.rpc("case_hold_hervat", { _station_id: id, _periode_id: active.id });
  return error || data !== true ? error?.message ?? "Hervatten niet bevestigd — vernieuw deze pagina" : null;
}
