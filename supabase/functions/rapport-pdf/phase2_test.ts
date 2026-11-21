import { bouwPdf } from "./renderer.ts";
import { Claim, exacteFotos, hashBytes, toetsDossier } from "../_shared/verwerking.ts";
import { CATEGORIES } from "../_shared/sharepoint-categories.ts";
import { syncStation } from "../_shared/sharepoint.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
const assert = (v: unknown, message = "Assertion failed") => { if (!v) throw new Error(message); };
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII="), c => c.charCodeAt(0));
function fixture(n = 250, failure?: "missing" | "unreadable") {
  const files = new Map<string,Uint8Array>();
  const saved: any[] = [];
  const claim = { check: async () => {}, save: async (...args: any[]) => { saved.push(args); } } as unknown as Claim;
  const fotos = Array.from({ length:n },(_,i) => ({ id:`photo-${i}`, categorie:CATEGORIES[0].name, storage_path:`source/${i}`, review_status:"pending" }));
  const dossier = { station:{ uitvoerder:"terrevolt", naam_msr:"Local PDF fixture", status:"opgeleverd", casenummer:"LOCAL",casenaam:"Test" }, fotos, opmerkingen:[],acties:[],instellingen:{},vereisten:CATEGORIES.map(c => ({ naam:c.name,minimum:1 })),skips:CATEGORIES.slice(1).map(c => ({ categorie:c.name,reden:"Local NVT" })) };
  const db = { storage:{ from:(bucket: string) => ({
    download:async (pad: string) => {
      const b = bucket === "to-fotos" ? (pad === "source/17" && failure ? (failure === "missing" ? null : new Uint8Array([1,2,3])) : png) : (pad.includes("pdf-cache") ? (pad.includes("photo-17.") && failure ? (failure === "missing" ? null : new Uint8Array([1,2,3])) : png) : files.get(pad));
      return { data:b ? new Blob([new Uint8Array(b)]) : null };
    },
    upload:async (pad: string,b: Uint8Array) => { files.set(pad,b); return { error:null }; },
  }) } };
  return { db,claim,fotos,dossier,saved,files };
}
Deno.test("250 expected photo IDs are embedded exactly, PDF upload/promotion confirmed",async () => {
  const f = fixture(); toetsDossier(f.dossier);
  const result = await bouwPdf(f.db,"station",f.fotos,"run",f.dossier,f.claim);
  assert(result.ids.length === 250);
  assert(new Set(result.ids).size === 250);
  assert(f.fotos.every(p => result.ids.includes(p.id)));
  assert((await PDFDocument.load(result.bytes)).getPageCount() >= 250);
  assert(f.saved[0][1].pdf_pad === "station/revisies/run/rapport.pdf");
  assert(f.saved[0][1].geaccepteerde_run === "run");
});
for (const failure of ["missing","unreadable"] as const) Deno.test(`${failure} photo fails clearly without publishing incomplete PDF`,async () => {
  const f = fixture(250,failure);
  let rejected = false;
  try { await bouwPdf(f.db,"station",f.fotos,"run",f.dossier,f.claim); }
  catch(e) { rejected = String(e).includes("photo-17") && String(e).includes(CATEGORIES[0].name); }
  assert(rejected); assert(f.saved.length === 0); assert(f.files.size === 0);
});
Deno.test("same count with wrong photo IDs fails and category31 needs one photo or valid NVT",() => {
  let failed = false;
  try { exacteFotos([{ id:"a",categorie:"C" }],["b"]); } catch { failed = true; } assert(failed);
  const cat = CATEGORIES.find(c => c.id === 31); assert(cat);
  const d = { station:{ uitvoerder:"terrevolt" },vereisten:[{ naam:cat?.name,minimum:1 }],fotos:[],skips:[] };
  failed=false; try { toetsDossier(d); } catch { failed=true; } assert(failed);
  toetsDossier({ ...d, fotos:[{ categorie:cat?.name,review_status:"pending" }] });
  toetsDossier({ ...d, skips:[{ categorie:cat?.name,reden:"NVT" }] });
});
Deno.test("different PDFs of equal length update SharePoint using hash; no real network or 10 Documenten writes",async () => {
  const bytes = new Uint8Array([1,2,3,4]), old = new Uint8Array([4,3,2,1]);
  const currentHash = await hashBytes(bytes), oldHash = await hashBytes(old);
  assert(currentHash !== oldHash && bytes.length === old.length);
  let previous = oldHash;
  const station = { id:"station",uitvoerder:"terrevolt",status:"opgeleverd",casenummer:"LOCAL",casenaam:"Test",datum:"2026-11-21" };
  const db = { storage:{ from:() => ({ download:async () => ({ data:new Blob([bytes]),error:null }) }) }, from:(table: string) => {
    const data = table === "rapport_pdf" ? { geaccepteerde_run:"run",pdf_pad:"immutable",pdf_hash:currentHash } : table === "sharepoint_sync" ? { pdf_hash:previous,pdf_run:"run" } : table === "opleverruns" ? { station_id:"station", dossier:{ station:{ id:"station",uitvoerder:"terrevolt" },fotos:[],opmerkingen:[],skips:[],vereisten:[] } } : [];
    const q: any = { select:()=>q, eq:()=>q, in:()=>q, order:()=>q, limit:()=>q, gt:()=>q, maybeSingle:async () => ({ data,error:null }), then:(resolve:any) => resolve({ data,error:null }) };
    return q;
  } };
  const calls: { url:string;method:string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input,init) => {
    const url = String(input), method = init?.method ?? "GET"; calls.push({ url,method });
    assert(url.startsWith("https://graph.microsoft.com/"),"Only fake Graph adapter URLs allowed");
    let body: unknown = { id:"folder",webUrl:"https://example.invalid/local",folder:{} };
    if (url.includes("children?")) body = { value:url.includes("00%20Rapport") ? [{ id:"existing",name:"Opleverrapport LOCAL - Test.pdf",size:4,file:{} }] : [] };
    return new Response(JSON.stringify(body),{ status:200 });
  };
  try {
    const ctx = { tok:"test",root:"/drives/test/root",driveId:"test",prefix:[],metadata:false,claim:{ check:async () => {} } as unknown as Claim };
    const first = await syncStation(ctx,db,station,null);
    assert(first.pdf_hash === currentHash);
    assert(calls.some(c => c.method === "PUT" && c.url.includes("Opleverrapport")));
    assert(!calls.some(c => c.method !== "GET" && c.url.includes("10%20Documenten")));
    calls.length=0; previous=currentHash;
    await syncStation(ctx,db,station,null);
    assert(!calls.some(c => c.method === "PUT" && c.url.includes("Opleverrapport")));
  } finally { globalThis.fetch=original; }
});