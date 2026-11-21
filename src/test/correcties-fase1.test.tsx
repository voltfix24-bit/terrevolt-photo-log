import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mock = vi.hoisted(() => ({
  note: vi.fn(), pin: vi.fn(), sync: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn(),
  photos: [] as { id: string; categorie: string; url: string; review_status: string }[],
  writes: [] as { table: string; patch: Record<string, unknown>; filters: Record<string, string> }[],
  responses: [] as { data: { id: string }[]; error: null }[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (_name: string, body: unknown) => mock.note(body),
  from: (table: string) => ({ update: (patch: Record<string, unknown>) => {
    const filters: Record<string, string> = {};
    const builder = { eq: (key: string, value: string) => { filters[key] = value; return builder; },
      select: () => { mock.writes.push({ table, patch, filters }); return Promise.resolve(mock.responses.shift() ?? { data: [], error: null }); } };
    return builder;
  } }),
} }));
vi.mock("@/lib/require-pin", () => ({ zorgVoorBeheer: mock.pin, BEHEER_NODIG: "Beheer verlopen" }));
vi.mock("@/lib/station-service", () => ({ sharepointStatusBijwerken: mock.sync }));
vi.mock("sonner", () => ({ toast: { error: mock.error, success: mock.success } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/pages/Beoordelen", () => ({ getBeoordelaar: () => "Lokaal" }));
vi.mock("yet-another-react-lightbox", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mock.refresh }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "station"
    ? { id: "station", naam_msr: "Fixture", status: "opgeleverd", submitted_at: null, opdrachtgever: "Lokaal" }
    : queryKey[0] === "review-fotos" ? mock.photos : queryKey[0] === "categorie-skips" ? [{ categorie: "Test", reden: "Niet aanwezig" }] : [] }),
}));

import { bewaarNotitie, lokaleNotitie, lokaleNotitieStatus, verstuurNotities, verstuurNotitiesNaBeheer } from "@/lib/notities";
import { NotitieSheet } from "@/components/NotitieSheet";
import BeoordeelDossier from "@/pages/BeoordeelDossier";

const note = { stationId: "station", categorie: "Test", tekst: "Bewaar deze tekst" };
beforeEach(() => {
  cleanup(); vi.restoreAllMocks(); localStorage.clear();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mock.note.mockReset().mockResolvedValue({ data: true, error: null });
  mock.pin.mockReset().mockResolvedValue(true); mock.sync.mockReset().mockResolvedValue(true);
  mock.refresh.mockClear(); mock.success.mockClear(); mock.error.mockClear(); mock.writes = []; mock.responses = [];
  mock.photos = [{ id: "p1", categorie: "Test", url: "https://example.test/1.jpg", review_status: "pending" },
    { id: "p2", categorie: "Test", url: "https://example.test/2.jpg", review_status: "pending" }];
});

describe("notitieherstel zonder achtergrond-PIN", () => {
  it("retains authorization reason on reload and network recovery; unlock retries without text loss", async () => {
    mock.note.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await bewaarNotitie(note)).toBe("beheer");
    expect(lokaleNotitieStatus(note.stationId, note.categorie)).toBe("beheer");
    expect(await verstuurNotities()).toBe(0);
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe(note.tekst);
    expect(mock.pin).not.toHaveBeenCalled();
    mock.note.mockResolvedValue({ data: true, error: null });
    expect(await verstuurNotitiesNaBeheer()).toBe(1);
    expect(lokaleNotitie(note.stationId, note.categorie)).toBeUndefined();
    expect(mock.note).toHaveBeenLastCalledWith(expect.objectContaining({ _tekst: note.tekst }));
  });
  it("unlock during an in-flight denial causes a fresh retry, rather than reusing failed work", async () => {
    let complete: ((v: unknown) => void) | undefined;
    mock.note.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const saving = bewaarNotitie(note);
    const recovery = verstuurNotitiesNaBeheer();
    complete?.({ data: null, error: { code: "42501" } });
    await saving; expect(await recovery).toBe(1);
    expect(mock.note).toHaveBeenCalledTimes(2);
    expect(lokaleNotitie(note.stationId, note.categorie)).toBeUndefined();
    expect(mock.pin).not.toHaveBeenCalled();
  });
  it("explicit sheet unlock flushes the durable text; cancelling a denial never overwrites it", async () => {
    mock.note.mockResolvedValue({ data: null, error: { code: "42501" } });
    await bewaarNotitie(note);
    const onClose = vi.fn(); const onSave = vi.fn(async (tekst: string) => bewaarNotitie({ ...note, tekst }));
    const props = { soort: "notitie" as const, titel: "Notitie", begin: note.tekst, stationId: note.stationId, categorie: note.categorie, onClose, onSave };
    const view = render(<NotitieSheet {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Annuleren" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(lokaleNotitie(note.stationId, note.categorie)).toBe(note.tekst);
    view.unmount(); render(<NotitieSheet {...props} />);
    mock.note.mockResolvedValue({ data: true, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Beheer ontgrendelen" }));
    await waitFor(() => expect(lokaleNotitie(note.stationId, note.categorie)).toBeUndefined());
    expect(mock.pin).toHaveBeenCalledTimes(1);
  });
});

describe("beoordeling vereist geraakte doelrijen", () => {
  const open = () => render(<MemoryRouter><BeoordeelDossier stationId="station" /></MemoryRouter>);
  it("zero approved photo rows never advances to the next photo", async () => {
    open(); fireEvent.click(await screen.findByRole("button", { name: "Keur goed" }));
    await waitFor(() => expect(mock.writes).toHaveLength(1));
    expect(mock.refresh).not.toHaveBeenCalled();
    mock.responses.push({ data: [{ id: "p1" }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Keur goed" }));
    await waitFor(() => expect(mock.writes).toHaveLength(2));
    expect(mock.writes[1].filters).toEqual({ id: "p1", station_id: "station" });
  });
  it.each([false, true])("rejection stops before sync when photo succeeds=%s but a required row is missing", async photoOk => {
    if (photoOk) mock.responses.push({ data: [{ id: "p1" }], error: null });
    open(); fireEvent.click(await screen.findByRole("button", { name: "Afkeuren" }));
    const buttons = await screen.findAllByRole("button", { name: "Afkeuren" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(mock.writes).toHaveLength(photoOk ? 2 : 1));
    expect(mock.sync).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it.each([false, true])("zero-photo/NVT dossier requires only its station row (row succeeds=%s)", async ok => {
    mock.photos = [];
    if (ok) mock.responses.push({ data: [{ id: "station" }], error: null });
    open(); fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(mock.writes).toHaveLength(1));
    expect(mock.writes[0].table).toBe("stations");
    if (ok) await waitFor(() => expect(mock.sync).toHaveBeenCalledWith("station"));
    else { expect(mock.sync).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); }
  });
});