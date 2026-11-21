import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { geldigeSelectie, inFilter, sneltoetsToegestaan, volgendeNaBesluit, eindcontroleOk, type BeoordeelFoto } from "@/lib/beoordeling";

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
      const r = (m.queue.shift() ?? { data: { ok: false, reden: "gewijzigd" }, error: null }) as Rpc;
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
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><BeoordeelDossier stationId="s1" /></MemoryRouter></QueryClientProvider>);
const titel = () => screen.getByText(/Foto \d+ van \d+ in deze lijst/).textContent;
const regio = () => screen.getByTestId("beoordeel-regio");

beforeEach(() => {
  cleanup(); localStorage.clear(); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  m.photos = [foto("p1"), foto("p2"), foto("p3")]; m.skips = []; m.calls = []; m.queue = []; m.fail.clear();
  m.station = { id: "s1", naam_msr: "Fictief", status: "opgeleverd", submitted_at: "2026-01-01", opdrachtgever: null, uitvoerder: "terrevolt" };
  m.controle = { station_status: "opgeleverd", te_beoordelen: 3, open_afkeuren: 0, afgehandelde_afkeuren: 0, goedgekeurd: 0, ontbrekend: [] };
  m.pin.mockReset().mockResolvedValue(true); m.sync.mockReset().mockResolvedValue(true); m.success.mockClear(); m.error.mockClear();
});

describe("beoordelingsregels", () => {
  it("selection stays inside the active filter and clears for an empty filter", () => {
    const l = [foto("a"), foto("b")];
    expect(geldigeSelectie(l, "b")).toBe("b"); expect(geldigeSelectie(l, "x")).toBe("a"); expect(geldigeSelectie([], "a")).toBeNull();
  });
  it("next photo after decision stays in the work list; last one ends the pending list", () => {
    const l = [foto("a"), foto("b"), foto("c")];
    expect(volgendeNaBesluit(l, "b", foto("b", "approved"), "pending")).toBe("c");
    expect(volgendeNaBesluit(l, "c", foto("c", "rejected"), "pending")).toBe("b");
    expect(volgendeNaBesluit([foto("a")], "a", foto("a", "approved"), "pending")).toBeNull();
  });
  it("resolved rejections are history, never inferred from another approved photo", () => {
    expect(inFilter(foto("a", "rejected"), "rejected")).toBe(true);
    expect(inFilter(foto("a", "rejected", { afkeur_afgehandeld_op: "x" }), "historie")).toBe(true);
    expect(inFilter(foto("a", "rejected", { afkeur_afgehandeld_op: "x" }), "rejected")).toBe(false);
  });
  it("shortcuts ignore inputs, modifiers, IME, repeats and dialogs", () => {
    const input = document.createElement("input"); document.body.append(input);
    const base = { key: "a", repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body as EventTarget };
    const regio = document.createElement("div"); document.body.append(regio);
    expect(sneltoetsToegestaan(base, regio, false)).toBe(true);
    expect(sneltoetsToegestaan(base, null, false)).toBe(false); // review: zonder zichtbare reviewregio nooit
    for (const p of [{ target: input }, { ctrlKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }]) expect(sneltoetsToegestaan({ ...base, ...p }, regio, false)).toBe(false);
    expect(sneltoetsToegestaan(base, regio, true)).toBe(false);
    const buiten = document.createElement("button"); document.body.append(buiten);
    expect(sneltoetsToegestaan({ ...base, target: buiten }, document.createElement("div"), false)).toBe(false);
  });
  it("final check requires delivered dossier without pending, open rejections or missing parts; all-N.v.t. is valid", () => {
    const c = { station_status: "opgeleverd", te_beoordelen: 0, open_afkeuren: 0, afgehandelde_afkeuren: 2, goedgekeurd: 0, ontbrekend: [] };
    expect(eindcontroleOk(c)).toBe(true);
    expect(eindcontroleOk({ ...c, open_afkeuren: 1 })).toBe(false); expect(eindcontroleOk({ ...c, ontbrekend: ["X"] })).toBe(false);
    expect(eindcontroleOk({ ...c, station_status: "in uitvoering" })).toBe(false); expect(eindcontroleOk(undefined)).toBe(false);
  });
});

describe("BeoordeelDossier", () => {
  it("approval goes to the next photo only after confirmed save", async () => {
    m.queue.push(ok());
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0].body).toMatchObject({ _foto_id: "p1", _verwacht_versie: 0, _besluit: "approved" });
    await waitFor(() => expect(titel()).toBe("Foto 1 van 2 in deze lijst"));
    expect(screen.getByRole("img", { name: "Lips-sloten" }).getAttribute("src")).toContain("p2");
    expect(m.success).toHaveBeenCalledWith("Foto goedgekeurd");
  });
  it("failed or zero-effect save keeps the same photo selected and shows a recovery message", async () => {
    m.queue.push({ data: { ok: false, reden: "gewijzigd" }, error: null });
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    await waitFor(() => expect(m.error).toHaveBeenCalled());
    expect(String(m.error.mock.calls[0][0])).toMatch(/collega/);
    expect(screen.getByRole("img", { name: "Lips-sloten" }).getAttribute("src")).toContain("p1");
    expect(m.success).not.toHaveBeenCalled();
  });
  it("rapid double A / repeat during PIN await writes once", async () => {
    let los!: (v: boolean) => void; m.pin.mockReturnValue(new Promise<boolean>((r) => { los = r; })); m.queue.push(ok());
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(window, { key: "a" }); fireEvent.keyDown(window, { key: "a", repeat: true });
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    await act(async () => { los(true); });
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.pin).toHaveBeenCalledTimes(1);
  });
  it("rejection followed by A cannot approve the rejected photo", async () => {
    m.queue.push(ok(1, "h-rej"), ok(1, "h-app"));
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.click(await screen.findByRole("button", { name: /Afkeuring opslaan/ }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    await waitFor(() => expect(titel()).toBe("Foto 1 van 2 in deze lijst"));
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => expect(m.calls).toHaveLength(2));
    expect(m.calls[1].body._foto_id).toBe("p2");
  });
  it("Enter never finalizes globally; finalization blocked while final check fails", async () => {
    m.photos = [foto("p1", "approved")]; m.controle = { ...m.controle, te_beoordelen: 0, open_afkeuren: 1 };
    open(); await screen.findByText("Alle foto's zijn beoordeeld");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(m.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Dossier afronden…" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("1 afkeur(en) nog niet afgehandeld")).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: "Dossier afronden" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("valid all-N.v.t. dossier without photos can be finalized; server rejection is no success", async () => {
    m.photos = []; m.skips = [{ categorie: "Lips-sloten", reden: "Niet aanwezig" }]; m.controle = { ...m.controle, te_beoordelen: 0 };
    m.queue.push({ data: { ok: false, reden: "eindcontrole" }, error: null }, { data: { ok: true }, error: null });
    open(); await screen.findByText("Dit dossier heeft geen foto's");
    fireEvent.click(screen.getByRole("button", { name: "Eindcontrole bekijken" }));
    const knop = await screen.findByRole("button", { name: "Dossier afronden" });
    await waitFor(() => expect((knop as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(knop);
    await waitFor(() => expect(m.error).toHaveBeenCalled()); expect(m.success).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dossier afronden" }));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Dossier afgerond en goedgekeurd"));
    expect(m.calls.map((c) => c.name)).toEqual(["dossier_afronden", "dossier_afronden"]);
  });
  it.each(["fotos", "categorie_skips", "controle"])("read error on %s blocks review and finalization", async (bron) => {
    m.fail.add(bron);
    open(); await screen.findByText("Dossier kon niet volledig worden geladen");
    expect(screen.queryByRole("button", { name: /Foto goedkeuren/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Dossier afronden/ })).toBeNull();
  });
  it("filter to zero photos removes old selection and actions", async () => {
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Goedgekeurd/ }));
    expect(await screen.findByText("Geen foto's in deze selectie")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Foto goedkeuren/ })).toBeNull();
    fireEvent.keyDown(window, { key: "a" }); expect(m.calls).toHaveLength(0);
  });
  it("undo of own last decision calls the guarded restore; concurrent change reports and keeps nothing claimed", async () => {
    m.queue.push(ok(1, "h1"), { data: { ok: false, reden: "gewijzigd" }, error: null });
    open(); await screen.findByText("Foto 1 van 3 in deze lijst");
    fireEvent.click(screen.getByRole("button", { name: /Foto goedkeuren/ }));
    const herstel = await screen.findByRole("button", { name: /Herstel goedkeuring/ });
    fireEvent.click(herstel);
    await waitFor(() => expect(m.calls[1]).toEqual({ name: "foto_beoordeling_herstellen", body: { _beoordeling_id: "h1" } }));
    await waitFor(() => expect(m.error.mock.calls.some((c) => /collega/.test(String(c[0])))).toBe(true));
    expect(m.success).not.toHaveBeenCalledWith(expect.stringMatching(/hersteld/));
  });
  it("30 mixed photos keep counts, selection and focus after decisions", async () => {
    m.photos = Array.from({ length: 30 }, (_, i) => foto(`f${i}`, i % 3 === 0 ? "approved" : i % 3 === 1 ? "pending" : "rejected"));
    m.queue.push(ok(1, "a"), ok(1, "b"));
    open(); await screen.findByText("Foto 1 van 10 in deze lijst");
    expect(screen.getByRole("button", { name: /Open afkeuren/ }).textContent).toContain("10");
    fireEvent.keyDown(window, { key: "ArrowRight" }); fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(titel()).toBe("Foto 3 van 10 in deze lijst");
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => expect(titel()).toBe("Foto 3 van 9 in deze lijst"));
    expect(m.calls[0].body._foto_id).toBe("f7");
    expect(screen.getByRole("img", { name: "Lips-sloten" }).getAttribute("src")).toContain("f10");
    await waitFor(() => expect(document.activeElement).toBe(regio()));
    expect(screen.getByRole("button", { name: /Te beoordelen/ }).textContent).toContain("9");
  });
});
