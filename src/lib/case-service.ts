import { supabase } from "@/integrations/supabase/client";
import { eisBeheer, heeftBeheerSessie, BEHEER_NODIG } from "@/lib/require-pin";
import type { ToStatus, Uitvoerder } from "@/lib/to-rondes";

import { normaliseer, nrSleutel, valideerCase } from "./case-validatie";
export { normaliseer, nrSleutel, valideerCase };
import type { RijUitkomst } from "./import-batch";

export type NieuweCase = { casenummer: string; casenaam: string; uitvoerder: Uitvoerder; wv?: string; notitie?: string; ronde?: number; toStatus?: ToStatus; ingediendOp?: string | null; onHold?: boolean; onHoldReden?: string };
export type CaseResultaat = { ok: true; id: string; uitkomst: "aangemaakt" | "replay" } | { ok: false; fout: string; bestaat?: boolean; pauze?: boolean };

export function casePayload(c: NieuweCase) {
  return { casenummer: normaliseer(c.casenummer), casenaam: normaliseer(c.casenaam), uitvoerder: c.uitvoerder, wv: normaliseer(c.wv), notitie: (c.notitie ?? "").trim(), ronde: c.ronde ?? 1, toStatus: c.toStatus ?? "open", ingediendOp: c.ingediendOp ?? null, onHold: c.onHold ?? false, onHoldReden: normaliseer(c.onHoldReden) };
}
/** Stable request identity belongs to the caller, not to a transient network attempt. */
export async function maakCase(c: NieuweCase, requestId: string = crypto.randomUUID(), batch = false): Promise<CaseResultaat> {
  const fout = valideerCase(c);
  if (fout) return { ok: false, fout };
  try {
    if (batch) { if (!navigator.onLine || !await heeftBeheerSessie()) return { ok: false, fout: BEHEER_NODIG, pauze: true }; }
    else await eisBeheer();
    const { data, error } = await supabase.rpc("case_aanmaken", { _request_id: requestId, _payload: casePayload(c) });
    if (error) {
      if (error.code === "23505") return { ok: false, fout: `Casenummer ${normaliseer(c.casenummer)} bestaat al`, bestaat: true };
      if (error.code === "42501") return { ok: false, fout: BEHEER_NODIG, pauze: true };
      if (error.code === "22023") return { ok: false, fout: error.message };
      return { ok: false, fout: "Case aanmaken mislukt — probeer opnieuw", pauze: true };
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (data.uitkomst === "bestaat") return { ok: false, fout: `Casenummer ${normaliseer(c.casenummer)} bestaat al`, bestaat: true };
      if ((data.uitkomst === "aangemaakt" || data.uitkomst === "replay") && typeof data.id === "string") return { ok: true, id: data.id, uitkomst: data.uitkomst };
    }
    return { ok: false, fout: "Case aanmaken niet bevestigd — probeer opnieuw", pauze: true };
  } catch { return { ok: false, fout: "Verbinding of beheer onderbroken — ontgrendel en probeer opnieuw", pauze: true }; }
}
export async function importCase(c: NieuweCase, requestId: string): Promise<RijUitkomst> {
  const r = await maakCase(c,requestId,true);
  if ("fout" in r) return { status: r.bestaat ? "bestaat" : "mislukt", fout: r.fout, pauze: r.pauze };
  return { status: r.uitkomst, id: r.id };
}
/** Fetch all numbers, including hidden cases and records beyond the API page limit. */
export async function alleCaseNummers(db = supabase): Promise<string[]> {
  const nummers: string[] = [];
  for (let offset=0; ; offset+=1000) {
    const { data,error } = await db.from("stations").select("casenummer").order("id").range(offset,offset+999);
    if (error) throw error;
    nummers.push(...(data ?? []).flatMap(r => r.casenummer ? [r.casenummer] : []));
    if ((data?.length ?? 0)<1000) return nummers;
  }
}

/** Wijzigt uitvoerder/WV van een case; geeft een foutmelding terug of null. */
export async function wijzigCase(id: string, patch: { uitvoerder?: Uitvoerder; wv?: string | null }): Promise<string | null> {
  try { await eisBeheer(); } catch (e) { return (e as Error).message; }
  const p: { uitvoerder?: Uitvoerder; wv?: string | null } = {};
  if (patch.uitvoerder) p.uitvoerder = patch.uitvoerder;
  if (patch.wv !== undefined) { const w = normaliseer(patch.wv); if (w.length > 300) return "Naam te lang"; p.wv = w || null; }
  const { data, error } = await supabase.from("stations").update(p).eq("id", id).select("id");
  if (error || !data?.length) return "Opslaan mislukt — probeer opnieuw";
  return null;
}
