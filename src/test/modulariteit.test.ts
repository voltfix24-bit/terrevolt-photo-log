import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import * as facade from "@/lib/pdf-generator";
import * as sanitize from "@/lib/pdf/sanitize";
import { categorieKlaar } from "@/lib/foto-regels";
import { fotoFout } from "@/lib/foto-validatie";
import { handmatigeSyncToegestaan, syncUitkomst } from "@/lib/opleverketen";
import * as F from "./pdf-fixture";

vi.mock("@/lib/require-pin", () => ({ fotowerkVoorActie: vi.fn(async () => true), BEHEER_NODIG: "Beheer vergrendeld" }));
const queuePhoto = vi.fn();
vi.mock("@/lib/offline-queue", () => ({ queuePhoto: (...a: unknown[]) => queuePhoto(...a) }));
vi.mock("@/lib/fotos-service", () => ({ nieuwPad: vi.fn(), uploadEnRegistreer: vi.fn(), verwijderFoto: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { useStationUpload } from "@/hooks/use-station-upload";

const html = () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
  try { return facade.generatePdfHtml(F.fixtureStation, F.fixtureFotos, F.fixtureBranding, F.fixtureOpm, F.fixtureSkips); }
  finally { vi.useRealTimers(); }
};

describe("pdf-generator na opsplitsen", () => {
  it("geeft exact dezelfde HTML als vóór de opsplitsing", () => {
    expect(html()).toBe(readFileSync("src/test/fixtures/pdf-html.golden.html", "utf8"));
  });
  it("facade exporteert dezelfde veilige helpers", () => {
    expect(facade.escHtml).toBe(sanitize.escHtml);
    expect(facade.veiligeUrl).toBe(sanitize.veiligeUrl);
    expect(facade.veiligHsl).toBe(sanitize.veiligHsl);
  });
  it("laat geen HTML-injectie, javascript:-urls of CSS-injectie door", () => {
    const h = html();
    expect(h).not.toContain("<script>alert(1)</script>");
    expect(h).not.toContain("<img src=x onerror");
    expect(h).not.toContain('b.jpg" onerror');
    expect(h).not.toContain("javascript:");
    expect(h).not.toContain("background:url(x)");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("Jan &amp; &lt;b&gt;Piet&lt;/b&gt;");
  });
  it("behoudt fotovolgorde binnen een categorie", () => {
    const h = html();
    expect(h.indexOf("x.test/a.jpg")).toBeLessThan(h.indexOf("x.test/b.jpg"));
  });
});

describe("fotoregels en validatie", () => {
  it("categorie 31 is klaar met één foto", () => {
    expect(categorieKlaar(31, 0)).toBe(false);
    expect(categorieKlaar(31, 1)).toBe(true);
  });
  it("weigert te grote of verkeerde bestanden", () => {
    expect(fotoFout({ name: "a.jpg", size: 11 * 1024 * 1024, type: "image/jpeg" })).toMatch(/10MB/);
    expect(fotoFout({ name: "a.pdf", size: 10, type: "application/pdf" })).toMatch(/ongeldig/);
    expect(fotoFout({ name: "IMG.HEIC", size: 10, type: "" })).toBeNull();
    expect(fotoFout({ name: "a.jpg", size: 10, type: "image/jpeg" })).toBeNull();
  });
});

describe("offline upload via useStationUpload", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);
  const files = (...f: File[]) => f as unknown as FileList;
  it("zet foto's offline in de wachtrij en meldt mislukte lokale opslag", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    queuePhoto.mockReset().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("QuotaExceeded"));
    const { result } = renderHook(() => useStationUpload("s1", { fotosByCategorie: () => [], isSkipped: () => false, removeSkip: vi.fn() }), { wrapper });
    let mislukt: string[] = [];
    await act(async () => { mislukt = await result.current.handleUpload("Cat", files(new File(["x"], "a.jpg", { type: "image/jpeg" }), new File(["x"], "b.jpg", { type: "image/jpeg" }))); });
    expect(queuePhoto).toHaveBeenCalledTimes(2);
    expect(mislukt).toEqual(["b.jpg"]);
    online.mockRestore();
  });
});

describe("SharePoint-knop tijdens opleverketen", () => {
  it("handmatige sync alleen zonder actieve run", () => {
    expect(handmatigeSyncToegestaan(null)).toBe(true);
    expect(handmatigeSyncToegestaan({ status: "afgerond" })).toBe(true);
    expect(handmatigeSyncToegestaan({ status: "mislukt" })).toBe(true);
    for (const s of ["aangevraagd", "pdf_bezig", "pdf_klaar", "sharepoint_bezig", "wacht_op_retry", "wacht_op_casegegevens"]) expect(handmatigeSyncToegestaan({ status: s })).toBe(false);
  });
  it("toont alleen succes bij bevestigde sync", () => {
    expect(syncUitkomst({ ok: true, aantal_bestanden: 3 }, null)).toBe("gelukt");
    expect(syncUitkomst({ ok: true, overgeslagen: "case ontbreekt" }, null)).toBe("overgeslagen");
    expect(syncUitkomst(null, { context: { status: 409 } })).toBe("bezig");
    expect(syncUitkomst(null, { context: { status: 500 } })).toBe("mislukt");
    expect(syncUitkomst({}, null)).toBe("mislukt");
  });
});
