import { describe, expect, it } from "vitest";
import { bouwPreview, parseTsv, startMapping } from "@/lib/case-import";
import { importBatch, previewPagina } from "@/lib/import-batch";
import { valideerCase } from "@/lib/case-validatie";

describe("phase2 import validation and resumed batch outcomes",() => {
  it("invalid row never reserves its number for a later valid row; valid duplicate is skipped",() => {
    const g = [["Nr","Naam"],["x",""],["x","Valid"],["X","Duplicate"]];
    expect(bouwPreview(g,startMapping(g[0]),[]).map(r => r.klasse)).toEqual(["fout","nieuw","bestaat"]);
  });
  it("hidden existing number participates and all 501 preview rows are reachable",() => {
    const g = [["Nr","Naam"],...Array.from({ length:501 },(_,i) => [`${i}`,`Case ${i}`])];
    const p = bouwPreview(g,startMapping(g[0]),["500"]);
    expect(p[500].klasse).toBe("bestaat");
    expect(previewPagina(p,5)[0].casenummer).toBe("500");
    expect(Array.from({ length:6 },(_,i) => previewPagina(p,i)).flat()).toHaveLength(501);
  });
  it("shared limits: number100/name300/WV300/note4000/round50/hold1000/date1990–2100",() => {
    const base = { casenummer:"x".repeat(100),casenaam:"x".repeat(300),wv:"x".repeat(300),notitie:"x".repeat(4000),ronde:50,onHoldReden:"x".repeat(1000),ingediendOp:"2100-12-31" };
    expect(valideerCase(base)).toBeNull();
    for (const [field,n] of [["casenummer",101],["casenaam",301],["wv",301],["notitie",4001],["onHoldReden",1001]] as const) expect(valideerCase({ ...base,[field]:"x".repeat(n) })).toBe("Invoer te lang");
    expect(valideerCase({ ...base,ronde:51 })).toBe("Ongeldige ronde");
    expect(valideerCase({ ...base,ingediendOp:"1989-12-31" })).toBe("Ongeldige datum");
    expect(valideerCase({ ...base,ingediendOp:"2026-02-30" })).toBe("Ongeldige datum");
  });
  it("round3 approved without a date keeps null; unknown status becomes open warning",() => {
    const g = [["Nr","Naam","Ronde","Status","Datum"],["x","Valid","3","goedgekeurd",""],["y","Valid","1","unknown",""]];
    const p = bouwPreview(g,startMapping(g[0]),[]);
    expect(p[0]).toMatchObject({ ronde:3,status:"goedgekeurd",ingediend_op:null });
    expect(p[1]).toMatchObject({ status:"open",klasse:"waarschuwing",ingediend_op:null });
  });
  it("malformed quoted TSV is rejected rather than silently imported",() => {
    expect(() => parseTsv('Nr\tNaam\n1\t"unfinished')).toThrow();
  });
  it("partial failure pauses once, keeps outcomes and retries only remaining rows",async () => {
    const rows = [{ regel:2 },{ regel:3 },{ regel:4 }], written:number[] = [];
    const first = await importBatch(rows,{},async r => { written.push(r.regel); return r.regel === 3 ? { status:"mislukt",fout:"PIN expired",pauze:true } : { status:"aangemaakt",id:"id" }; },() => true,() => {});
    expect(written).toEqual([2,3]); expect(first.gepauzeerd).toBe(true);
    written.length=0;
    const next = await importBatch(rows,first.res,async r => { written.push(r.regel); return { status:r.regel===3 ? "replay" : "bestaat" }; },() => true,() => {});
    expect(written).toEqual([3,4]); expect(next.gepauzeerd).toBe(false);
    expect(Object.values(next.res).map(r => r.status)).toEqual(["aangemaakt","replay","bestaat"]);
  });
  it("offline stops before the next write; thrown response loss stays retryable without false success",async () => {
    let online=true;
    const rows=[{ regel:2 },{ regel:3 }];
    const first = await importBatch(rows,{},async () => { online=false; return { status:"aangemaakt" }; },() => online,() => {});
    expect(Object.keys(first.res)).toEqual(["2"]); expect(first.gepauzeerd).toBe(true);
    const second = await importBatch(rows,first.res,async () => { throw new Error("response lost"); },() => true,() => {});
    expect(second.res[3]).toMatchObject({ status:"mislukt",pauze:true });
    expect(second.res[2].status).toBe("aangemaakt");
  });
});