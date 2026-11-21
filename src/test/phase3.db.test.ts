import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { leesAllePaginas } from "@/lib/paged-read";
import { balVan, scoreVan, type CaseItem } from "@/lib/to-rondes";
import { slug, zoekOpCaseSlug } from "@/lib/urls";

const socket = process.env.PHASE1_TEST_SOCKET;
if (socket && socket!=="/tmp/phase1/socket") throw new Error("Only the disposable local cluster is allowed");
const opts = { host:"/tmp/phase1/socket",port:55439,database:"phase1_tests",user:"postgres",ssl:false as const,max:1 };
const admin = postgres(opts), clients = Array.from({ length:20 },() => postgres(opts));
async function role(c: postgres.Sql, r: string, user?: string, session?: string) {
  await c.unsafe(`SET ROLE ${r}`);
  await c`SELECT set_config('request.jwt.claims',${JSON.stringify({ role:r,sub:user,session_id:session })},false)`;
}
async function fixture(fn: (sid: string,uid: string,session: string) => Promise<void>) {
  const sid=randomUUID(),uid=randomUUID(),session=randomUUID();
  await admin`INSERT INTO public.stations(id,naam_msr,dossier_notitie) VALUES(${sid},'Local phase3','Existing note untouched')`;
  await admin`INSERT INTO auth.sessions(id,user_id) VALUES(${session},${uid})`;
  await admin`INSERT INTO public.user_roles(user_id,role) VALUES(${uid},'admin')`;
  await role(clients[0],"service_role"); await clients[0]`SELECT public.beheer_toestaan(${session},${uid})`;
  try { await fn(sid,uid,session); }
  finally {
    await Promise.all(clients.map(c => c.unsafe("RESET ROLE")));
    const imported = await admin`SELECT station_id FROM public.case_aanvragen WHERE user_id=${uid}`;
    const ids=[sid,...imported.map(r=>r.station_id)];
    await admin`DELETE FROM public.case_aanvragen WHERE user_id=${uid}`;
    await admin`DELETE FROM public.to_acties WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.to_rondes WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.opleverruns WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.station_verwerking WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.sharepoint_wachtrij WHERE station_id IN ${admin(ids)}`;
    await admin`DELETE FROM public.stations WHERE id IN ${admin(ids)}`;
    await admin`DELETE FROM public.beheer_sessies WHERE user_id=${uid}`;
    await admin`DELETE FROM public.user_roles WHERE user_id=${uid}`;
    await admin`DELETE FROM auth.sessions WHERE user_id=${uid}`;
  }
}
describe.skipIf(!socket)("phase3 real migrated PostgreSQL", () => {
  it("A snapshots v1, B enqueues v2, A ack/retry leaves v2; UUID changes across delete/recreate", () => fixture(async sid => {
    const c=clients[0]; await role(c,"service_role");
    await c`SELECT public.sharepoint_uitstellen(${sid},false)`;
    const owner=randomUUID(),g=(await c`SELECT public.station_claim(${sid},${owner}) AS g`)[0].g;
    const q=(await c`SELECT public.verwerking_wachtrij_snapshot(${sid},${owner},${g}) AS q`)[0].q;
    await role(clients[1],"service_role");
    await clients[1]`SELECT public.sharepoint_uitstellen(${sid},true)`;
    const v2=(await admin`SELECT aanvraag_id,alleen_status FROM public.sharepoint_wachtrij WHERE station_id=${sid}`)[0];
    expect(v2.aanvraag_id).not.toBe(q.aanvraag_id); expect(v2.alleen_status).toBe(false);
    for (let i=0;i<2;i++) expect((await c`SELECT public.verwerking_wachtrij_klaar(${sid},${owner},${g},${q.aanvraag_id},false) AS ok`)[0].ok).toBe(true);
    expect((await admin`SELECT aanvraag_id FROM public.sharepoint_wachtrij WHERE station_id=${sid}`)[0].aanvraag_id).toBe(v2.aanvraag_id);
    // A status-only worker must never acknowledge a pending full request.
    await c`SELECT public.verwerking_wachtrij_klaar(${sid},${owner},${g},${v2.aanvraag_id},true)`;
    expect(await admin`SELECT station_id FROM public.sharepoint_wachtrij WHERE station_id=${sid}`).toHaveLength(1);
    await c`SELECT public.station_claim_check(${sid},${owner},${g},true)`;
    const b=randomUUID(),gb=(await clients[1]`SELECT public.station_claim(${sid},${b}) AS g`)[0].g;
    await clients[1]`SELECT public.verwerking_wachtrij_klaar(${sid},${b},${gb},${v2.aanvraag_id},false)`;
    // Lost acknowledgement response is safely retried, without recreating work.
    expect((await clients[1]`SELECT public.verwerking_wachtrij_klaar(${sid},${b},${gb},${v2.aanvraag_id},false) AS ok`)[0].ok).toBe(true);
    expect(await admin`SELECT station_id FROM public.sharepoint_wachtrij WHERE station_id=${sid}`).toHaveLength(0);
    await c`SELECT public.sharepoint_uitstellen(${sid},false)`;
    expect((await admin`SELECT aanvraag_id FROM public.sharepoint_wachtrij WHERE station_id=${sid}`)[0].aanvraag_id).not.toBe(v2.aanvraag_id);
  }));
  it("scheduler includes deleted-station runs, terminates them and permits cleanup claim", () => fixture(async sid => {
    const id=(await admin`INSERT INTO public.opleverruns(station_id,status) VALUES(${sid},'wacht_op_casegegevens') RETURNING id`)[0].id;
    await admin`DELETE FROM public.stations WHERE id=${sid}`;
    const c=clients[0]; await role(c,"service_role");
    expect((await c`SELECT id FROM public.uitvoerbare_opleverruns(${sid},20)`).map(r=>r.id)).toContain(id);
    expect((await c`SELECT public.opleverrun_verweesd(${id}) AS ok`)[0].ok).toBe(true);
    expect((await admin`SELECT status FROM public.opleverruns WHERE id=${id}`)[0].status).toBe("mislukt");
    expect((await c`SELECT public.station_claim(${sid},${randomUUID()}) AS g`)[0].g).not.toBeNull();
  }));
  it("create/delete/replay reports deleted; own retry after a fresh PIN session remains allowed", () => fixture(async (_sid,uid,session) => {
    const c=clients[0],request=randomUUID(),payload={ casenummer:randomUUID(),casenaam:"Deleted replay" };
    await role(c,"authenticated",uid,session);
    const first=(await c`SELECT public.case_aanmaken(${request},${c.json(payload)}::jsonb) AS r`)[0].r;
    const session2=randomUUID();
    await admin`INSERT INTO auth.sessions(id,user_id) VALUES(${session2},${uid})`;
    await role(clients[1],"service_role"); await clients[1]`SELECT public.beheer_toestaan(${session2},${uid})`;
    await role(c,"authenticated",uid,session2);
    expect((await c`SELECT public.case_aanmaken(${request},${c.json(payload)}::jsonb) AS r`)[0].r.uitkomst).toBe("replay");
    await admin`DELETE FROM public.to_rondes WHERE station_id=${first.id}`;
    await admin`DELETE FROM public.stations WHERE id=${first.id}`;
    expect((await c`SELECT public.case_aanmaken(${request},${c.json(payload)}::jsonb) AS r`)[0].r).toEqual({ uitkomst:"verwijderd" });
    expect(await admin`SELECT id FROM public.stations WHERE id=${first.id}`).toHaveLength(0);
  }));
  it("queue grants permit SELECT only, including no TRUNCATE/TRIGGER", () => fixture(async () => {
    for (const r of ["anon","authenticated"]) {
      expect((await admin`SELECT has_table_privilege(${r},'public.sharepoint_wachtrij','SELECT') AS ok`)[0].ok).toBe(true);
      for (const privilege of ["INSERT","UPDATE","DELETE","TRUNCATE","TRIGGER","REFERENCES"]) expect((await admin`SELECT has_table_privilege(${r},'public.sharepoint_wachtrij',${privilege}) AS ok`)[0].ok).toBe(false);
    }
  }));
  it("hold start/retry, H1 resume, H2 start, late H1 resume preserves H2 and original notes", () => fixture(async (sid,uid,session) => {
    const c=clients[0]; await role(c,"authenticated",uid,session);
    const h1=randomUUID(),h2=randomUUID();
    await c`SELECT public.case_hold_start(${sid},${h1},'Permit','liander')`;
    await c`SELECT public.case_hold_start(${sid},${h1},'Permit','liander')`;
    expect(await admin`SELECT id FROM public.hold_periodes WHERE station_id=${sid}`).toHaveLength(1);
    await c`SELECT public.case_hold_hervat(${sid},${h1})`;
    await c`SELECT public.case_hold_start(${sid},${h2},'Supply','van_gelder')`;
    expect((await c`SELECT public.case_hold_hervat(${sid},${h1}) AS ok`)[0].ok).toBe(true);
    const station=(await admin`SELECT on_hold,on_hold_reden,dossier_notitie FROM public.stations WHERE id=${sid}`)[0];
    expect(station).toEqual({ on_hold:true,on_hold_reden:"Supply",dossier_notitie:"Existing note untouched" });
    expect(await admin`SELECT id FROM public.hold_periodes WHERE station_id=${sid} AND einde_op IS NULL`).toEqual([{ id:h2 }]);
    await expect(admin`INSERT INTO public.hold_periodes(station_id,reden,partij) VALUES(${sid},'Other','terrevolt')`).rejects.toMatchObject({ code:"23505" });
    expect((await admin`SELECT begin_op::text=(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date::text AS ok FROM public.hold_periodes WHERE id=${h2}`)[0].ok).toBe(true);
  }));
  it("import hold creates exactly one transactional period; replay and rejected payload never duplicate it", () => fixture(async (_sid,uid,session) => {
    const c=clients[0]; await role(c,"authenticated",uid,session);
    const request=randomUUID(),p={ casenummer:randomUUID(),casenaam:"Hold import",onHold:true,onHoldReden:"Wait" };
    const first=(await c`SELECT public.case_aanmaken(${request},${c.json(p)}::jsonb) AS r`)[0].r;
    await c`SELECT public.case_aanmaken(${request},${c.json(p)}::jsonb)`;
    expect(await admin`SELECT id FROM public.hold_periodes WHERE station_id=${first.id}`).toHaveLength(1);
    await expect(c`SELECT public.case_aanmaken(${randomUUID()},${c.json({ ...p,casenummer:randomUUID(),casenaam:"" })}::jsonb)`).rejects.toMatchObject({ code:"22023" });
    expect(await admin`SELECT id FROM public.hold_periodes WHERE station_id=${first.id}`).toHaveLength(1);
  }));
  it("note CAS ignores unrelated field changes; two simultaneous notes cannot overwrite each other; resume is independent", () => fixture(async (sid,uid,session) => {
    const a=clients[0],b=clients[1]; await role(a,"authenticated",uid,session); await role(b,"authenticated",uid,session);
    await a`UPDATE public.stations SET behuizingsnummer='updated' WHERE id=${sid}`;
    const h=randomUUID(); await a`SELECT public.case_hold_start(${sid},${h},'Pause','terrevolt')`;
    const results=await Promise.all([a`SELECT public.case_notitie_opslaan(${sid},0,'Note A') AS r`,b`SELECT public.case_notitie_opslaan(${sid},0,'Note B') AS r`]);
    expect(results.filter(r=>!r[0].r.conflict)).toHaveLength(1); expect(results.filter(r=>r[0].r.conflict)).toHaveLength(1);
    const winner=results.find(r=>!r[0].r.conflict)?.[0].r.tekst;
    await Promise.all([a`SELECT public.case_hold_hervat(${sid},${h})`,b`SELECT public.case_notitie_opslaan(${sid},1,'Saved while resuming')`]);
    expect(winner).toMatch(/^Note [AB]$/);
    expect((await admin`SELECT dossier_notitie,dossier_notitie_versie FROM public.stations WHERE id=${sid}`)[0]).toEqual({ dossier_notitie:"Saved while resuming",dossier_notitie_versie:"2" });
    await expect(a`UPDATE public.stations SET dossier_notitie='Bypass' WHERE id=${sid}`).rejects.toMatchObject({ code:"42501" });
    await expect(a`UPDATE public.stations SET on_hold=true WHERE id=${sid}`).rejects.toMatchObject({ code:"42501" });
  }));
  it("SQL resolver matches JS normalization, old names, longest prefix, multiple stations and UUID", () => fixture(async (sid) => {
    await admin`UPDATE public.stations SET casenummer='ABC-123',casenaam='Nieuwe naam',behuizingsnummer=' 12 34 ',naam_msr='Àëñ station' WHERE id=${sid}`;
    for (const input of [" Àëñ / wijk ","Å-Ö_Ü","IS259001","ABC-123",""]) expect((await admin`SELECT public.url_slug(${input}) AS s`)[0].s).toBe(slug(input));
    const c=clients[0]; await role(c,"anon");
    expect((await c`SELECT id FROM public.url_candidates('abc-123-oude-naam',NULL)`).map(r=>r.id)).toContain(sid);
    expect((await c`SELECT id FROM public.url_candidates('1234-oude-stationsnaam',NULL)`).map(r=>r.id)).toContain(sid);
    expect((await c`SELECT id FROM public.url_candidates(${sid},NULL)`).map(r=>r.id)).toEqual([sid]);
    const rows=[{ id:"1",casenummer:"ABC" },{ id:"2",casenummer:"ABC-123" },{ id:"3",casenummer:"ABC-123" }];
    expect(zoekOpCaseSlug(rows,"ABC-123-oude-naam").map(r=>r.id)).toEqual(["2","3"]);
  }));
  it("isolated 1001-case/250-photo workload and 20 independent users: complete scores, latencies and errors", async () => {
    const ids=Array.from({ length:1001 },()=>randomUUID()).sort(),users=clients.map(()=>randomUUID()),sessions=clients.map(()=>randomUUID());
    const started=performance.now(); let pages=0;
    try {
      await admin`INSERT INTO public.stations(id,naam_msr,casenummer,casenaam,uitvoerder) SELECT x,'Local scale','LOCAL-'||x::text,'Local scale','terrevolt' FROM unnest(${ids}::uuid[]) x`;
      await admin`INSERT INTO public.to_rondes(station_id,nummer,status) SELECT x,1,CASE WHEN x=${ids[1000]}::uuid THEN 'goedgekeurd' ELSE 'open' END FROM unnest(${ids}::uuid[]) x`;
      await admin`INSERT INTO public.fotos(station_id,categorie,storage_path,url) SELECT ${ids[0]},'Test','local/'||${ids[0]}||'/'||g,'https://example.invalid/local' FROM generate_series(1,250) g`;
      const all=await leesAllePaginas<any>(async (after,size) => { pages++; return await admin`SELECT * FROM public.case_overzicht WHERE id=ANY(${ids}::uuid[]) AND (${after}::uuid IS NULL OR id>${after}::uuid) ORDER BY id LIMIT ${size}`; });
      const reference=await admin`SELECT * FROM public.case_overzicht WHERE id=ANY(${ids}::uuid[]) ORDER BY id`;
      const asCases=(rows: any[]): CaseItem[] => rows.map(r=>({ station:r.station,rondes:r.rondes,last:r.rondes[r.rondes.length-1],bal:balVan(r.station,r.rondes) }));
      expect(all).toHaveLength(1001); expect(pages).toBe(5); expect(scoreVan(asCases(all))).toEqual(scoreVan(asCases(reference))); expect(scoreVan(asCases(all)).goedgekeurdN).toBe(1);
      expect((await admin`SELECT count(*)::integer AS n FROM public.fotos WHERE station_id=${ids[0]}`)[0].n).toBe(250);
      const pids=await Promise.all(clients.map(c=>c`SELECT pg_backend_pid() AS p`)); expect(new Set(pids.map(r=>r[0].p)).size).toBe(20);
      await Promise.all(clients.map(async (c,i)=>{
        await admin`INSERT INTO auth.sessions(id,user_id) VALUES(${sessions[i]},${users[i]})`;
        await admin`INSERT INTO public.user_roles(user_id,role) VALUES(${users[i]},'admin')`;
        await role(c,"service_role"); await c`SELECT public.beheer_toestaan(${sessions[i]},${users[i]})`; await role(c,"authenticated",users[i],sessions[i]);
      }));
      let start: (()=>void) | undefined; const barrier=new Promise<void>(r=>{ start=r; });
      const tasks=clients.map(async (c,i)=>{ await barrier; const t=performance.now(); const result=await c`SELECT public.case_notitie_opslaan(${ids[i]},0,'Local concurrent action') AS r`; expect(result[0].r.conflict).toBe(false); return performance.now()-t; });
      start?.(); const latencies=(await Promise.all(tasks)).sort((a,b)=>a-b);
      console.log("PHASE3_LOCAL_METRICS",JSON.stringify({ cases:1001,photos:250,independentUsers:20,pages,errors:0,totalMs:Math.round(performance.now()-started),actionP50Ms:Math.round(latencies[9]),actionP95Ms:Math.round(latencies[18]),actionMaxMs:Math.round(latencies[19]) }));
    } finally {
      await Promise.all(clients.map(c=>c.unsafe("RESET ROLE")));
      await admin`DELETE FROM public.fotos WHERE station_id=ANY(${ids}::uuid[])`; await admin`DELETE FROM public.to_rondes WHERE station_id=ANY(${ids}::uuid[])`; await admin`DELETE FROM public.stations WHERE id=ANY(${ids}::uuid[])`;
      await admin`DELETE FROM public.beheer_sessies WHERE user_id=ANY(${users}::uuid[])`; await admin`DELETE FROM public.user_roles WHERE user_id=ANY(${users}::uuid[])`; await admin`DELETE FROM auth.sessions WHERE user_id=ANY(${users}::uuid[])`;
    }
  });
});
afterAll(async()=>{ await Promise.all([admin.end(),...clients.map(c=>c.end())]); });