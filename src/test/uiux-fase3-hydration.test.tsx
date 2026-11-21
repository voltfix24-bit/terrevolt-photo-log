// Review fase 2, punt 6: verouderde categoriereads nemen geen state of object-URL-referenties over.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const m = vi.hoisted(() => ({ reads: [] as { station: string; cat: string; los: (r: unknown[]) => void }[] }));
vi.mock("@/lib/offline-queue", () => ({
  QUEUE_EVENT: "foto-wachtrij-veranderd",
  getCategorieItems: (station: string, cat: string) => new Promise((los) => m.reads.push({ station, cat, los })),
}));
import { useWachtrijCategorie, _previewUrls } from "@/hooks/use-wachtrij-categorie";

const item = (id: string, cat: string) => ({ id, stationId: "S", categorie: cat, file: new Blob(["x"]), fileName: "f.jpg", timestamp: "2026-01-01", status: "pending", pad: `p/${id}` });
globalThis.URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`); globalThis.URL.revokeObjectURL = vi.fn();

describe("useWachtrijCategorie contextgeneratie", () => {
  it("A-read starts → switch to B → B-read resolves → A-read resolves: only B is shown", async () => {
    const { result, rerender } = renderHook(({ cat }) => useWachtrijCategorie("S", cat), { initialProps: { cat: "A" } });
    rerender({ cat: "B" });
    expect(result.current.items).toEqual([]); // nooit oude tegels na wissel
    const a = m.reads.find((r) => r.cat === "A")!; const b = m.reads.find((r) => r.cat === "B")!;
    await act(async () => { b.los([item("b1", "B")]); });
    await act(async () => { a.los([item("a1", "A"), item("a2", "A")]); });
    expect(result.current.items.map((i) => i.id)).toEqual(["b1"]); // telt dus ook voor CTA/N.v.t. alleen B
    expect(_previewUrls.has("a1")).toBe(false); expect(_previewUrls.has("a2")).toBe(false);
  });

  it("unmount before the read resolves takes no object-URL references", async () => {
    m.reads.length = 0;
    const { unmount } = renderHook(() => useWachtrijCategorie("S", "C"));
    unmount();
    await act(async () => { m.reads[0].los([item("c1", "C")]); });
    expect(_previewUrls.has("c1")).toBe(false);
  });
});
