import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vereisteCheck, ONBEVESTIGD_TEKST, type BeoordeelFoto } from "@/lib/beoordeling";

type Rpc = { data: unknown; error: { code?: string } | null };
const m = vi.hoisted(() => ({
  photos: [] as Record<string, unknown>[], skips: [] as Record<string, unknown>[],
  station: {} as Record<string, unknown>, controle: {} as Record<string, unknown>,
  calls: [] as { name: string; body: Record<string, unknown> }[],
  queue: [] as (Rpc | Promise<Rpc>)[], pin: vi.fn(), sync: vi.fn(), success: vi.fn(), error: vi.fn(),
  fail: new Set<string>(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const res = () => m.fail.has(table) ? { data: null, error: { message: "fout" } }
      : { data: table === "stations" ? m.station : table === "fotos" ? m.photos : table === "categorie_skips" ? m.skips : [], error: null };
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) b[k] = () => b;
    b.single = () => Promise.resolve(res());
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko);
    return b;
  };
  return { supabase: {
    from: builder,
    rpc: (name: string, body: Record<string, unknown>) => {
      if (name === "dossier_eindcontrole") return Promise.resolve(m.fail.has("controle") ? { data: null, error: { message: "x" } } : { data: m.controle, error: null });
      m.calls.push({ name, body });
      const q = m.queue.shift() ?? { data: { ok: false, reden: "gewijzigd" }, error: null };
      if (q instanceof Promise) return q;
      if ((q as { gooi?: boolean }).gooi) return Promise.reject(new Error("Failed to fetch"));
      const r = q as Rpc;
      const d = r.data as { ok?: boolean; versie?: number } | null;
      // De fictieve server past de rij pas aan bij een geslaagde beslissing.
      if (name === "foto_beoordelen" && d?.ok && body._besluit !== "afgehandeld") m.photos = m.photos.map((f) => f.id === body._foto_id ? { ...f, review_status: body._besluit, review_versie: d.versie } : f);
      return Promise.resolve(r);
    },
    functions: { invoke: vi.fn() },
  } };
});
vi.mock("@/lib/require-pin", () => ({ zorgVoorBeheer: m.pin, BEHEER_NODIG: "Beheer verlopen" }));
vi.mock("@/lib/station-service", () => ({ sharepointStatusBijwerken: m.sync }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: m.error, success: m.success }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("yet-another-react-lightbox", () => ({ default: () => null }));
vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({ default: {} }));

import BeoordeelDossier from "@/pages/BeoordeelDossier";

const foto = (id: string, status = "pending", extra: Partial<BeoordeelFoto> = {}): BeoordeelFoto => ({ id, categorie: "Lips-sloten", url: `https://example.test/${id}.jpg`, created_at: null, review_status: status, review_reden: status === "rejected" ? "Onscherp" : null, review_versie: 0, afkeur_afgehandeld_op: null, afkeur_afgehandeld_toelichting: null, gps_afstand_m: null, scherpte: null, ...extra });
const ok = (versie = 1, id = "h1"): Rpc => ({ data: { ok: true, beoordeling_id: id, versie }, error: null });
const tree = (sid: string) => (<QueryClientProvider client={qc}><MemoryRouter><BeoordeelDossier key={sid} stationId={sid} /></MemoryRouter></QueryClientProvider>);
let qc = new QueryClient();
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><BeoordeelDossier stationId="s1" /></MemoryRouter></QueryClientProvider>);
const titel = () => screen.getByText(/Foto \d+ van \d+ in deze lijst/).textContent;
const regio = () => screen.getByTestId("beoordeel-regio");

beforeEach(() => {
  cleanup(); localStorage.clear(); qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  m.photos = [foto("p1"), foto("p2"), foto("p3")]; m.skips = []; m.calls = []; m.queue = []; m.fail.clear();
  m.station = { id: "s1", naam_msr: "Fictief", status: "opgeleverd", submitted_at: "2026-01-01", opdrachtgever: null, uitvoerder: "terrevolt" };
  m.controle = { station_status: "opgeleverd", te_beoordelen: 3, open_afkeuren: 0, afgehandelde_afkeuren: 0, goedgekeurd: 0, ontbrekend: [] };
  m.pin.mockReset().mockResolvedValue(true); m.sync.mockReset().mockResolvedValue(true); m.success.mockClear(); m.error.mockClear();
});



const uitgesteld = <T,>() => { let los!: (v: T) => void; const p = new Promise<T>((r) => { los = r; }); return { p, los }; };
const imgSrc = () => screen.getByRole("img", { name: "Lips-sloten" }).getAttribute("src");

describe("1. actuele filter- en fotokeuze", () => {
  it("delayed PIN + filter switch: no stale RPC", async () => {
    const pin = uitgesteld<boolean>(); m.pin.mockReturnValue(pin.p); m.queue.push(ok());
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    fireEvent.click(screen.getByRole("button", { name: /Alle foto's/ }));
    await act(async () => { pin.los(true); });
    expect(m.calls).toHaveLength(0); expect(m.success).not.toHaveBeenCalled();
  });
  it("delayed PIN + other photo chosen: no stale RPC", async () => {
    const pin = uitgesteld<boolean>(); m.pin.mockReturnValue(pin.p); m.queue.push(ok());
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    fireEvent.click(screen.getAllByRole("option")[2]);
    await act(async () => { pin.los(true); });
    expect(m.calls).toHaveLength(0);
    expect(imgSrc()).toContain("p3");
  });
  it("delayed undo RPC + filter switch: user's filter stays", async () => {
    const rpc = uitgesteld<Rpc>(); m.queue.push(ok(1, "h1"), rpc.p);
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Herstel goedkeuring/ }));
    await waitFor(() => expect(m.calls).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /Goedgekeurd/ }));
    await screen.findByText("Foto 1 van 1 in deze lijst");
    await act(async () => { rpc.los({ data: { ok: true }, error: null }); });
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Laatste goedkeuring hersteld"));
    expect(titel()).toBe("Foto 1 van 1 in deze lijst");
    expect(screen.queryByRole("button", { name: /Herstel goedkeuring/ })).toBeNull(); // voltooide undo gewist
  });
  it("delayed undo RPC + other photo chosen: user's selection stays", async () => {
    const rpc = uitgesteld<Rpc>(); m.queue.push(ok(1, "h1"), rpc.p);
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Herstel goedkeuring/ }));
    await waitFor(() => expect(m.calls).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(imgSrc()).toContain("p3");
    await act(async () => { rpc.los({ data: { ok: true }, error: null }); });
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Laatste goedkeuring hersteld"));
    expect(imgSrc()).toContain("p3");
  });
});

describe("2. eindcontrole", () => {
  it("pending photos: neutral unfinished line, never the approval text", () => {
    const r = vereisteCheck({ ontbrekend: [], te_beoordelen: 65 });
    expect(r.ok).toBe(false); expect(r.neutraal).toBe(true); expect(r.tekst).toBe("De aanwezige foto's moeten nog worden beoordeeld");
  });
  it("fully reviewed and nothing missing: approval text; missing parts stay visible", () => {
    expect(vereisteCheck({ ontbrekend: [], te_beoordelen: 0 })).toEqual({ ok: true, tekst: "Alle vereiste onderdelen hebben een goedgekeurde foto of N.v.t." });
    expect(vereisteCheck({ ontbrekend: ["Trafo"], te_beoordelen: 3 })).toMatchObject({ ok: false, tekst: "Ontbreekt: Trafo" });
  });
});

describe("3. onbevestigde undo en afronding", () => {
  const netwerk = { data: null, error: { message: "Failed to fetch" } } as Rpc;
  it("undo with network error without code: unconfirmed, no claim it was not restored", async () => {
    m.queue.push(ok(1, "h1"), netwerk);
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Herstel goedkeuring/ }));
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(ONBEVESTIGD_TEKST));
    expect(m.error.mock.calls.some((c) => /Niet hersteld/.test(String(c[0])))).toBe(false);
  });
  it("finalize with network error without code: unconfirmed, no claim it was not finalized", async () => {
    m.photos = []; m.skips = [{ categorie: "Lips-sloten", reden: "Niet aanwezig" }]; m.controle = { ...m.controle, te_beoordelen: 0 };
    m.queue.push(netwerk);
    open(); await screen.findByText("Dit dossier heeft geen foto's");
    fireEvent.click(screen.getByRole("button", { name: "Eindcontrole bekijken" }));
    const knop = await screen.findByRole("button", { name: "Dossier afronden" });
    await waitFor(() => expect((knop as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(knop);
    await waitFor(() => expect(m.error).toHaveBeenCalledWith(ONBEVESTIGD_TEKST));
    expect(m.error.mock.calls.some((c) => /niet afgerond/.test(String(c[0])))).toBe(false);
    expect(m.success).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
  });
});
