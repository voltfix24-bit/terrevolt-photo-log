import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Losse typing: CaseDetail geeft de query-builders door als Promise; strikte types vragen een grotere ombouw
export const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ToStatus = "open" | "controle" | "afgekeurd" | "goedgekeurd";
export type Partij = "TerreVolt" | "Van Gelder" | "Liander" | "Derden";
export type DossierStatus = "ingediend" | "volledig" | "afgerond";
export type ToActie = { id: string; ronde_id: string; station_id: string; omschrijving: string; bij: Partij; derde_naam: string | null; notitie: string | null; afgehandeld_op: string | null; created_at: string };
export type ToRonde = { id: string; station_id: string; nummer: number; status: ToStatus; ingediend_op: string | null; ingediend_bij: "Van Gelder" | "Liander" | null; reactie_op: string | null; redenen: string[]; notitie: string | null; to_acties: ToActie[] };
export type BalItem = { wie: Partij; label: string; txt: string; dagen: number };
export type Uitvoerder = "terrevolt" | "van_gelder";
export type CaseStation = { id: string; naam_msr: string; casenummer: string | null; casenaam: string | null; behuizingsnummer: string | null; status: string | null; dossier_status: string | null; dossier_notitie: string | null; case_verborgen: boolean; created_at: string | null; uitvoerder: Uitvoerder; wv: string | null; is_nummer: string | null; tg: boolean };
export type CaseItem = { station: Partial<CaseStation> & { id: string } & Record<string, unknown>; rondes: ToRonde[]; last: ToRonde | null; bal: BalItem[] };

export const TO_STATUS: Record<ToStatus, { label: string; dot: string; bg: string; fg: string }> = {
  open: { label: "TO open", dot: "#8FA88F", bg: "#EEF2ED", fg: "#3D4F42" },
  controle: { label: "Ter controle", dot: "#1F4E8C", bg: "#E7EEF7", fg: "#1F4E8C" },
  afgekeurd: { label: "Afgekeurd", dot: "#B33A3A", bg: "#FBEDEC", fg: "#B33A3A" },
  goedgekeurd: { label: "Goedgekeurd", dot: "#1F5C3A", bg: "#1F5C3A", fg: "#FFFFFF" },
};
export const TO_ORDER: ToStatus[] = ["open", "controle", "afgekeurd", "goedgekeurd"];

export const DOSSIER: { key: DossierStatus; label: string; icon: string }[] = [
  { key: "ingediend", label: "Ingediend", icon: "upload_file" },
  { key: "volledig", label: "Bevestigd volledig", icon: "fact_check" },
  { key: "afgerond", label: "Afgerond", icon: "task_alt" },
];

export const PARTIJEN: Partij[] = ["TerreVolt", "Van Gelder", "Liander", "Derden"];
export const PARTIJ_STIJL: Record<Partij, { bg: string; fg: string; icon: string }> = {
  "TerreVolt": { bg: "#E3EFE0", fg: "#1F5C3A", icon: "apartment" },
  "Van Gelder": { bg: "#E7EEF7", fg: "#1A4E8A", icon: "handshake" },
  "Liander": { bg: "#FBF1E1", fg: "#8A5410", icon: "bolt" },
  "Derden": { bg: "#EEF2ED", fg: "#3D4F42", icon: "engineering" },
};

export const REDENEN: { key: string; label: string }[] = [
  { key: "foto_ontbreekt", label: "Foto ontbreekt" },
  { key: "foto_onduidelijk", label: "Foto onduidelijk" },
  { key: "meting", label: "Meetrapport ontbreekt" },
  { key: "gegevens", label: "Gegevens onjuist" },
  { key: "revisie", label: "Revisietekening" },
  { key: "overig", label: "Overig" },
];
export const REDEN_LABEL = Object.fromEntries(REDENEN.map((r) => [r.key, r.label]));

export const vandaag = () => new Date().toISOString().slice(0, 10);
export const dagenSinds = (d?: string | null, tot?: string | null) =>
  d ? Math.max(0, Math.round(((tot ? new Date(tot).getTime() : Date.now()) - new Date(d).getTime()) / 86400000)) : 0;
export const fmtDatum = (d?: string | null) => {
  if (!d) return "—";
  if (d === vandaag()) return "vandaag";
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
};
export const actieWie = (a: Pick<ToActie, "bij" | "derde_naam">) => (a.bij === "Derden" ? a.derde_naam || "Derden" : a.bij);

const AFK = new Set(["ls", "ms", "to", "atr", "nst", "ov", "wic", "msr", "ebk"]);
export const netjes = (t?: string | null) => {
  if (!t) return "";
  const allCaps = t === t.toLocaleUpperCase("nl-NL");
  if (!allCaps) return t;
  return t.toLocaleLowerCase("nl-NL").replace(/(^|[\s\-/·.])([\p{L}\p{N}]+)/gu, (_m, p, w) => AFK.has(w) ? p + w.toUpperCase() : p + w.charAt(0).toLocaleUpperCase("nl-NL") + w.slice(1));
};
type CaseStationLike = { casenummer?: string | null; casenaam?: string | null; naam_msr?: string | null; behuizingsnummer?: string | null } | null | undefined;
export const caseNr = (s: CaseStationLike) => s?.casenummer || s?.behuizingsnummer || "Geen casenummer";
export const caseNaam = (s: CaseStationLike) => netjes(s?.casenaam) || netjes(s?.naam_msr) || "Naamloos";
export const caseSub = (s: CaseStationLike) => (s?.casenaam && s?.naam_msr ? netjes(s.naam_msr) : "");
export const dagenTekst = (d: number) => (d <= 0 ? "vandaag" : d === 1 ? "1 dag" : `${d} dagen`);

export function balVan(station: { dossier_status?: string | null }, rondes: ToRonde[]): BalItem[] {
  const n = rondes.length;
  const r = rondes[n - 1];
  if (!r || r.status === "open") {
    const prev = rondes[n - 2];
    return [{ wie: "TerreVolt", label: "TerreVolt", txt: "TO klaarzetten en indienen", dagen: dagenSinds(prev?.reactie_op) }];
  }
  if (r.status === "controle") {
    const wie = (r.ingediend_bij ?? "Van Gelder") as Partij;
    return [{ wie, label: wie, txt: "TO beoordelen", dagen: dagenSinds(r.ingediend_op) }];
  }
  if (r.status === "afgekeurd") {
    const open = r.to_acties.filter((a) => !a.afgehandeld_op);
    if (open.length) return open.map((a) => ({ wie: a.bij, label: actieWie(a), txt: a.omschrijving, dagen: dagenSinds(r.reactie_op ?? a.created_at) }));
    return [{ wie: "TerreVolt", label: "TerreVolt", txt: `Opnieuw indienen (ronde ${n + 1})`, dagen: dagenSinds(r.reactie_op) }];
  }
  return station.dossier_status !== "afgerond"
    ? [{ wie: "Liander", label: "Liander", txt: "TO goedgekeurd", dagen: dagenSinds(r.reactie_op) }]
    : [];
}

export function useCases(opts?: { inclVerborgen?: boolean }) {
  const inclVerborgen = opts?.inclVerborgen ?? false;
  return useQuery({
    queryKey: ["cases", inclVerborgen],
    queryFn: async (): Promise<CaseItem[]> => {
      const { data, error } = await db
        .from("stations")
        .select("id, naam_msr, casenummer, casenaam, behuizingsnummer, status, dossier_status, dossier_notitie, case_verborgen, created_at, uitvoerder, wv, is_nummer, tg, to_rondes(*, to_acties(*))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => inclVerborgen || !s.case_verborgen)
        .sort((a: any, b: any) => {
          const ca = a.casenummer ?? "", cb = b.casenummer ?? "";
          if (!ca && cb) return 1;
          if (ca && !cb) return -1;
          if (ca !== cb) return ca.localeCompare(cb, "nl-NL", { numeric: true });
          return (a.naam_msr ?? "").localeCompare(b.naam_msr ?? "", "nl-NL");
        })
        .map((s: any) => {
          const rondes: ToRonde[] = [...(s.to_rondes ?? [])]
            .sort((a, b) => a.nummer - b.nummer)
            .map((r) => ({ ...r, redenen: r.redenen ?? [], to_acties: [...(r.to_acties ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) }));
          return { station: s, rondes, last: rondes[rondes.length - 1] ?? null, bal: balVan(s, rondes) };
        });
    },
  });
}

export function scoreVan(cases: CaseItem[]) {
  const judged = cases.filter((c) => c.rondes[0] && ["afgekeurd", "goedgekeurd"].includes(c.rondes[0].status));
  const ftrN = judged.filter((c) => c.rondes[0].status === "goedgekeurd").length;
  const appr = cases.map((c) => c.rondes.findIndex((r) => r.status === "goedgekeurd")).filter((k) => k >= 0);
  const cnt: Record<string, number> = {};
  cases.forEach((c) => c.rondes.forEach((r) => r.redenen.forEach((k) => { cnt[k] = (cnt[k] ?? 0) + 1; })));
  const controle = cases.filter((c) => c.last?.status === "controle");
  return {
    ftrPct: judged.length ? Math.round((ftrN / judged.length) * 100) : null,
    ftrN, judgedN: judged.length,
    gemRondes: appr.length ? appr.reduce((t, k) => t + k + 1, 0) / appr.length : null,
    goedgekeurdN: appr.length,
    controleN: controle.length,
    controleVG: controle.filter((c) => c.last?.ingediend_bij !== "Liander").length,
    controleLiander: controle.filter((c) => c.last?.ingediend_bij === "Liander").length,
    afgekeurdN: cases.filter((c) => c.last?.status === "afgekeurd").length,
    redenen: REDENEN.map((r) => ({ ...r, n: cnt[r.key] ?? 0 })).filter((r) => r.n).sort((a, b) => b.n - a.n),
  };
}

/** Aantal TO-indieningen: elke ronde die niet meer open staat is ingediend, ook geïmporteerde eerdere rondes zonder datum. */
export const indieningen = (rondes: Pick<ToRonde, "status">[]) => rondes.filter((r) => r.status !== "open").length;

export type UitvoerderScore = { uitvoerder: Uitvoerder; casesN: number; judgedN: number; ftrN: number; ftrPct: number | null; goedgekeurdN: number; gemRondes: number | null; gemIndieningen: number | null };
/** TO-score per uitvoerder, zodat Van Gelder de TerreVolt-score niet vertekent. */
export function scorePerUitvoerder(cases: CaseItem[]): UitvoerderScore[] {
  return (["terrevolt", "van_gelder"] as Uitvoerder[]).map((u) => {
    const sub = cases.filter((c) => (c.station.uitvoerder === "van_gelder" ? "van_gelder" : "terrevolt") === u);
    const s = scoreVan(sub);
    const ing = sub.map((c) => indieningen(c.rondes)).filter((n) => n > 0);
    return { uitvoerder: u, casesN: sub.length, judgedN: s.judgedN, ftrN: s.ftrN, ftrPct: s.ftrPct, goedgekeurdN: s.goedgekeurdN, gemRondes: s.gemRondes, gemIndieningen: ing.length ? ing.reduce((a, b) => a + b, 0) / ing.length : null };
  });
}
