// Prompt 3: statusbetekenis, tellingen, aandachtlijst, partijkeuze en import-footer (fictieve gegevens).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { balVan, type CaseItem, type ToRonde, type ToActie } from "@/lib/to-rondes";
import { aandachtItems } from "@/lib/aandacht";
import { bordItems, groepenVan, partijTellingen } from "@/lib/bord-groepen";
import { amsterdamDatum, hervattenVoorbij } from "@/lib/on-hold";
import { casePresentatie } from "@/lib/case-presentatie";

const m = vi.hoisted(() => ({ cases: [] as unknown[], mobiel: false, numbers: vi.fn(), import: vi.fn() }));
vi.mock("@/lib/to-rondes", async (orig) => ({ ...(await orig<typeof import("@/lib/to-rondes")>()), useCases: () => ({ data: m.cases, isLoading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => m.mobiel }));
vi.mock("@/lib/case-service", () => ({ maakCase: vi.fn(), importCase: m.import, alleCaseNummers: m.numbers, valideerCase: () => null, casePayload: (x: unknown) => x }));
vi.mock("@/lib/require-pin", () => ({ zorgVoorBeheer: async () => true, BEHEER_NODIG: "Beheer vergrendeld" }));

const actie = (id: string, bij: ToActie["bij"], omschrijving: string): ToActie => ({ id, ronde_id: "r", station_id: "s", omschrijving, bij, derde_naam: null, notitie: null, afgehandeld_op: null, created_at: "2026-03-01T10:00:00Z" });
const ronde = (nummer: number, status: ToRonde["status"], extra: Partial<ToRonde> = {}): ToRonde => ({ id: `r${nummer}`, station_id: "s", nummer, status, ingediend_op: "2026-02-20", ingediend_bij: "Van Gelder", reactie_op: "2026-03-01", redenen: [], notitie: null, to_acties: [], ...extra });
function maak(id: string, station: Record<string, unknown>, rondes: ToRonde[]): CaseItem {
  const s = { id, casenummer: id, casenaam: `Fictief ${id}`, naam_msr: `Fictief ${id}`, uitvoerder: "terrevolt", dossier_status: "ingediend", ...station } as CaseItem["station"];
  return { station: s, rondes, last: rondes.at(-1) ?? null, bal: balVan(s as never, rondes) };
}

beforeEach(() => { localStorage.clear(); m.mobiel = false; m.numbers.mockReset().mockResolvedValue([]); m.import.mockReset(); });
afterEach(cleanup);

describe("statusbetekenis en tellingen", () => {
  const vgMetTV = maak("VG-1", { uitvoerder: "van_gelder" }, [ronde(1, "afgekeurd", { to_acties: [actie("a1", "TerreVolt", "Aarding fotograferen"), actie("a2", "TerreVolt", "Meetrapport aanvullen")] })]);
  it("Van Gelder-case with TerreVolt action owner: lane Van Gelder, owner shown; two actions count as one case", () => {
    const items = bordItems([vgMetTV]);
    const vg = groepenVan(items, "Van Gelder");
    expect(vg.open).toBe(2); expect(vg.openCases).toBe(1);
    expect(groepenVan(items, "TerreVolt").open).toBe(0); // presentatie bij Van Gelder, actie blijft bewaard
    expect(items.every((i) => i.wie === "TerreVolt" && i.lane === "Van Gelder")).toBe(true);
    const a = aandachtItems([vgMetTV], "2026-03-05");
    expect(a).toHaveLength(2); expect(a.every((x) => x.balBij === "Van Gelder" && x.actieBij === "TerreVolt" && x.soort === "afkeur")).toBe(true);
    expect(partijTellingen(items)["Van Gelder"]).toEqual({ acties: 2, cases: 1 });
  });
  it("approved TO with open dossier stays for follow-up (not presented as finished); 'afgerond' disappears", () => {
    const open = maak("TV-2", {}, [ronde(1, "goedgekeurd")]);
    const af = maak("TV-3", { dossier_status: "afgerond" }, [ronde(1, "goedgekeurd")]);
    const a = aandachtItems([open, af], "2026-03-05");
    expect(a.map((x) => [x.casenummer, x.soort])).toEqual([["TV-2", "afronden"]]);
    expect(a[0].actie).toMatch(/Dossier afronden/); expect(a[0].balBij).toBe("Liander");
    expect(casePresentatie(af).partijen).toEqual([]);
    expect(groepenVan(bordItems([open]), "Liander").groepen[0].titel).toMatch(/dossier nog niet afgerond/);
  });
});

describe("hervatten: Amsterdamse kalenderdag", () => {
  const hold = (tot: string | null) => maak("H", { on_hold: true, on_hold_sinds: "2026-02-01", on_hold_tot: tot, on_hold_partij: "derden", on_hold_reden: "Vergunning" }, [ronde(1, "controle")]);
  it("yesterday is late, today and unknown are not", () => {
    expect(aandachtItems([hold("2026-03-04")], "2026-03-05").map((x) => x.soort)).toEqual(["hervatten"]);
    expect(aandachtItems([hold("2026-03-05")], "2026-03-05")).toEqual([]);
    expect(aandachtItems([hold(null)], "2026-03-05")).toEqual([]);
    expect(aandachtItems([hold("2026-03-04")], "2026-03-05")[0].balBij).toBe("Derden");
  });
  it("uses Europe/Amsterdam, not UTC, at the date boundary", () => {
    const laatUtc = new Date("2026-03-01T23:30:00Z"); // 00:30 op 2 maart in Amsterdam
    expect(amsterdamDatum(laatUtc)).toBe("2026-03-02");
    expect(hervattenVoorbij({ on_hold_tot: "2026-03-01" }, amsterdamDatum(laatUtc))).toBe(true);
    expect(hervattenVoorbij({ on_hold_tot: "2026-03-01" }, "2026-03-01")).toBe(false);
    const zomer = new Date("2026-07-01T21:59:00Z"); // 23:59 Amsterdam (UTC+2)
    expect(amsterdamDatum(zomer)).toBe("2026-07-01");
  });
});

function Locatie() { const l = useLocation(); return <div data-testid="loc">{l.search}</div>; }
const renderCases = async (pad = "/cases") => {
  const { default: Cases } = await import("@/pages/Cases");
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[pad]}><Cases /><Locatie /></MemoryRouter></QueryClientProvider>);
};

describe("Cases-pagina", () => {
  beforeEach(() => {
    m.cases = [
      maak("TV-1", {}, [ronde(1, "afgekeurd")]),
      maak("VG-1", { uitvoerder: "van_gelder" }, [ronde(1, "afgekeurd", { to_acties: [actie("a1", "TerreVolt", "Aarding fotograferen"), actie("a2", "TerreVolt", "Meetrapport")] })]),
      maak("VG-2", { uitvoerder: "van_gelder" }, [ronde(1, "goedgekeurd")]),
    ];
  });
  it("party choice and executor filter are independent", async () => {
    await renderCases();
    const partij = screen.getByRole("group", { name: "Bal bij partij" });
    fireEvent.click(within(partij).getByRole("button", { name: /^Van Gelder: 2 acties in 1 cases/ }));
    expect(screen.getByTestId("loc").textContent).toContain("partij=Van+Gelder");
    expect(localStorage.getItem("to-uitvoerder-filter")).toBeNull();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toContain("Van Gelder");
    expect(screen.queryByRole("region", { name: "TerreVolt" })).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "Uitvoering" })).getByRole("button", { name: /TerreVolt/ }));
    expect(localStorage.getItem("to-uitvoerder-filter")).toBe("terrevolt");
    expect(screen.getByTestId("loc").textContent).toContain("partij=Van+Gelder");
  });
  it("lane header names actions and cases separately; attention list lists follow-up", async () => {
    await renderCases("/cases?partij=alle");
    expect(within(screen.getByRole("region", { name: "Van Gelder" })).getByText(/2 acties · 1 case open/)).toBeTruthy();
    const aandacht = screen.getByRole("region", { name: /Aandacht/ });
    expect(within(aandacht).getByText(/4 acties · 3 cases/)).toBeTruthy();
    expect(within(aandacht).getAllByText(/Actie bij:/).length).toBe(2);
  });
  it("score with executor filter shows no false zero card and keeps FTR denominators", async () => {
    localStorage.setItem("to-uitvoerder-filter", "van_gelder");
    await renderCases();
    fireEvent.click(screen.getByRole("tab", { name: "TO-score" }));
    const per = screen.getByLabelText("TO-score per uitvoerder");
    expect(within(per).queryByText(/^TerreVolt/)).toBeNull();
    expect(within(per).getByText(/2 cases/)).toBeTruthy();
    expect(within(per).getByText("1 van 2 beoordeeld")).toBeTruthy();
    expect(screen.queryByText("Zie TerreVolt en Derden")).toBeNull();
  });
  it("mobile: compact header with action menu and one work list; score as cards with case, TO status, dossier and party", async () => {
    m.mobiel = true;
    await renderCases();
    expect(screen.getByRole("button", { name: "Meer acties" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Importeren uit Excel/ })).toBeNull();
    expect(screen.getAllByRole("region").filter((r) => ["TerreVolt", "Van Gelder", "Liander", "Derden"].includes(r.getAttribute("aria-label") ?? ""))).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "TO-score" }));
    const lijst = screen.getByRole("list", { name: "Cases" });
    const eerste = within(lijst).getAllByRole("listitem")[0];
    expect(within(eerste).getByText("TV-1")).toBeTruthy(); expect(within(eerste).getByText("Afgekeurd")).toBeTruthy();
    expect(within(eerste).getByText(/Dossier: Ingediend/)).toBeTruthy(); expect(within(eerste).getByText(/Bal bij: TerreVolt/)).toBeTruthy();
    expect(within(eerste).getByRole("img", { name: "Ronde 1: Afgekeurd" })).toBeTruthy();
  });
});

describe("import met honderd regels", () => {
  it("count and actions are in a fixed footer outside the scrolling middle; real per-row results after retry", async () => {
    const { ExcelImportDialog } = await import("@/components/cases/ExcelImportDialog");
    m.import.mockResolvedValueOnce({ status: "mislukt", pauze: true, fout: "lost response" }).mockResolvedValue({ status: "aangemaakt", id: "x" });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ExcelImportDialog open onOpenChange={vi.fn()} bestaand={[]} /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(m.numbers).toHaveBeenCalled());
    const rijen = Array.from({ length: 100 }, (_, i) => `F-${String(i + 1).padStart(3, "0")}\tFictief ${i + 1}`).join("\n");
    fireEvent.change(screen.getByRole("textbox", { name: "Geplakte Excel-rijen" }), { target: { value: `Casenummer\tCasenaam\n${rijen}` } });
    const footer = screen.getByTestId("import-footer"), midden = screen.getByTestId("import-midden");
    expect(midden.contains(footer)).toBe(false);
    expect(midden.className).toMatch(/overflow-y-auto/); expect(footer.className).toMatch(/shrink-0/);
    const knop = await within(footer).findByRole("button", { name: "100 cases importeren" });
    expect(within(footer).getByRole("button", { name: "Annuleren" })).toBeTruthy();
    expect(within(footer).getByText(/0 opgeslagen · 100 resterend/)).toBeTruthy();
    await waitFor(() => expect(knop).toBeEnabled()); fireEvent.click(knop);
    await screen.findByRole("alert"); // eerste rij onzeker: pauze, geen schijnsucces
    expect(within(footer).getByText(/0 opgeslagen · 100 resterend/)).toBeTruthy();
    fireEvent.click(within(footer).getByRole("button", { name: "100 cases importeren" }));
    await waitFor(() => expect(within(footer).getByText(/100 opgeslagen · 0 resterend · 0 bestaat al · 0 fout/)).toBeTruthy(), { timeout: 8000 });
    expect(m.import.mock.calls[1][1]).toBe(m.import.mock.calls[0][1]); // dezelfde requestidentiteit bij retry
  }, 15000);
});
