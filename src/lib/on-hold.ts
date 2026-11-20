// On hold: wie, sinds wanneer, en wachttijd zonder on-hold-tijd
import { supabase } from "@/integrations/supabase/client";

export type OnHoldPartij = "terrevolt" | "van_gelder" | "liander" | "derden";
export const HOLD_PARTIJEN: OnHoldPartij[] = ["terrevolt", "van_gelder", "liander", "derden"];
export const HOLD_PARTIJ_NAAM: Record<OnHoldPartij, "TerreVolt" | "Van Gelder" | "Liander" | "Derden"> = {
  terrevolt: "TerreVolt", van_gelder: "Van Gelder", liander: "Liander", derden: "Derden",
};
export const HOLD_KLEUR = { bg: "#F3EEF7", fg: "#6B4E8C" } as const;

export type HoldVelden = { on_hold?: boolean | null; on_hold_reden?: string | null; on_hold_sinds?: string | null; on_hold_tot?: string | null; on_hold_partij?: OnHoldPartij | null };

const dag = (d: string) => Math.floor(new Date(d.slice(0, 10) + "T00:00:00Z").getTime() / 86400000);
const vandaagIso = () => new Date().toISOString().slice(0, 10);

export const isOnHold = (s: HoldVelden | null | undefined) => !!s?.on_hold;
export const holdPartij = (s: HoldVelden): OnHoldPartij => s.on_hold_partij ?? "terrevolt";

/** Dagen tussen start en eind (standaard vandaag), min de overlap met de lopende on-hold-periode. */
export function dagenZonderHold(start: string | null | undefined, eind: string | null | undefined, s: HoldVelden | null | undefined, nu = vandaagIso()): number {
  if (!start) return 0;
  const a = dag(start), b = dag(eind ?? nu);
  let n = Math.max(0, b - a);
  if (s?.on_hold && s.on_hold_sinds) {
    const h0 = Math.max(a, dag(s.on_hold_sinds)), h1 = Math.min(b, dag(nu));
    if (h1 > h0) n -= h1 - h0;
  }
  return Math.max(0, n);
}

export const holdDagen = (s: HoldVelden, nu = vandaagIso()) => (s.on_hold_sinds ? Math.max(0, dag(nu) - dag(s.on_hold_sinds)) : 0);
export const hervattenVoorbij = (s: HoldVelden, nu = vandaagIso()) => !!s.on_hold_tot && dag(s.on_hold_tot) < dag(nu);

const nlDatum = (d: string) => new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const holdDatum = nlDatum;

/** Regel die bij hervatten in de notities komt. */
export const hervatRegel = (s: HoldVelden, nu = vandaagIso()) =>
  `On hold van ${s.on_hold_sinds ? nlDatum(s.on_hold_sinds) : "?"} tot ${nlDatum(nu)}: ${(s.on_hold_reden ?? "").trim() || "geen reden"}`;

export async function zetOnHold(id: string, v: { reden: string; partij: OnHoldPartij; tot: string | null }): Promise<string | null> {
  const reden = v.reden.trim();
  if (!reden) return "Reden is verplicht";
  if (reden.length > 1000) return "Reden te lang";
  if (!HOLD_PARTIJEN.includes(v.partij)) return "Kies een partij";
  const { data, error } = await supabase.from("stations").update({ on_hold: true, on_hold_reden: reden, on_hold_partij: v.partij, on_hold_sinds: vandaagIso(), on_hold_tot: v.tot || null }).eq("id", id).select("id");
  return error || !data?.length ? "Opslaan mislukt — probeer opnieuw" : null;
}

export async function hervat(id: string, s: HoldVelden & { dossier_notitie?: string | null }): Promise<string | null> {
  const oud = (s.dossier_notitie ?? "").trim();
  const notitie = [oud, hervatRegel(s)].filter(Boolean).join("\n");
  const { data, error } = await supabase.from("stations").update({ on_hold: false, dossier_notitie: notitie, on_hold_reden: null, on_hold_sinds: null, on_hold_tot: null, on_hold_partij: null }).eq("id", id).select("id");
  return error || !data?.length ? "Opslaan mislukt — probeer opnieuw" : null;
}
