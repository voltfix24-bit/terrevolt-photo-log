import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CATEGORIES, getApplicableCategories } from "@/lib/categories";
import { minFotos } from "@/lib/foto-regels";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke: vi.fn() }, auth: { setSession: vi.fn() } } }));
import { heeftBeheerSessie, vergrendelBeheer } from "@/lib/require-pin";

describe("phase 1 client/server contracts", () => {
  it("server refusal and network error never grant client authority", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null }); expect(await heeftBeheerSessie()).toBe(false);
    rpc.mockResolvedValueOnce({ data: true, error: { message: "Unavailable" } }); expect(await heeftBeheerSessie()).toBe(false);
    expect(rpc).toHaveBeenCalledWith("heeft_beheer");
  });
  it("lock is server-side and reports failure when not confirmed", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }); expect(await vergrendelBeheer()).toBe(true);
    expect(rpc).toHaveBeenCalledWith("beheer_vergrendelen");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Offline" } }); expect(await vergrendelBeheer()).toBe(false);
  });
  it("SQL required-photo rules match every central category, including 31 minimum one", () => {
    const sql = readFileSync("drizzle/migrations/0017_photo_rules_exact_categories.sql", "utf8");
    for (const c of CATEGORIES) expect(sql).toContain(`(${c.id}, '${c.name.replace(/'/g, "''")}', ${minFotos(c.id)})`);
    expect(minFotos(31)).toBe(1);
    const compact = getApplicableCategories({ type_ruimte: "Compact Station", vermogensveld: false, da_kast: false });
    expect(compact.some(c => c.id === 14 || c.id === 15)).toBe(false);
  });
});