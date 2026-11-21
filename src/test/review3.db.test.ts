import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
const socket=process.env.PHASE1_TEST_SOCKET;
if (socket && socket!='/tmp/phase1/socket') throw new Error('Disposable cluster only');
const opts={host:'/tmp/phase1/socket',port:55439,database:'phase1_tests',user:'postgres',ssl:false as const,max:1};
const db=postgres(opts),worker=postgres(opts),other=postgres(opts);
async function role(c:postgres.Sql,r:string,uid?:string,session?:string) { await c.unsafe(`SET ROLE ${r}`); await c`SELECT set_config('request.jwt.claims',${JSON.stringify({role:r,sub:uid,session_id:session})},false)`; }
async function fixture(fn:(s:string,u:string,session:string)=>Promise<void>) {
 const s=randomUUID(),u=randomUUID(),session=randomUUID();
 await db`INSERT INTO public.stations(id,naam_msr) VALUES(${s},'Review isolated')`;
 await db`INSERT INTO auth.sessions(id,user_id) VALUES(${session},${u})`; await db`INSERT INTO public.user_roles(user_id,role) VALUES(${u},'admin')`;
 await role(worker,'service_role'); await worker`SELECT public.beheer_toestaan(${session},${u})`;
 try {await fn(s,u,session);} finally {
  await Promise.all([worker.unsafe('RESET ROLE'),other.unsafe('RESET ROLE')]);
  await db`DELETE FROM public.opleverruns WHERE station_id=${s}`;await db`DELETE FROM public.sharepoint_sync WHERE station_id=${s}`;await db`DELETE FROM public.station_verwerking WHERE station_id=${s}`;await db`DELETE FROM public.rapport_pdf WHERE station_id=${s}`;await db`DELETE FROM public.stations WHERE id=${s}`;
  await db`DELETE FROM public.beheer_sessies WHERE user_id=${u}`;await db`DELETE FROM public.user_roles WHERE user_id=${u}`;await db`DELETE FROM auth.sessions WHERE user_id=${u}`;
 }
}
describe.skipIf(!socket)('review3 real PostgreSQL',()=>{
 it('NULL/stale CAS cannot write; a valid version alone increments',()=>fixture(async(s,u,session)=>{
  await role(worker,'authenticated',u,session);
  for(const version of [null,1]) {const r=(await worker`SELECT public.case_notitie_opslaan(${s},${version},'wrong') AS r`)[0].r;expect(r.conflict).toBe(true);}
  expect((await db`SELECT dossier_notitie_versie,dossier_notitie FROM public.stations WHERE id=${s}`)[0]).toEqual({dossier_notitie_versie:'0',dossier_notitie:null});
  expect((await worker`SELECT public.case_notitie_opslaan(${s},0,'valid') AS r`)[0].r).toMatchObject({conflict:false,versie:1,tekst:'valid'});
 }));
 it('anonymous inserts normalize injected bigint max to zero; first PIN save is version one',()=>fixture(async(s,u,session)=>{
  await db`DELETE FROM public.stations WHERE id=${s}`;await role(worker,'anon');
  await worker`INSERT INTO public.stations(id,naam_msr,dossier_notitie_versie) VALUES(${s},'Mechanic','9223372036854775807')`;
  expect((await db`SELECT dossier_notitie_versie FROM public.stations WHERE id=${s}`)[0].dossier_notitie_versie).toBe('0');
  await role(worker,'authenticated',u,session);expect((await worker`SELECT public.case_notitie_opslaan(${s},0,'First save') AS r`)[0].r.versie).toBe(1);
 }));
 it('history grants are SELECT only and full-history index exists',async()=>{
  for(const r of ['anon','authenticated']) for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) expect((await db`SELECT has_table_privilege(${r},'public.hold_periodes',${privilege}) AS ok`)[0].ok).toBe(privilege==='SELECT');
  const indexes=await db`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='hold_periodes' AND indexname='hold_historie_station'`;
  expect(indexes).toHaveLength(1);expect(indexes[0].indexdef).toContain('(station_id, begin_op, id)');
 });
 it('cleanup locks/fences mapping: stale, expired, existing station and wrong item cannot delete',()=>fixture(async s=>{
  await db`INSERT INTO public.sharepoint_sync(station_id,status,sharepoint_item_id) VALUES(${s},'gelukt','owned')`;
  await role(worker,'service_role');await role(other,'service_role');
  const a=randomUUID(),b=randomUUID(),g=(await worker`SELECT public.station_claim(${s},${a}) AS g`)[0].g;
  expect((await worker`SELECT public.verwerking_sync_verwijderen(${s},${a},${g},'owned') AS ok`)[0].ok).toBe(false);
  await db`DELETE FROM public.stations WHERE id=${s}`;
  await db`UPDATE public.station_verwerking SET geldig_tot=clock_timestamp()-interval '1 second' WHERE station_id=${s}`;
  expect((await worker`SELECT public.verwerking_sync_verwijderen(${s},${a},${g},'owned') AS ok`)[0].ok).toBe(false);
  const gb=(await other`SELECT public.station_claim(${s},${b}) AS g`)[0].g;
  expect((await worker`SELECT public.verwerking_sync_verwijderen(${s},${a},${g},'owned') AS ok`)[0].ok).toBe(false);
  expect((await other`SELECT public.verwerking_sync_verwijderen(${s},${b},${gb},'other') AS ok`)[0].ok).toBe(false);
  expect(await db`SELECT station_id FROM public.sharepoint_sync WHERE station_id=${s}`).toHaveLength(1);
  expect((await other`SELECT public.verwerking_sync_verwijderen(${s},${b},${gb},'owned') AS ok`)[0].ok).toBe(true);
  expect((await other`SELECT public.verwerking_sync_verwijderen(${s},${b},${gb},'owned') AS ok`)[0].ok).toBe(false);
 }));
 it('fresh claim cannot apply old null-PDF/failure state; terminal run never downgrades',()=>fixture(async s=>{
  const run=(await db`INSERT INTO public.opleverruns(station_id,status) VALUES(${s},'pdf_bezig') RETURNING *`)[0];
  await role(worker,'service_role');await role(other,'service_role');const a=randomUUID(),b=randomUUID();
  const ga=(await worker`SELECT public.station_claim(${s},${a},${run.id}) AS g`)[0].g;
  await worker`SELECT public.verwerking_opslaan(${s},${a},${ga},${run.id},${worker.json({pdf_pad:'immutable.pdf',status:'pdf_klaar'})}::jsonb)`;
  await worker`SELECT public.station_claim_check(${s},${a},${ga},true)`;
  const gb=(await other`SELECT public.station_claim(${s},${b},${run.id}) AS g`)[0].g;
  const expected={status:run.status,pdf_pad:null,bijgewerkt_op:run.bijgewerkt_op};
  expect((await other`SELECT public.verwerking_run_cas(${s},${b},${gb},${run.id},${other.json(expected)}::jsonb,${other.json({status:'wacht_op_retry'})}::jsonb) AS ok`)[0].ok).toBe(false);
  await other`SELECT public.verwerking_opslaan(${s},${b},${gb},${run.id},${other.json({status:'afgerond'})}::jsonb)`;
  expect((await other`SELECT public.verwerking_opslaan(${s},${b},${gb},${run.id},${other.json({status:'sharepoint_bezig'})}::jsonb) AS ok`)[0].ok).toBe(false);
  expect((await db`SELECT status,pdf_pad FROM public.opleverruns WHERE id=${run.id}`)[0]).toEqual({status:'afgerond',pdf_pad:'immutable.pdf'});
 }));
 it('20 healthy PDFs are filtered before LIMIT; lost/409 continuation stays runnable and busy cannot lose cursor',()=>fixture(async s=>{
  const ids=Array.from({length:20},()=>randomUUID());
  try{
   await db`INSERT INTO public.stations(id,naam_msr) SELECT x,'Healthy PDF' FROM unnest(${ids}::uuid[]) x`;
   await db`INSERT INTO public.opleverruns(station_id,status,gestart_op,pdf_poging_op,pdf_voortgang_op,pdf_volgende_op) SELECT x,'pdf_bezig',clock_timestamp()-interval '3 days',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '2 minutes' FROM unnest(${ids}::uuid[]) x`;
   const run=(await db`INSERT INTO public.opleverruns(station_id,gestart_op) VALUES(${s},clock_timestamp()-interval '2 days') RETURNING id`)[0].id;
   await role(worker,'service_role');await role(other,'service_role');expect((await worker`SELECT id FROM public.uitvoerbare_opleverruns(NULL,20)`).map(r=>r.id)).toContain(run);
   const owner=randomUUID(),g=(await worker`SELECT public.station_claim(${s},${owner},${run}) AS g`)[0].g;
   await worker`SELECT public.verwerking_opslaan(${s},${owner},${g},${run},${worker.json({status:'pdf_bezig'})}::jsonb)`;
   const begun=(await worker`SELECT public.pdf_stap_start(${s},${owner},${g},${run}) AS r`)[0].r;expect(new Date(begun.pdf_poging_op).getTime()).toBeGreaterThan(Date.now()-10000);expect(new Date(begun.gestart_op).getTime()).toBeLessThan(Date.now()-40*60000);
   expect((await other`SELECT public.station_claim(${s},${randomUUID()},${run}) AS g`)[0].g).toBeNull();
   expect((await worker`SELECT public.pdf_stap_klaar(${s},${owner},${g},${run},0) AS ok`)[0].ok).toBe(true);
   await worker`SELECT public.station_claim_check(${s},${owner},${g},true)`;
   expect((await worker`SELECT id FROM public.uitvoerbare_opleverruns(NULL,20)`).map(r=>r.id)).toContain(run);
   const next=randomUUID(),gn=(await other`SELECT public.station_claim(${s},${next},${run}) AS g`)[0].g;
   const resumed=(await other`SELECT public.pdf_stap_start(${s},${next},${gn},${run}) AS r`)[0].r;expect(resumed.pdf_stap).toBe(1);expect(resumed.pdf_poging_op).toBe(begun.pdf_poging_op);
  }finally{await db`DELETE FROM public.opleverruns WHERE station_id=ANY(${ids}::uuid[])`;await db`DELETE FROM public.stations WHERE id=ANY(${ids}::uuid[])`;}
 }));
});
afterAll(async()=>{await Promise.all([db.end(),worker.end(),other.end()]);});
