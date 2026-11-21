// Laden / bevestigd leeg / leesfout op Opleveren, Beoordelen en Categoriebeheer (gemockte Cloud, fictieve data).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { opleverGereedheid } from "@/lib/oplever-gereedheid";

type R = { data?: unknown; error?: unknown; hang?: boolean };
const m = vi.hoisted(() => ({ tabellen: {} as Record<string, () => R>, wachtrij: vi.fn(async () => 0), voorbeelden: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (t: string): unknown => {
    const res = () => { const r = m.tabellen[t]?.() ?? { data: [], error: null }; return r.hang ? new Promise(() => {}) : Promise.resolve(r); };
    const p: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "order", "limit", "in"]) p[k] = () => p;
    p.single = res; p.maybeSingle = res; p.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => res().then(a, b);
    return p;
  };
  return { supabase: { from: chain, rpc: async () => ({ data: null, error: null }), functions: { invoke: vi.fn() } } };
});
vi.mock("@/lib/offline-queue", () => ({ getQueueCountVoor: m.wachtrij, QUEUE_EVENT: "q" }));
vi.mock("@/lib/require-pin", () => ({ zorgVoorBeheer: async () => true }));
vi.mock("@/lib/internet", () => ({ internetVereist: () => true }));
vi.mock("@/lib/notities", () => ({ aantalLokaleNotities: () => 0, heeftBeheerGeblokkeerdeNotities: () => false, verstuurNotities: async () => {}, verstuurNotitiesNaBeheer: async () => {} }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import Opleveren from "@/pages/Opleveren";
import Beoordelen from "@/pages/Beoordelen";

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const fout = { data: null, error: { message: "netwerk" } };
const station = { data: { id: "S1", naam_msr: "Teststation", opdrachtgever: "Liander", ingevuld_door: "Test" }, error: null };
beforeEach(() => { m.tabellen = {}; m.wachtrij.mockReset(); m.wachtrij.mockResolvedValue(0); localStorage.clear(); });
afterEach(() => cleanup());

describe("opleverGereedheid", () => {
  const ok = { fotos: "ok", skips: "ok", wachtrij: 0, opdrachtgever: "ok" } as const;
  it("alles bevestigd en lege wachtrij → mag", () => expect(opleverGereedheid(ok).kan).toBe(true));
  it("foto-leesfout blokkeert", () => expect(opleverGereedheid({ ...ok, fotos: "fout" }).kan).toBe(false));
  it("wachtrij-leesfout blokkeert (geen 'alles geüpload')", () => expect(opleverGereedheid({ ...ok, wachtrij: "fout" }).kan).toBe(false));
  it("wachtrij nog onbekend blokkeert", () => expect(opleverGereedheid({ ...ok, wachtrij: null }).kan).toBe(false));
  it("foto's nog aan het laden blokkeert", () => expect(opleverGereedheid({ ...ok, fotos: "laden" }).kan).toBe(false));
  it("wachtende foto's blokkeren", () => expect(opleverGereedheid({ ...ok, wachtrij: 2 }).kan).toBe(false));
});

describe("Opleveren", () => {
  it("stationleesfout → foutmelding met opnieuw laden, geen eindeloze lader", async () => {
    let n = 0;
    m.tabellen = { stations: () => (++n === 1 ? fout : station) };
    wrap(<Opleveren stationId="S1" />);
    await screen.findByText("Station kon niet worden geladen.");
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw laden" }));
    await screen.findByText("Teststation opleveren");
  });
  it("fotoleesfout en wachtrijfout → geen '0' of 'Alles geüpload', knop uit", async () => {
    m.tabellen = { stations: () => station, fotos: () => fout };
    m.wachtrij.mockRejectedValue(new Error("idb"));
    wrap(<Opleveren stationId="S1" />);
    await screen.findByText("Kon niet laden");
    await screen.findByText("Wachtrij op dit toestel onbekend");
    expect(screen.queryByText("Alles geüpload")).toBeNull();
    expect(screen.queryByText(/is compleet/)).toBeNull();
    expect(screen.getByRole("button", { name: /Oplevering versturen/ })).toBeDisabled();
  });
  it("alles bevestigd → telling en knop aan", async () => {
    m.tabellen = { stations: () => station, fotos: () => ({ data: [{ id: "a" }, { id: "b" }], error: null }) };
    wrap(<Opleveren stationId="S1" />);
    await screen.findByText("Alles geüpload");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Oplevering versturen/ })).toBeEnabled();
  });
});

describe("Beoordelen: opdrachtgevers", () => {
  it("leesfout is geen lege lijst en kan opnieuw laden", async () => {
    let n = 0;
    m.tabellen = { opdrachtgevers: () => (++n === 1 ? fout : { data: [{ id: "1", naam: "Liander" }], error: null }) };
    wrap(<Beoordelen />);
    await screen.findByText("Opdrachtgevers konden niet worden geladen.");
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw laden" }));
    await waitFor(() => expect(screen.getByText("Liander")).toBeInTheDocument());
  });
  it("bevestigd leeg toont 'Nog geen opdrachtgevers'", async () => {
    m.tabellen = { opdrachtgevers: () => ({ data: [], error: null }) };
    wrap(<Beoordelen />);
    await screen.findByText("Nog geen opdrachtgevers");
  });
});
