import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
const socket=process.env.PHASE1_TEST_SOCKET;
if (socket && socket!='/tmp/phase1/socket') throw new Error('Disposable cluster only');
const opts={host:'/tmp/phase1/socket',port:55439,database:'phase1_tests',user:'postgres',ssl:false as const,max:1};
const db=postgres(opts),a=postgres(opts),b=postgres(opts);
async function als(c:postgres.Sql,r:string,uid?:string,session?:string){await c.unsafe(`SET ROLE ${r}`);await c`SELECT set_config('request.jwt.claims',${JSON.stringify({role:r,sub:uid,session_id:session})},false)`;}
type Ctx={s:string,u:string,sa:string,sb:string,foto:(cat:string,status?:string)=>Promise<string>};
async function fixture(fn:(c:Ctx)=>Promise<void>,extra='') {
 const s=randomUUID(),u=randomUUID(),sa=randomUUID(),sb=randomUUID();
 await db.unsafe(`INSERT INTO public.stations(id,naam_msr,status,submitted_at,type_ruimte${extra?','+extra.split('=')[0]:''}) VALUES('${s}','Fictief beoordeling','opgeleverd',now(),'Betreedbaar station'${extra?','+extra.split('=')[1]:''})`);
 await db`INSERT INTO auth.sessions(id,user_id) VALUES(${sa},${u}),(${sb},${u})`;await db`INSERT INTO public.user_roles(user_id,role) VALUES(${u},'admin')`;
 await als(a,'service_role');await a`SELECT public.beheer_toestaan(${sa},${u})`;await a`SELECT public.beheer_toestaan(${sb},${u})`;
 const foto=async(cat:string,status='pending')=>{const id=randomUUID();await db`INSERT INTO public.fotos(id,station_id,categorie,storage_path,url,review_status) VALUES(${id},${s},${cat},${'stations/'+s+'/'+id+'.jpg'},'x',${status})`;return id;};
 try{await fn({s,u,sa,sb,foto});}finally{
  await Promise.all([a.unsafe('RESET ROLE'),b.unsafe('RESET ROLE')]);
  await db`DELETE FROM public.opleverruns WHERE station_id=${s}`;await db`DELETE FROM storage.objects WHERE bucket_id='to-fotos' AND split_part(name,'/',2)=${s}`;
  await db`DELETE FROM public.foto_beoordelingen WHERE station_id=${s}`;await db`DELETE FROM public.fotos WHERE station_id=${s}`;await db`DELETE FROM public.categorie_skips WHERE station_id=${s}`;
  await db`DELETE FROM public.stations WHERE id=${s}`;await db`DELETE FROM public.beheer_sessies WHERE user_id=${u}`;await db`DELETE FROM public.user_roles WHERE user_id=${u}`;await db`DELETE FROM auth.sessions WHERE user_id=${u}`;
 }
}
const besluit=async(c:postgres.Sql,id:string,v:number|null,b:string,r?:string)=>(await c`SELECT public.foto_beoordelen(${id},${v},${b},${r??null}) AS r`)[0].r;
afterAll(async()=>{await Promise.all([db.end(),a.end(),b.end()]);});
describe.skipIf(!socket)('fotobeoordeling real PostgreSQL',()=>{
 it('anon and unlocked authenticated cannot decide; direct history writes are denied',()=>fixture(async({s,u,foto})=>{
  const p=await foto('Lips-sloten');await als(b,'anon');
  await expect(besluit(b,p,0,'approved')).rejects.toThrow();
  await als(b,'authenticated',u,randomUUID());await expect(besluit(b,p,0,'approved')).rejects.toThrow(/Beheer/);
  await expect(b`INSERT INTO public.foto_beoordelingen(foto_id,station_id,actie,oud,nieuw,oud_versie,nieuw_versie,oud_station,nieuw_station) VALUES(${p},${s},'goedgekeurd','{}','{}',0,1,'{}','{}')`).rejects.toThrow();
  expect((await db`SELECT review_status FROM public.fotos WHERE id=${p}`)[0].review_status).toBe('pending');
 }));
 it('stale version is rejected without writing; double decision with same version writes once',()=>fixture(async({u,sa,foto})=>{
  const p=await foto('Lips-sloten');await als(a,'authenticated',u,sa);
  expect((await besluit(a,p,0,'rejected','Onscherp')).ok).toBe(true);
  const again=await besluit(a,p,0,'approved');expect(again).toMatchObject({ok:false,reden:'gewijzigd'});
  expect((await db`SELECT review_status,review_versie FROM public.fotos WHERE id=${p}`)[0]).toEqual({review_status:'rejected',review_versie:'1'});
  expect(await db`SELECT 1 FROM public.foto_beoordelingen WHERE foto_id=${p}`).toHaveLength(1);
 }));
 it('own undo restores photo and reopened station; colleague change blocks undo',()=>fixture(async({s,u,sa,sb,foto})=>{
  const p=await foto('Lips-sloten');await als(a,'authenticated',u,sa);await als(b,'authenticated',u,sb);
  const r=await besluit(a,p,0,'rejected','Onscherp');
  expect((await db`SELECT status FROM public.stations WHERE id=${s}`)[0].status).toBe('in uitvoering');
  expect((await b`SELECT public.foto_beoordeling_herstellen(${r.beoordeling_id}) AS r`)[0].r).toMatchObject({ok:false,reden:'niet_eigen'});
  const u1=(await a`SELECT public.foto_beoordeling_herstellen(${r.beoordeling_id}) AS r`)[0].r;
  expect(u1).toMatchObject({ok:true,station_hersteld:true});
  expect((await db`SELECT review_status,review_reden FROM public.fotos WHERE id=${p}`)[0]).toEqual({review_status:'pending',review_reden:null});
  expect((await db`SELECT status FROM public.stations WHERE id=${s}`)[0].status).toBe('opgeleverd');
  const r2=await besluit(a,p,u1.versie,'approved');
  expect((await besluit(b,p,r2.versie,'rejected','Collega')).ok).toBe(true);
  expect((await a`SELECT public.foto_beoordeling_herstellen(${r2.beoordeling_id}) AS r`)[0].r).toMatchObject({ok:false,reden:'gewijzigd'});
  expect((await db`SELECT review_status,review_reden FROM public.fotos WHERE id=${p}`)[0]).toEqual({review_status:'rejected',review_reden:'Collega'});
 }));
 it('finalization blocks pending, open rejection and missing categories; explicit resolution unblocks; no inference from other approved photo',()=>fixture(async({s,u,sa,foto})=>{
  await db`INSERT INTO public.categorie_skips(station_id,categorie,reden) SELECT ${s},c.naam,'Fictief n.v.t.' FROM public.stations st, public.vereiste_fotocategorieen(st) c WHERE st.id=${s} AND c.naam<>'Lips-sloten'`;
  const oud=await foto('Lips-sloten','rejected');const nieuw=await foto('Lips-sloten');await als(a,'authenticated',u,sa);
  let r=(await a`SELECT public.dossier_afronden(${s}) AS r`)[0].r;expect(r.controle).toMatchObject({te_beoordelen:1,open_afkeuren:1});
  await besluit(a,nieuw,0,'approved');
  r=(await a`SELECT public.dossier_afronden(${s}) AS r`)[0].r;expect(r).toMatchObject({ok:false,controle:{te_beoordelen:0,open_afkeuren:1,ontbrekend:[]}});
  await expect(besluit(a,oud,0,'afgehandeld','')).rejects.toThrow(/Reden/);
  expect((await besluit(a,oud,0,'afgehandeld','Vervangen door nieuwe foto')).ok).toBe(true);
  expect((await db`SELECT review_status,afkeur_afgehandeld_toelichting FROM public.fotos WHERE id=${oud}`)[0]).toEqual({review_status:'rejected',afkeur_afgehandeld_toelichting:'Vervangen door nieuwe foto'});
  expect((await a`SELECT public.dossier_afronden(${s}) AS r`)[0].r).toMatchObject({ok:true});
  expect((await db`SELECT status FROM public.stations WHERE id=${s}`)[0].status).toBe('goedgekeurd');
 }));
 it('valid all-N.v.t. dossier finalizes without photos; a missing required category blocks',()=>fixture(async({s,u,sa})=>{
  await db`INSERT INTO public.categorie_skips(station_id,categorie,reden) SELECT ${s},c.naam,'Fictief' FROM public.stations st, public.vereiste_fotocategorieen(st) c WHERE st.id=${s} AND c.naam<>'Lips-sloten'`;
  await als(a,'authenticated',u,sa);
  expect((await a`SELECT public.dossier_afronden(${s}) AS r`)[0].r).toMatchObject({ok:false,controle:{ontbrekend:['Lips-sloten']}});
  await db`INSERT INTO public.categorie_skips(station_id,categorie,reden) VALUES(${s},'Lips-sloten','Fictief')`;
  expect((await a`SELECT public.dossier_afronden(${s}) AS r`)[0].r).toMatchObject({ok:true});
 }));
 it('mechanic cannot forge version or resolution fields; resubmission keeps rejections and snapshots exclude them',()=>fixture(async({s,foto})=>{
  const p=await foto('Lips-sloten','rejected');await als(b,'anon');
  await db`UPDATE public.stations SET status='in uitvoering',submitted_at=NULL WHERE id=${s}`;
  await expect(b`UPDATE public.fotos SET afkeur_afgehandeld_op=now() WHERE id=${p}`).rejects.toThrow(/Beheer/);
  await expect(b`UPDATE public.fotos SET review_versie=99 WHERE id=${p}`).rejects.toThrow(/Beheer/);
  expect((await db`SELECT review_versie,afkeur_afgehandeld_op FROM public.fotos WHERE id=${p}`)[0]).toEqual({review_versie:'0',afkeur_afgehandeld_op:null});
  const snap=(await db`SELECT public.dossier_snapshot(${s}) AS d`)[0].d;expect(snap.fotos.map((f:{id:string})=>f.id)).not.toContain(p);
 }));
 it('real valid resubmission via fotodossier_aanbieden keeps rejection status/reason/handling and excludes it from the stored run snapshot',()=>fixture(async({s,u,sa,foto})=>{
  await db`INSERT INTO public.categorie_skips(station_id,categorie,reden) SELECT ${s},c.naam,'Fictief n.v.t.' FROM public.stations st, public.vereiste_fotocategorieen(st) c WHERE st.id=${s} AND c.naam<>'Lips-sloten'`;
  const oud=await foto('Lips-sloten');
  await db`INSERT INTO storage.objects(bucket_id,name) SELECT 'to-fotos',storage_path FROM public.fotos WHERE id=${oud}`;
  await als(a,'authenticated',u,sa);
  expect((await besluit(a,oud,0,'rejected','Onscherp — fictief')).ok).toBe(true);
  expect((await db`SELECT status FROM public.stations WHERE id=${s}`)[0].status).toBe('in uitvoering');
  // Vervangende foto; een afgekeurd dossier was al opgeleverd, dus zonder PIN weigert de server herindiening (fase-1-grens).
  const nieuw=await foto('Lips-sloten');
  await db`INSERT INTO storage.objects(bucket_id,name) SELECT 'to-fotos',storage_path FROM public.fotos WHERE id=${nieuw}`;
  await als(b,'anon');
  await expect(b`SELECT public.fotodossier_aanbieden(${s})`).rejects.toThrow(/Beheer/);
  await b.unsafe('RESET ROLE');
  const run=(await a`SELECT public.fotodossier_aanbieden(${s}) AS r`)[0].r;
  expect(run).toMatchObject({nieuw:true});
  expect((await db`SELECT status FROM public.stations WHERE id=${s}`)[0].status).toBe('opgeleverd');
  expect((await db`SELECT review_status,review_reden,afkeur_afgehandeld_op FROM public.fotos WHERE id=${oud}`)[0]).toEqual({review_status:'rejected',review_reden:'Onscherp — fictief',afkeur_afgehandeld_op:null});
  const dossier=(await db`SELECT dossier FROM public.opleverruns WHERE id=${run.id}`)[0].dossier;
  const ids=dossier.fotos.map((f:{id:string})=>f.id);
  expect(ids).toContain(nieuw);expect(ids).not.toContain(oud);
  // Expliciete afhandeling daarna: afkeur blijft afgekeurd, met historie.
  expect((await besluit(a,oud,1,'afgehandeld','Vervangen door nieuwe foto')).ok).toBe(true);
  expect((await db`SELECT review_status,afkeur_afgehandeld_toelichting FROM public.fotos WHERE id=${oud}`)[0]).toEqual({review_status:'rejected',afkeur_afgehandeld_toelichting:'Vervangen door nieuwe foto'});
  expect((await db`SELECT count(*)::int AS n FROM public.foto_beoordelingen WHERE foto_id=${oud}`)[0].n).toBe(2);
 }));
});
