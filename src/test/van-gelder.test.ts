import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { balVan, TO_STATUS, type CaseItem, type ToRonde } from "@/lib/to-rondes";
import { filterCases, leesFilter, bewaarFilter, tellingen, FILTER_KEY } from "@/lib/cases-filter";
import { maakCase, valideerCase } from "@/lib/case-service";
import { isVanGelder } from "@/lib/urls";
import { nietSyncReden } from "@/components/SharePointStatus";
import { beslis, type Run } from "../../supabase/functions/_shared/opleverketen";

const ronde = (p: Partial<ToRonde> = {}): ToRonde => ({ id: "r", station_id: "s", nummer: 1, status: "open", ingediend_op: null, ingediend_bij: null, reactie_op: null, redenen: [], notitie: null, to_acties: [], ...p });
const caseVan = (id: string, uitvoerder?: "terrevolt" | "van_gelder"): CaseItem => ({ station: { id, uitvoerder }, rondes: [ronde()], last: ronde(), bal: [] });

describe("migratie", () => {
  const sql = readFileSync("drizzle/migrations/0011_case_uitvoerder.sql", "utf8");
  it("uitvoerder is verplicht met default terrevolt; WV optioneel", () => {
    expect(sql).toMatch(/uitvoerder public\.case_uitvoerder NOT NULL DEFAULT 'terrevolt'/);
    expect(sql).toMatch(/ADD COLUMN wv text;/);
  });
  it("geen globale unieke casenummer-index, alleen voor Van Gelder", () => {
    expect(sql).toMatch(/UNIQUE INDEX \w+ ON public\.stations \(lower\(btrim\(casenummer\)\)\) WHERE uitvoerder = 'van_gelder'/);
    expect(sql).not.toMatch(/UNIQUE INDEX \w+ ON public\.stations \(lower\(btrim\(casenummer\)\)\);/);
  });
  it("maak_case maakt station + ronde 1 open in één functie, zonder foto's", () => {
    expect(sql).toMatch(/INSERT INTO public\.to_rondes \(station_id, nummer, status, ingediend_op\) VALUES \(sid, 1, 'open', NULL\)/);
    expect(sql).not.toMatch(/fotos|sharepoint|rapport/i);
  });
});

describe("uitvoeringsfilter", () => {
  const cases = [caseVan("a", "terrevolt"), caseVan("b", "van_gelder"), caseVan("c")];
  it("telt en filtert; ontbrekende uitvoerder = TerreVolt", () => {
    expect(tellingen(cases)).toEqual({ alle: 3, terrevolt: 2, van_gelder: 1 });
    expect(filterCases(cases, "van_gelder").map((c) => c.station.id)).toEqual(["b"]);
    expect(filterCases(cases, "terrevolt").map((c) => c.station.id)).toEqual(["a", "c"]);
    expect(filterCases(cases, "alle")).toHaveLength(3);
  });
  it("bewaart voorkeur en valt veilig terug op Alle", () => {
    const m = new Map<string, string>();
    const opslag = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(leesFilter(opslag)).toBe("alle");
    bewaarFilter("van_gelder", opslag); expect(m.get(FILTER_KEY)).toBe("van_gelder"); expect(leesFilter(opslag)).toBe("van_gelder");
    m.set(FILTER_KEY, "onzin"); expect(leesFilter(opslag)).toBe("alle");
    expect(leesFilter({ getItem: () => { throw new Error("geblokkeerd"); } })).toBe("alle");
  });
});

describe("bal bij Van Gelder-cases (wie heeft de bal, niet de uitvoerder)", () => {
  it("open -> TerreVolt, controle -> ingediend_bij, afgekeurd met actie -> actiehouder", () => {
    expect(balVan({}, [ronde()])[0].wie).toBe("TerreVolt");
    expect(balVan({}, [ronde({ status: "controle", ingediend_bij: "Liander" })])[0].wie).toBe("Liander");
    expect(balVan({}, [ronde({ status: "controle", ingediend_bij: "Van Gelder" })])[0].wie).toBe("Van Gelder");
    const actie = { id: "a", ronde_id: "r", station_id: "s", omschrijving: "Meting", bij: "Derden" as const, derde_naam: "X", notitie: null, afgehandeld_op: null, created_at: "2026-01-01" };
    expect(balVan({}, [ronde({ status: "afgekeurd", to_acties: [actie] })])[0].label).toBe("X");
  });
});

describe("TO-statuskleuren", () => {
  it("exacte stippen en labels", () => {
    expect(Object.fromEntries(Object.entries(TO_STATUS).map(([k, v]) => [k, [v.dot, v.label]]))).toEqual({
      open: ["#8FA88F", "TO open"], controle: ["#1F4E8C", "Ter controle"], afgekeurd: ["#B33A3A", "Afgekeurd"], goedgekeurd: ["#1F5C3A", "Goedgekeurd"],
    });
  });
});

describe("geen foto-, rapport- of SharePoint-verwerking voor Van Gelder", () => {
  it("SharePoint-regel weigert Van Gelder ongeacht status", () => {
    expect(nietSyncReden({ id: "s", uitvoerder: "van_gelder", status: "opgeleverd", casenummer: "1", casenaam: "a" })).toBe("uitvoering Van Gelder");
    expect(nietSyncReden({ id: "s", uitvoerder: "terrevolt", status: "opgeleverd", casenummer: "1", casenaam: "a" })).toBeNull();
  });
  it("server-gedeelde SharePoint-regel idem", () => {
    const src = readFileSync("supabase/functions/_shared/sharepoint.ts", "utf8");
    expect(src).toMatch(/uitvoerder === "van_gelder"\) return "uitvoering Van Gelder"/);
    expect(readFileSync("supabase/functions/sharepoint-weekly/index.ts", "utf8")).toMatch(/neq\("uitvoerder", "van_gelder"\)/);
  });
  it("opleverketen start geen PDF voor Van Gelder", () => {
    const run: Run = { id: "r", station_id: "s", status: "aangevraagd", retry_stap: null, poging: 0, volgende_poging_op: null, pdf_run: null, fout: null, stap_fouten: {} };
    const b = beslis(run, { station: { status: "opgeleverd", uitvoerder: "van_gelder" }, htmlAanwezig: true, syncReden: null, pdf: null }, new Date());
    expect(b.actie === "update" && b.patch.status).toBe("mislukt");
  });
  it("routes herkennen Van Gelder", () => {
    expect(isVanGelder({ uitvoerder: "van_gelder" })).toBe(true);
    expect(isVanGelder({ uitvoerder: "terrevolt" })).toBe(false);
    expect(isVanGelder({})).toBe(false);
  });
  it("startlijst en beoordelen filteren op TerreVolt", () => {
    expect(readFileSync("src/pages/Index.tsx", "utf8")).toMatch(/\.eq\("uitvoerder", "terrevolt"\)/);
    expect(readFileSync("src/pages/Beoordelen.tsx", "utf8")).toMatch(/\.eq\("uitvoerder", "terrevolt"\)/);
  });
});

describe("case aanmaken", () => {
  beforeEach(() => rpc.mockReset());
  it("valideert verplichte velden zonder serveraanroep", async () => {
    expect(valideerCase({ casenummer: "  ", casenaam: "x", uitvoerder: "van_gelder" })).toBe("Casenummer is verplicht");
    expect(await maakCase({ casenummer: "1", casenaam: " ", uitvoerder: "van_gelder" })).toEqual({ ok: false, fout: "Casenaam is verplicht" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("normaliseert witruimte en geeft id terug", async () => {
    rpc.mockResolvedValue({ data: "id-1", error: null });
    expect(await maakCase({ casenummer: " 03  08 ", casenaam: " Graaf   Hendrik ", uitvoerder: "van_gelder", wv: " Piet " })).toEqual({ ok: true, id: "id-1" });
    expect(rpc).toHaveBeenCalledWith("maak_case", expect.objectContaining({ _casenummer: "03 08", _casenaam: "Graaf Hendrik", _wv: "Piet", _uitvoerder: "van_gelder" }));
  });
  it("dubbel casenummer en serverfout geven duidelijke melding", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "x" } });
    expect(await maakCase({ casenummer: "0308029", casenaam: "a", uitvoerder: "van_gelder" })).toEqual({ ok: false, fout: "Casenummer 0308029 bestaat al", bestaat: true });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "intern" } });
    expect(await maakCase({ casenummer: "1", casenaam: "a", uitvoerder: "van_gelder" })).toEqual({ ok: false, fout: "Case aanmaken mislukt — probeer opnieuw" });
  });
});
