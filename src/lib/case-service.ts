import { supabase } from "@/integrations/supabase/client";
import type { ToStatus, Uitvoerder } from "@/lib/to-rondes";

export type NieuweCase = { casenummer: string; casenaam: string; uitvoerder: Uitvoerder; wv?: string; notitie?: string; ronde?: number; toStatus?: ToStatus; ingediendOp?: string | null; onHold?: boolean; onHoldReden?: string };
export type CaseResultaat = { ok: true; id: string } | { ok: false; fout: string; bestaat?: boolean };

export const normaliseer = (v?: string | null) => (v ?? "").replace(/\s+/g, " ").trim();
export const nrSleutel = (v?: string | null) => normaliseer(v).toLowerCase();

export function valideerCase(c: NieuweCase): string | null {
  if (!normaliseer(c.casenummer)) return "Casenummer is verplicht";
  if (!normaliseer(c.casenaam)) return "Casenaam is verplicht";
  if (normaliseer(c.casenummer).length > 100 || normaliseer(c.casenaam).length > 300) return "Invoer te lang";
  return null;
}

/** Maakt case + TO-ronde 1 in één databasetransactie (maak_case); bij een fout wordt niets opgeslagen. Geen foto's, geen SharePoint. */
export async function maakCase(c: NieuweCase): Promise<CaseResultaat> {
  const fout = valideerCase(c);
  if (fout) return { ok: false, fout };
  const { data, error } = await supabase.rpc("maak_case", {
    _casenummer: normaliseer(c.casenummer),
    _casenaam: normaliseer(c.casenaam),
    _uitvoerder: c.uitvoerder,
    _wv: normaliseer(c.wv) || undefined,
    _notitie: (c.notitie ?? "").trim() || undefined,
    ...(c.ronde && c.ronde !== 1 ? { _ronde: c.ronde } : {}),
    ...(c.toStatus && c.toStatus !== "open" ? { _to_status: c.toStatus } : {}),
    ...(c.ingediendOp ? { _ingediend_op: c.ingediendOp } : {}),
    // On hold uit import: partij onbekend → TerreVolt (in maak_case)
    ...(c.onHold ? { _on_hold: true, _on_hold_reden: normaliseer(c.onHoldReden) || undefined } : {}),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, fout: `Casenummer ${normaliseer(c.casenummer)} bestaat al`, bestaat: true };
    if (error.code === "22023") return { ok: false, fout: error.message };
    return { ok: false, fout: "Case aanmaken mislukt — probeer opnieuw" };
  }
  if (typeof data !== "string") return { ok: false, fout: "Case aanmaken mislukt — probeer opnieuw" };
  return { ok: true, id: data };
}

/** Wijzigt uitvoerder/WV van een case; geeft een foutmelding terug of null. */
export async function wijzigCase(id: string, patch: { uitvoerder?: Uitvoerder; wv?: string | null }): Promise<string | null> {
  const p: { uitvoerder?: Uitvoerder; wv?: string | null } = {};
  if (patch.uitvoerder) p.uitvoerder = patch.uitvoerder;
  if (patch.wv !== undefined) { const w = normaliseer(patch.wv); if (w.length > 300) return "Naam te lang"; p.wv = w || null; }
  const { data, error } = await supabase.from("stations").update(p).eq("id", id).select("id");
  if (error || !data?.length) return "Opslaan mislukt — probeer opnieuw";
  return null;
}
