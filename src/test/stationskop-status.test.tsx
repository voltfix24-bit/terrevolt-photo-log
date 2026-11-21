// Renderregressies statusweergave compacte stationskop (gemockte Cloud, fictieve gegevens).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type R = { data?: unknown; error?: unknown; count?: number; hang?: boolean };
const m = vi.hoisted(() => ({ tabellen: {} as Record<string, () => R>, invoke: vi.fn(), zorg: vi.fn(async () => true) }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (t: string): unknown => {
    const res = () => { const r = m.tabellen[t]?.() ?? { data: [], error: null }; return r.hang ? new Promise(() => {}) : Promise.resolve(r); };
    const p: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "order", "limit", "in"]) p[k] = () => p;
    p.single = res; p.maybeSingle = res; p.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => res().then(a, b);
    return p;
  };
  return { supabase: { from: chain, rpc: async () => ({ data: null, error: null }), functions: { invoke: m.invoke },
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } };
});
vi.mock("@/lib/require-pin", () => ({ zorgVoorBeheer: m.zorg, requirePin: async () => true, vergrendelBeheer: async () => true, fotowerkVoorActie: async () => true, BEHEER_NODIG: "x" }));
vi.mock("@/lib/internet", () => ({ internetVereist: () => true }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/components/SharePointDocumenten", () => ({ SharePointDocumenten: () => null }));
vi.mock("@/components/WizardView", () => ({ WizardView: () => null }));
vi.mock("yet-another-react-lightbox", () => ({ default: () => null }));
vi.mock("@/components/CategorieSettings", () => ({ useVoorbeelden: () => ({ data: [] }) }));
vi.mock("@/hooks/use-theme", () => ({ useInstellingen: () => ({ data: null }) }));
vi.mock("@/hooks/use-station-wachtrij", () => ({ useStationWachtrij: () => ({ samenvatting: { totaal: 0, open: 0, bezig: 0, fout: 0, verstuurd: 0 }, leesFout: false }) }));

import StationDetail from "@/pages/StationDetail";
import { SharePointStatus, _spBezig } from "@/components/SharePointStatus";
import { OpleverStatus } from "@/components/OpleverStatus";

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const station = (x: Record<string, unknown> = {}) => ({ id: "S1", naam_msr: "Teststation", casenummer: "0300001", casenaam: "Test", status: "opgeleverd", uitvoerder: "terrevolt", opdrachtgever: "Liander", ...x });
const fout = { data: null, error: { message: "netwerk" } };

globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
beforeEach(() => { m.tabellen = {}; m.invoke.mockReset(); m.zorg.mockClear(); m.invoke.mockResolvedValue({ data: { run: null }, error: null }); _spBezig.reset(); });
afterEach(() => cleanup());

describe("StationDetail: bekende dossierstatus zonder onbekend fotoaantal", () => {
  it.each(["opgeleverd", "goedgekeurd"])("%s tijdens laden: status blijft, geen '0 foto's'", async (status) => {
    m.tabellen = { stations: () => ({ data: station({ status }), error: null }), fotos: () => ({ hang: true }) };
    wrap(<StationDetail stationId="S1" />);
    await screen.findByText(status === "opgeleverd" ? "Opgeleverd aan Liander" : "Goedgekeurd door Liander");
    expect(screen.queryByText(/0 foto's/)).toBeNull();
  });
  it.each(["opgeleverd", "goedgekeurd"])("%s bij foto-leesfout: status blijft, zichtbare leesfout met opnieuw laden", async (status) => {
    let n = 0;
    m.tabellen = { stations: () => ({ data: station({ status }), error: null }), fotos: () => (++n <= 2 ? fout : { data: [{ id: "f", categorie: "A", url: "u", review_status: "approved" }], error: null, count: 0 }) };
    wrap(<StationDetail stationId="S1" />);
    await screen.findByText("Foto's konden niet worden geladen");
    expect(screen.getByText(status === "opgeleverd" ? "Opgeleverd aan Liander" : "Goedgekeurd door Liander")).toBeInTheDocument();
    expect(screen.queryByText(/0 foto's/)).toBeNull();
    expect(screen.getByRole("button", { name: "Casegegevens" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw laden" }));
    await waitFor(() => expect(screen.queryByText("Foto's konden niet worden geladen")).toBeNull());
  });
});

const sp = (st: Record<string, unknown>, t: { sync?: () => R; run?: () => R; wachtrij?: () => R }) => {
  m.tabellen = { sharepoint_sync: t.sync ?? (() => ({ data: null, error: null })), opleverruns: t.run ?? (() => ({ data: null, error: null })), sharepoint_wachtrij: t.wachtrij ?? (() => ({ data: null, error: null })) };
  const s = station(st) as Parameters<typeof SharePointStatus>[0]["station"];
  return wrap(<><div data-testid="normaal"><SharePointStatus station={s} deel="normaal" /></div><div data-testid="uitz"><SharePointStatus station={s} deel="uitzondering" /></div></>);
};
const binnen = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("SharePointStatus: één weergave per status, uitzonderingen buiten details", () => {
  it("reden + leesfout: reden in gegevens, leesfout buiten", async () => {
    sp({ status: "in uitvoering" }, { sync: () => fout });
    await screen.findByText(/SharePoint-status kon niet worden gecontroleerd/);
    expect(binnen("uitz")).toMatch(/kon niet worden gecontroleerd/);
    expect(binnen("normaal")).toMatch(/Nog niet naar SharePoint: nog niet opgeleverd/);
    expect(binnen("normaal")).not.toMatch(/gecontroleerd/);
  });
  it("reden + mislukte sync: mislukt buiten, zonder handmatige sync", async () => {
    sp({ status: "in uitvoering" }, { sync: () => ({ data: { status: "mislukt" }, error: null }) });
    await waitFor(() => expect(binnen("uitz")).toMatch(/SharePoint mislukt/));
    expect(binnen("normaal")).not.toMatch(/mislukt/);
    expect(screen.queryByText("Opnieuw proberen")).toBeNull();
  });
  it("uitgestelde sync buiten, niet dubbel", async () => {
    sp({}, { wachtrij: () => ({ data: { fout: "429" }, error: null }) });
    await waitFor(() => expect(binnen("uitz")).toMatch(/uitgesteld/));
    expect(binnen("normaal")).toBe("");
  });
  it("vorige rapportversie buiten, niet dubbel", async () => {
    sp({}, { sync: () => ({ data: { status: "gelukt", pdf_run: "oud" }, error: null }), run: () => ({ data: { id: "nieuw", status: "klaar" }, error: null }) });
    await waitFor(() => expect(binnen("uitz")).toMatch(/Vorige rapportversie/));
    expect(binnen("normaal")).toBe("");
  });
  it("gelukt blijft normaal in gegevens", async () => {
    sp({}, { sync: () => ({ data: { status: "gelukt", pdf_run: null }, error: null }) });
    await waitFor(() => expect(binnen("normaal")).toMatch(/In SharePoint/));
    expect(binnen("uitz")).toBe("");
  });
  it("handmatige retry: gedeelde voortgang blijft zichtbaar in precies één plek", async () => {
    let klaar!: (v: unknown) => void;
    m.invoke.mockImplementation(() => new Promise((r) => { klaar = r; }));
    sp({}, { sync: () => ({ data: { status: "mislukt" }, error: null }) });
    const knop = await screen.findByText("Opnieuw proberen");
    await act(async () => { fireEvent.click(knop); });
    await waitFor(() => expect(binnen("uitz")).toMatch(/Bezig met SharePoint/));
    expect(binnen("normaal")).toBe("");
    await act(async () => { klaar({ data: { ok: true }, error: null }); });
    await waitFor(() => expect(binnen("uitz")).not.toMatch(/Bezig met SharePoint/));
  });
});

describe("OpleverStatus: leesfout zichtbaar met alleen opnieuw lezen", () => {
  it("mislukte statusquery toont leesfout; opnieuw laden leest alleen status", async () => {
    m.invoke.mockResolvedValueOnce({ data: null, error: { message: "netwerk" } }).mockResolvedValue({ data: { run: null }, error: null });
    wrap(<OpleverStatus stationId="S1" />);
    await screen.findByText("Opleverstatus kon niet worden gelezen");
    fireEvent.click(screen.getByText("Opnieuw laden"));
    await waitFor(() => expect(screen.queryByText("Opleverstatus kon niet worden gelezen")).toBeNull());
    expect(m.invoke.mock.calls.every(([, o]) => (o as { body: { actie: string } }).body.actie === "status")).toBe(true);
    expect(m.zorg).not.toHaveBeenCalled();
  });
});

const ketenRun = (x: Record<string, unknown> = {}) => ({
  id: "R1", station_id: "S1", status: "pdf_bezig", retry_stap: "pdf", poging: 1,
  volgende_poging_op: null, fout: null, stap_fouten: null,
  gestart_op: "2026-11-21T10:00:00Z", afgerond_op: null, ...x,
});

describe("OpleverStatus: leesfout ook bij een eerder geladen run", () => {
  // Eerste statusreactie is geldig, élke latere reactie faalt ( polling / refetch ).
  const openMetEersteRun = async (eerste: unknown) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    m.invoke.mockResolvedValueOnce({ data: { run: eerste }, error: null }).mockResolvedValue({ data: null, error: { message: "netwerk" } });
    render(<QueryClientProvider client={qc}><OpleverStatus stationId="S1" /></QueryClientProvider>);
    await waitFor(() => expect(m.invoke).toHaveBeenCalledTimes(1));
    return qc;
  };
  const verstuurtAlleenStatus = () => {
    expect(m.invoke.mock.calls.every(([, o]) => (o as { body: { actie: string } }).body.actie === "status")).toBe(true);
    expect(m.zorg).not.toHaveBeenCalled();
  };

  it("actieve run, daarna mislukte refetch: leesfout met opnieuw laden in plaats van de vorige status", async () => {
    const qc = await openMetEersteRun(ketenRun());
    await screen.findByText("Dossier ingediend");
    await act(async () => { await qc.invalidateQueries({ queryKey: ["opleverketen", "S1"] }); });
    await screen.findByText("Opleverstatus kon niet worden gelezen");
    expect(screen.queryByText("Dossier ingediend")).toBeNull();
    verstuurtAlleenStatus();
    m.invoke.mockResolvedValue({ data: { run: ketenRun() }, error: null });
    fireEvent.click(screen.getByText("Opnieuw laden"));
    await waitFor(() => expect(screen.queryByText("Opleverstatus kon niet worden gelezen")).toBeNull());
    expect(screen.getByText("Dossier ingediend")).toBeInTheDocument();
    verstuurtAlleenStatus();
  });

  it("afgeronde eerdere run, daarna mislukte refetch: leesfout in plaats van niets", async () => {
    const qc = await openMetEersteRun(ketenRun({ status: "afgerond", retry_stap: null, afgerond_op: "2026-11-21T10:05:00Z" }));
    expect(screen.queryByText(/Oplevering compleet/)).toBeNull();
    await act(async () => { await qc.invalidateQueries({ queryKey: ["opleverketen", "S1"] }); });
    await screen.findByText("Opleverstatus kon niet worden gelezen");
    verstuurtAlleenStatus();
    m.invoke.mockResolvedValue({ data: { run: ketenRun({ status: "afgerond", retry_stap: null, afgerond_op: "2026-11-21T10:05:00Z" }) }, error: null });
    fireEvent.click(screen.getByText("Opnieuw laden"));
    await waitFor(() => expect(screen.queryByText("Opleverstatus kon niet worden gelezen")).toBeNull());
    verstuurtAlleenStatus();
  });
});
