import { describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";
import { balVan, scoreVan, scorePerUitvoerder, type CaseItem, type ToRonde, type Uitvoerder } from "@/lib/to-rondes";
import { casePresentatie, indieningTekst } from "@/lib/case-presentatie";
import { bordItems } from "@/lib/bord-groepen";
import { amsterdamDatum, dagenZonderHold, HOLD_PARTIJEN, type HoldPeriode } from "@/lib/on-hold";
import { leesAllePaginas } from "@/lib/paged-read";
import { resterendeImport } from "@/lib/import-batch";
import { CASE_QUERY_ROOTS, CaseQueryClient, verbindCaseInvalidatie } from "@/lib/case-queries";
import { QueryClient } from "@tanstack/react-query";
import { getDB, getQueueCount, getQueueCounts, getPendingPhotos, markDone, markError, queuePhoto, QUEUE_EVENT, clearDone } from "@/lib/offline-queue";

const ronde = (status: ToRonde["status"], nummer = 1): ToRonde => ({ id: `r${nummer}`, station_id: "s", nummer, status, ingediend_op: null, ingediend_bij: "Liander", reactie_op: null, redenen: [], notitie: null, to_acties: [] });
function fixture(status: ToRonde["status"], n = 1, uitvoerder: Uitvoerder = "van_gelder"): CaseItem {
  const rondes = Array.from({ length: n }, (_,i) => ronde(i===n-1 ? status : "afgekeurd",i+1));
  const station = { id: "s", uitvoerder, dossier_status: "ingediend" };
  return { station, rondes, last: rondes[n-1], bal: balVan(station,rondes) };
}
describe("phase3 shared board/detail/score rules", () => {
  it("duplicate invalidation preserves own failed-request replay, not other existing or changed rows", () => {
    const rows = [{ regel:1,klasse:"bestaat" },{ regel:2,klasse:"bestaat" },{ regel:3,klasse:"fout" },{ regel:4,klasse:"nieuw" }];
    const res = { 1:{ status:"mislukt" as const },2:{ status:"bestaat" as const } };
    expect(resterendeImport(rows,res,r => r.regel===1).map(r => r.regel)).toEqual([1,4]);
    expect(resterendeImport(rows,res,() => false).map(r => r.regel)).toEqual([4]);
  });
  for (const status of ["open","controle","afgekeurd","goedgekeurd"] as const) it(`VG ${status} uses the same responsible party everywhere without inventing a date`, () => {
    const c = fixture(status);
    expect(casePresentatie(c).partijen).toEqual([status==="goedgekeurd" ? "Liander" : "Van Gelder"]);
    expect(bordItems([c]).map(b => b.lane)).toEqual(casePresentatie(c).partijen);
    expect(c.last?.ingediend_bij).toBe("Liander");
    expect(c.last?.ingediend_op).toBeNull();
    expect(indieningTekst(c.last)).toBe(status==="open" ? "Nog niet ingediend" : "Indieningsdatum onbekend");
  });
  it("VG rejected with three actions retains all actual owners; hold produces one card then restores actions", () => {
    const c = fixture("afgekeurd");
    c.bal = ["TerreVolt","Liander","Derden"].map(wie => ({ wie: wie as never, label: wie, txt: `Actie ${wie}`, dagen: 0 }));
    expect(bordItems([c]).map(b => [b.lane,b.wie])).toEqual([["Van Gelder","TerreVolt"],["Van Gelder","Liander"],["Van Gelder","Derden"]]);
    for (const p of HOLD_PARTIJEN) {
      c.station.on_hold = true; c.station.on_hold_partij = p;
      expect(bordItems([c])).toHaveLength(1);
      expect(bordItems([c])[0].lane).toBe(casePresentatie(c).partijen[0]);
      expect(c.bal).toHaveLength(3);
    }
    c.station.on_hold = false;
    expect(bordItems([c])).toHaveLength(3);
    c.station.dossier_status = "afgerond";
    expect(bordItems([c])).toEqual([]);
  });
  it("TV one submission FTR100 avg1; VG three submissions FTR0 avg3; combined uses counts", () => {
    const tv = fixture("goedgekeurd",1,"terrevolt"), vg = fixture("goedgekeurd",3);
    expect(scorePerUitvoerder([tv,vg]).map(s => [s.ftrPct,s.gemIndieningen])).toEqual([[100,1],[0,3]]);
    expect(scoreVan([tv,vg]).gemIndieningen).toBe(2);
    const more = [tv,fixture("goedgekeurd",1,"terrevolt"),vg];
    expect(scoreVan(more).ftrPct).toBe(67);
  });
  it("1001 rows beyond four server pages remain in scores and counts", async () => {
    const rows = Array.from({ length:1001 },(_,i) => ({ id:String(i).padStart(5,"0"), ...fixture(i===1000 ? "goedgekeurd" : "open") }));
    rows.forEach((r,i) => { r.id = String(i).padStart(5,"0"); });
    const pages = vi.fn(async (after: string | null,size: number) => rows.filter(r => !after || r.id>after).slice(0,size));
    const all = await leesAllePaginas(pages);
    expect(all).toHaveLength(1001); expect(pages).toHaveBeenCalledTimes(5);
    expect(scoreVan(all)).toEqual(scoreVan(rows)); expect(scoreVan(all).goedgekeurdN).toBe(1);
  });
  it("existing station/case invalidation fans out to detail, summary, WV, duplicate and resolver roots", async () => {
    const qc = new QueryClient(); const stop = verbindCaseInvalidatie(qc);
    for (const root of CASE_QUERY_ROOTS) qc.setQueryData([root,"fixture"],{});
    await qc.invalidateQueries({ queryKey:["station"] });
    for (const root of CASE_QUERY_ROOTS) expect(qc.getQueryState([root,"fixture"])?.isInvalidated).toBe(true);
    stop(); qc.clear();
  });
  it("cold detail mutation invalidates detail even if cases/stations were never mounted", async () => {
    const qc = new CaseQueryClient(); qc.setQueryData(["case-detail","s"],{});
    await qc.invalidateQueries({ queryKey:["cases"] });
    expect(qc.getQueryState(["case-detail","s"])?.isInvalidated).toBe(true); qc.clear();
  });
});
describe("historical hold interval union, Amsterdam calendar", () => {
  const h = (begin_op: string,einde_op: string | null): HoldPeriode => ({ id:begin_op,begin_op,einde_op });
  it("Nov1 submission minus Nov10–20 hold gives 9 active days before and after resume", () => {
    expect(dagenZonderHold("2026-11-01",null,{ hold_periodes:[h("2026-11-10",null)] },"2026-11-20")).toBe(9);
    expect(dagenZonderHold("2026-11-01",null,{ on_hold:false,hold_periodes:[h("2026-11-10","2026-11-20")] },"2026-11-20")).toBe(9);
  });
  it("two periods and overlapping periods subtract only measured overlap once", () => {
    expect(dagenZonderHold("2026-11-01","2026-11-20",{ hold_periodes:[h("2026-11-03","2026-11-05"),h("2026-11-10","2026-11-20")] })).toBe(7);
    expect(dagenZonderHold("2026-11-10","2026-11-20",{ hold_periodes:[h("2026-11-01","2026-11-15"),h("2026-11-12","2026-11-25")] })).toBe(0);
  });
  it("Amsterdam midnight and DST do not use the UTC day or elapsed-hour rounding", () => {
    expect(amsterdamDatum(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    expect(amsterdamDatum(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(dagenZonderHold("2026-10-24","2026-10-26",null)).toBe(2);
  });
});
describe("250 queued files, metadata-only counts and safe retries", () => {
  it("count and station key cursors never fetch photo values; events update and errors retain files", async () => {
    const db = await getDB(); await db.clear("photo-queue");
    const events = vi.fn(); window.addEventListener(QUEUE_EVENT,events);
    const ids: string[] = [];
    for (let i=0;i<250;i++) ids.push(await queuePhoto(i%2 ? "A" : "B","C",new NodeFile(["photo"],`p${i}.jpg`) as unknown as File));
    expect(events).toHaveBeenCalledTimes(250);
    const getAll = vi.spyOn(IDBObjectStore.prototype,"getAll"), values = vi.spyOn(IDBIndex.prototype,"getAll"), get = vi.spyOn(IDBObjectStore.prototype,"get"), valueCursor = vi.spyOn(IDBIndex.prototype,"openCursor");
    expect(await getQueueCount()).toBe(250); expect(await getQueueCounts()).toEqual({ A:125,B:125 });
    expect(getAll).not.toHaveBeenCalled(); expect(values).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
    expect(valueCursor).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    await markError(ids[0],"PIN verlopen");
    expect(await getQueueCount()).toBe(250);
    const retained = (await getPendingPhotos()).find(p => p.id===ids[0])?.file;
    expect(retained).toBeInstanceOf(NodeBlob);
    expect(await retained?.text()).toBe("photo");
    await markDone(ids[1]); await clearDone();
    expect(await getQueueCount()).toBe(249); expect((await getPendingPhotos()).some(p => p.id===ids[0])).toBe(true);
    window.removeEventListener(QUEUE_EVENT,events); vi.restoreAllMocks(); await db.clear("photo-queue");
  });
});