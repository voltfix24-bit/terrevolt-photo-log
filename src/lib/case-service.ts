import { supabase } from "@/integrations/supabase/client";
import type { Uitvoerder } from "@/lib/to-rondes";

export type NieuweCase = { casenummer: string; casenaam: string; uitvoerder: Uitvoerder; wv?: string; notitie?: string };
export type CaseResultaat = { ok: true; id: string } | { ok: false; fout: string };

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
  });
  if (error) {
    if (error.code === "23505") return { ok: false, fout: `Casenummer ${normaliseer(c.casenummer)} bestaat al` };
    if (error.code === "22023") return { ok: false, fout: error.message };
    return { ok: false, fout: "Case aanmaken mislukt — probeer opnieuw" };
  }
  if (typeof data !== "string") return { ok: false, fout: "Case aanmaken mislukt — probeer opnieuw" };
  return { ok: true, id: data };
}
