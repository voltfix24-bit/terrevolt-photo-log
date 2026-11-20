import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { setSession: vi.fn() } } }));
import { balVan, scoreVan, dagenTekst, caseNr, caseNaam, caseSub, type ToRonde, type CaseItem } from "@/lib/to-rondes";
import { categorieKlaar, minFotos } from "@/lib/foto-regels";
import { getApplicableCategories } from "@/lib/categories";
import { controleerPin } from "@/lib/require-pin";

const ronde = (p: Partial<ToRonde>): ToRonde => ({ id: "r", station_id: "s", nummer: 1, status: "open", ingediend_op: null, ingediend_bij: null, reactie_op: null, redenen: [], notitie: null, to_acties: [], ...p });

describe("TO-rondes", () => {
  it("geen ronde: TerreVolt moet indienen", () => {
    expect(balVan({}, [])[0]).toMatchObject({ wie: "TerreVolt", txt: "TO klaarzetten en indienen" });
  });
  it("in controle bij Liander", () => {
    expect(balVan({}, [ronde({ status: "controle", ingediend_bij: "Liander" })])[0].wie).toBe("Liander");
  });
  it("afgekeurd met open actie: bal bij die partij", () => {
    const r = ronde({ status: "afgekeurd", to_acties: [{ id: "a", ronde_id: "r", station_id: "s", omschrijving: "Kabel", bij: "Van Gelder", derde_naam: null, notitie: null, afgehandeld_op: null, created_at: "2026-01-01" }] });
    expect(balVan({}, [r])[0]).toMatchObject({ wie: "Van Gelder", txt: "Kabel" });
  });
  it("afgekeurd zonder open acties: opnieuw indienen ronde 2", () => {
    expect(balVan({}, [ronde({ status: "afgekeurd" })])[0].txt).toBe("Opnieuw indienen (ronde 2)");
  });
  it("goedgekeurd en afgerond: niets open", () => {
    expect(balVan({ dossier_status: "afgerond" }, [ronde({ status: "goedgekeurd" })])).toEqual([]);
  });
  it("first-time-right en gemiddeld aantal rondes", () => {
    const c = (rs: ToRonde[]): CaseItem => ({ station: { id: "s" }, rondes: rs, last: rs[rs.length - 1], bal: [] });
    const s = scoreVan([c([ronde({ status: "goedgekeurd" })]), c([ronde({ status: "afgekeurd", redenen: ["foto"] }), ronde({ nummer: 2, status: "goedgekeurd" })])]);
    expect(s.ftrPct).toBe(50); expect(s.gemRondes).toBe(1.5);
  });
  it("teksten", () => {
    expect([dagenTekst(0), dagenTekst(1), dagenTekst(12)]).toEqual(["vandaag", "1 dag", "12 dagen"]);
    expect(caseNr({ behuizingsnummer: "500" })).toBe("500"); expect(caseNr(null)).toBe("Geen casenummer");
    expect(caseNaam({ naam_msr: "x" })).toBeTruthy(); expect(caseSub({ naam_msr: "x" })).toBe("");
  });
});

describe("volledigheid", () => {
  it("elke toepasselijke categorie vraagt nu 1 foto", () => {
    const cats = getApplicableCategories({ type_ruimte: "Compact Station", vermogensveld: true, da_kast: true } as never);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) { expect(minFotos(c.id)).toBe(1); expect(categorieKlaar(c.id, 0)).toBe(false); expect(categorieKlaar(c.id, 1)).toBe(true); }
  });
});

describe("pincode via server", () => {
  it("juiste code: sessie wordt gezet", async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, access_token: "a", refresh_token: "r" }, error: null }));
    const zet = vi.fn(async () => ({ error: null }));
    expect(await controleerPin("24491", invoke as never, zet as never)).toEqual({ ok: true });
    expect(zet).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
  });
  it("foute code: geen sessie", async () => {
    const zet = vi.fn();
    const r = await controleerPin("1", (async () => ({ data: { ok: false, error: "Onjuiste code" }, error: null })) as never, zet as never);
    expect(r.ok).toBe(false); expect(zet).not.toHaveBeenCalled();
  });
  it("geen verbinding: geen toegang", async () => {
    const r = await controleerPin("24491", (async () => { throw new Error("net"); }) as never, vi.fn() as never);
    expect(r).toEqual({ ok: false, fout: "Geen verbinding met de server" });
  });
});
