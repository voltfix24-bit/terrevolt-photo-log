import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toegestaneActies, type BeoordeelFoto } from "@/lib/beoordeling";
import { setBeoordelaar } from "@/pages/Beoordelen";

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

describe("review fase 1 — A: route/filter-context en undo", () => {
  it("PIN await, then route A→B: nothing is sent for A", async () => {
    const pin = uitgesteld<boolean>(); m.pin.mockReturnValue(pin.p); m.queue.push(ok());
    const r = render(tree("s1")); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.keyDown(window, { key: "a" });
    r.rerender(tree("s2")); await screen.findByText("Foto 1 van 3 in deze lijst");
    await act(async () => { pin.los(true); });
    expect(m.calls).toHaveLength(0); expect(m.success).not.toHaveBeenCalled();
  });
  it("RPC committed after A→B: no undo/selection on B; SharePoint update and invalidation use the original station", async () => {
    const rpc = uitgesteld<Rpc>(); m.queue.push(rpc.p);
    const r = render(tree("s1")); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.click(await screen.findByRole("button", { name: /Afkeuring opslaan/ }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    const inval = vi.spyOn(qc, "invalidateQueries");
    r.rerender(tree("s2")); await screen.findByText("Foto 1 van 3 in deze lijst");
    await act(async () => { rpc.los(ok(1, "h-a")); });
    await waitFor(() => expect(m.sync).toHaveBeenCalledWith("s1"));
    expect(m.sync).not.toHaveBeenCalledWith("s2");
    expect(screen.queryByRole("button", { name: /Herstel/ })).toBeNull();
    expect(titel()).toBe("Foto 1 van 3 in deze lijst");
    const keys = inval.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["fotos", "s1"])); expect(keys).toContain(JSON.stringify(["review-fotos", "s1"]));
    expect(keys.some((k) => k.includes("s2"))).toBe(false);
  });
  it("filter switch during the RPC: no selection jump from the stale list", async () => {
    const rpc = uitgesteld<Rpc>(); m.queue.push(rpc.p);
    m.photos = [foto("p1"), foto("p2"), foto("p3"), foto("q1", "approved")];
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Alle foto's/ }));
    fireEvent.click(screen.getAllByRole("option")[3]);
    await act(async () => { rpc.los(ok()); });
    await waitFor(() => expect(m.success).toHaveBeenCalled());
    expect(screen.getByRole("img", { name: "Lips-sloten" }).getAttribute("src")).toContain("q1"); // eigen keuze blijft
  });
});

describe("review fase 1 — B: zichtbare acties en sneltoetsen", () => {
  it("shared permission: open rejection allows only 'afhandelen'", () => {
    expect(toegestaneActies(foto("a", "rejected"), true, false)).toEqual({ goedkeuren: false, afkeuren: false, afhandelen: true });
    expect(toegestaneActies(foto("a", "rejected", { afkeur_afgehandeld_op: "x" }), true, false).goedkeuren).toBe(true);
    expect(toegestaneActies(foto("a"), true, true)).toEqual({ goedkeuren: false, afkeuren: false, afhandelen: false });
  });
  it("A on an open rejection does no approved-RPC; explicit handling keeps rejected + history", async () => {
    m.photos = [foto("r1", "rejected")]; m.controle = { ...m.controle, te_beoordelen: 0, open_afkeuren: 1 };
    m.queue.push(ok(1, "h-af"));
    open(); fireEvent.click(await screen.findByRole("button", { name: /Open afkeuren/ }));
    await screen.findByRole("button", { name: /Afkeur afhandelen/ });
    expect(screen.queryByRole("button", { name: /Foto goedkeuren/ })).toBeNull();
    fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(window, { key: "x" });
    await act(async () => {});
    expect(m.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Afkeur afhandelen/ }));
    fireEvent.change(await screen.findByLabelText("Toelichting afhandeling"), { target: { value: "Vervangen door nieuwe foto" } });
    fireEvent.click(screen.getByRole("button", { name: /Afhandeling opslaan/ }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].body).toMatchObject({ _foto_id: "r1", _besluit: "afgehandeld", _reden: "Vervangen door nieuwe foto" });
    expect(m.photos[0].review_status).toBe("rejected");
  });
  it("shortcuts have no effect on the client-mismatch screen", async () => {
    setBeoordelaar("Liander"); m.station = { ...m.station, opdrachtgever: "Stedin" };
    open(); await screen.findByText(/niet aan Liander opgeleverd/);
    fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(document.body, { key: "a" });
    await act(async () => {});
    expect(m.calls).toHaveLength(0);
  });
  it("shortcuts from a focused thumbnail or another button do nothing", async () => {
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    const thumb = screen.getAllByRole("option")[1]; thumb.focus();
    fireEvent.keyDown(thumb, { key: "a" });
    const rapport = screen.getByRole("button", { name: /Rapport/ }); rapport.focus();
    fireEvent.keyDown(rapport, { key: "a" });
    await act(async () => {});
    expect(m.calls).toHaveLength(0);
  });
});

describe("review fase 1 — C: eerlijke foutmelding", () => {
  it("failed or null reject-RPC: no success, same photo, no SharePoint sync", async () => {
    m.queue.push({ data: null, error: null });
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.click(await screen.findByRole("button", { name: /Afkeuring opslaan/ }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(m.success).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Afkeuring opslaan/ })).toBeTruthy(); // dialoog blijft voor herstel
    expect(screen.getByRole("img", { name: "Lips-sloten", hidden: true }).getAttribute("src")).toContain("p1");
  });
  it("lost response after sending never claims 'nothing changed'", async () => {
    m.queue.push({ gooi: true } as never);
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    const tekst = String(m.error.mock.calls[0][0]);
    expect(tekst).toMatch(/mogelijk wél opgeslagen/); expect(tekst).not.toMatch(/niets gewijzigd/);
    expect(m.success).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
  });
});
