import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
const update = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ update: (p: unknown) => { update(p); return { eq: () => ({ select: async () => ({ data: [{ id: "s" }], error: null }) }) }; } }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { bouwPreview, herkenKop, importeerbaar, isDubbelHerkend, mapStatus, ontbrekendeVerplicht, parseDatum, parseTsv, startMapping, zetMapping } from "@/lib/case-import";
import { maakCase } from "@/lib/case-service";
import { indieningen, scorePerUitvoerder, scoreVan, TO_STATUS, type CaseItem, type ToRonde } from "@/lib/to-rondes";
import { VgVelden, OVERSTAP_TEKST } from "@/components/cases/VgVelden";

const r = (status: ToRonde["status"], nummer = 1, ingediend_op: string | null = null): ToRonde => ({ id: `r${nummer}`, station_id: "s", nummer, status, ingediend_op, ingediend_bij: null, reactie_op: null, redenen: [], notitie: null, to_acties: [] });
const c = (id: string, uitvoerder: "terrevolt" | "van_gelder", rondes: ToRonde[]): CaseItem => ({ station: { id, uitvoerder }, rondes, last: rondes[rondes.length - 1] ?? null, bal: [] });

describe("TSV plakken", () => {
  it("BOM, CRLF, tabs, aanhalingstekens, lege rijen en trim", () => {
    const g = parseTsv('\uFEFFNr\tAdres\r\n 1 \t"Straat ""A""\r\nregel 2"\r\n\r\n\t\r\n2\tB\r\n');
    expect(g).toEqual([["Nr", "Adres"], ["1", 'Straat "A"\r\nregel 2'], ["2", "B"]]);
  });
  it("herkent kop-synoniemen hoofdletter- en accentongevoelig", () => {
    expect(["casenummer", "NR", "Case"].map(herkenKop)).toEqual(["casenummer", "casenummer", "casenummer"]);
    expect(["Naam", "casenaam", "Adrés"].map(herkenKop)).toEqual(["casenaam", "casenaam", "casenaam"]);
    expect(["Status", "TO-status", "Ronde", "WV", "Werkverantwoordelijke", "Datum", "Ingediend", "Notitie", "Opmerking", "Kleur"].map(herkenKop))
      .toEqual(["status", "status", "ronde", "wv", "wv", "ingediend_op", "ingediend_op", "notitie", "notitie", null]);
  });
  it("zonder herkenbare kopregel: verplichte velden ontbreken", () => {
    expect(ontbrekendeVerplicht(startMapping(["0308029", "Graaf"]))).toEqual(["casenummer", "casenaam"]);
  });
});

describe("kolomkoppeling", () => {
  it("onbekende kolom koppelen werkt meteen door in de preview", () => {
    const grid = [["Nr", "Locatie"], ["9", "Kerkstraat"]];
    let m = startMapping(grid[0]);
    expect(m).toEqual(["casenummer", null]);
    m = zetMapping(m, 1, "casenaam");
    expect(bouwPreview(grid, m, [])[0]).toMatchObject({ casenaam: "Kerkstraat", klasse: "nieuw" });
    expect(bouwPreview(grid, zetMapping(m, 1, null), [])[0].redenen[0]).toBe("Geen naam");
  });
  it("dubbele herkenning: alleen eerste gekoppeld, kiezen vervangt de ander", () => {
    const koppen = ["Nr", "Case", "Naam"];
    const m = startMapping(koppen);
    expect(m).toEqual(["casenummer", null, "casenaam"]);
    expect(isDubbelHerkend(koppen, m, 1)).toBe(true);
    expect(zetMapping(m, 1, "casenummer")).toEqual([null, "casenummer", "casenaam"]);
  });
});

describe("status, ronde en datum", () => {
  it("statusmapping", () => {
    expect(["open", "TO open", "Ter controle", "INGEDIEND", "afgekeurd", "Goedgekeurd", "", "weet niet"].map(mapStatus))
      .toEqual(["open", "open", "controle", "controle", "afgekeurd", "goedgekeurd", "open", null]);
  });
  it("datumformaten en kalendercontrole", () => {
    expect(parseDatum("2026-03-05")).toBe("2026-03-05");
    expect(parseDatum("05-03-2026")).toBe("2026-03-05");
    expect(parseDatum("5/3/2026")).toBe("2026-03-05");
    expect(parseDatum("31-02-2026")).toBeNull();
    expect(parseDatum("45000")).toBeNull();
    expect(parseDatum("45000", true)).toBe("2023-03-15");
  });
  it("classificatie nieuw / waarschuwing / bestaat / fout", () => {
    const grid = [["Casenummer", "Casenaam", "TO-status", "Ronde", "Datum"],
      ["A1", "Een", "ter controle", "", "01-02-2026"],
      ["A2", "Twee", "vaag", "", ""],
      [" 0308029 ", "Bestaat", "", "", ""],
      ["a1", "Dubbel", "", "", ""],
      ["", "Geen nr", "", "", ""],
      ["A3", "Ronde", "", "0", ""],
      ["A4", "Datum", "afgekeurd", "2", "30-02-2026"],
      ["A5", "Leeg", "goedgekeurd", "3", ""]];
    const p = bouwPreview(grid, startMapping(grid[0]), ["0308029"]);
    expect(p.map((x) => x.klasse)).toEqual(["nieuw", "waarschuwing", "bestaat", "bestaat", "fout", "fout", "fout", "nieuw"]);
    expect(p[0]).toMatchObject({ status: "controle", ingediend_op: "2026-02-01", ronde: 1 });
    expect(p[1]).toMatchObject({ status: "open" });
    expect(p[1].redenen[0]).toMatch(/Onbekende status/);
    expect(p[3].redenen[0]).toBe("Dubbel in plaksel");
    expect(p[4].redenen[0]).toBe("Geen nr.");
    expect(p[5].redenen[0]).toMatch(/Ongeldige ronde/);
    expect(p[6].redenen[0]).toMatch(/Ongeldige datum/);
    expect(p[7]).toMatchObject({ ronde: 3, ingediend_op: null });
    expect(importeerbaar(p).map((x) => x.casenummer)).toEqual(["A1", "A2", "A5"]);
  });
});

describe("import via maak_case", () => {
  beforeEach(() => rpc.mockReset());
  it("stuurt ronde, status en datum mee; ronde 1/open blijft fase-1-aanroep", async () => {
    rpc.mockResolvedValue({ data: "id", error: null });
    await maakCase({ casenummer: "1", casenaam: "a", uitvoerder: "van_gelder", ronde: 3, toStatus: "goedgekeurd", ingediendOp: null });
    expect(rpc.mock.calls[0][1]).toMatchObject({ _ronde: 3, _to_status: "goedgekeurd" });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("_ingediend_op");
    await maakCase({ casenummer: "2", casenaam: "b", uitvoerder: "van_gelder" });
    expect(Object.keys(rpc.mock.calls[1][1]).sort()).toEqual(["_casenaam", "_casenummer", "_notitie", "_uitvoerder", "_wv"]);
  });
  it("bestaand casenummer is herkenbaar (retry zonder dubbel aanmaken)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "" } });
    expect(await maakCase({ casenummer: "1", casenaam: "a", uitvoerder: "van_gelder" })).toMatchObject({ ok: false, bestaat: true });
  });
  it("migratie: eerdere rondes afgekeurd zonder datum, open zonder datum, controle tegen alle stations", () => {
    const sql = readFileSync("drizzle/migrations/0012_maak_case_import.sql", "utf8");
    expect(sql).toMatch(/FOR i IN 1\.\.\(rn - 1\) LOOP\s+INSERT INTO public\.to_rondes \(station_id, nummer, status, ingediend_op, ingediend_bij\) VALUES \(sid, i, 'afgekeurd', NULL, 'Van Gelder'\)/);
    expect(sql).toMatch(/CASE WHEN st = 'open' THEN NULL ELSE _ingediend_op END/);
    expect(sql).toMatch(/FROM public\.stations WHERE lower\(btrim\(casenummer\)\) = lower\(nr\)\)/);
    expect(sql).not.toMatch(/ADD CONSTRAINT|UNIQUE/);
  });
});

describe("TO-score per uitvoerder", () => {
  it("Van Gelder vertekent TerreVolt niet; geïmporteerde rondes zonder datum tellen als indiening", () => {
    const cases = [
      c("t1", "terrevolt", [r("goedgekeurd", 1, "2026-01-01")]),
      c("t2", "terrevolt", [r("open")]),
      c("v1", "van_gelder", [r("afgekeurd", 1), r("afgekeurd", 2), r("goedgekeurd", 3)]),
    ];
    const [tv, vg] = scorePerUitvoerder(cases);
    expect(tv).toMatchObject({ casesN: 2, judgedN: 1, ftrPct: 100, gemRondes: 1, gemIndieningen: 1 });
    expect(vg).toMatchObject({ casesN: 1, judgedN: 1, ftrPct: 0, gemRondes: 3, gemIndieningen: 3 });
    expect(scoreVan(cases).ftrPct).toBe(50);
    expect(indieningen([r("afgekeurd", 1), r("controle", 2), r("open", 3)])).toBe(2);
  });
  it("statuskleuren", () => {
    expect([TO_STATUS.open.dot, TO_STATUS.controle.dot, TO_STATUS.afgekeurd.dot, TO_STATUS.goedgekeurd.dot]).toEqual(["#8FA88F", "#1F4E8C", "#B33A3A", "#1F5C3A"]);
  });
});

describe("VG-casepagina velden", () => {
  const renderV = (bevestig = vi.fn(() => false)) => {
    render(<QueryClientProvider client={new QueryClient()}><VgVelden id="s" uitvoerder="van_gelder" wv="Jan" namen={["Jan", "Piet"]} bevestig={bevestig} /></QueryClientProvider>);
    return bevestig;
  };
  beforeEach(() => update.mockReset());
  it("toont geen-fotowerk-tekst en slaat WV direct op", async () => {
    renderV();
    expect(screen.getByText("Geen fotowerk: deze case is door Van Gelder uitgevoerd")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("WV"), { target: { value: "Piet" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ wv: "Piet" }));
  });
  it("andere naam invoeren", async () => {
    renderV();
    fireEvent.change(screen.getByLabelText("WV"), { target: { value: "__anders__" } });
    fireEvent.change(screen.getByLabelText("Naam werkverantwoordelijke"), { target: { value: "  Kees  " } });
    fireEvent.click(screen.getByText("Opslaan"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ wv: "Kees" }));
  });
  it("overstap naar TerreVolt vraagt bevestiging; weigeren wijzigt niets", async () => {
    const b = renderV();
    fireEvent.change(screen.getByLabelText("Uitvoerder"), { target: { value: "terrevolt" } });
    expect(b).toHaveBeenCalledWith(OVERSTAP_TEKST);
    expect(update).not.toHaveBeenCalled();
  });
});
