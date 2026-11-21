import { voorbereiden } from "./renderer.ts";
import { volledigeRead, verweesdeMappings } from '../_shared/bron-read.ts';
import { leesSyncBron, syncStation, syncEnRegistreer, verwijderMapping, veilig } from '../_shared/sharepoint.ts';
import { Claim, hashBytes } from '../_shared/verwerking.ts';
import { CATEGORIES, SECTIONS } from '../_shared/sharepoint-categories.ts';
import { verwerk } from '../_shared/keten-worker.ts';
const assert=(x:unknown,m='assertion failed')=>{if(!x)throw new Error(m)};
async function rejects(fn:()=>Promise<unknown>,text?:string){let e:unknown;try{await fn()}catch(err){e=err}assert(e && (!text || String(e).includes(text)),`Expected failure ${text}: ${e}`)}
function adapter(tables:Record<string,any>,fail?:string) {
 return {from:(table:string)=>{
  let after='',key='id',filter:string|undefined;
  const q:any={select:()=>q,eq:(_k:string,v:string)=>{filter=v;return q},in:()=>q,order:(k:string)=>{key=k;return q},gt:(_k:string,v:string)=>{after=v;return q},limit:()=>q,
   maybeSingle:async()=>({data:tables[table]??null,error:table===fail?{message:'injected read error'}:null}),single:async()=>({data:tables[table]??null,error:table===fail?{message:'injected read error'}:null}),
   then:(resolve:any)=>resolve({data:Array.isArray(tables[table])?tables[table].filter((x:any)=>x[key]>after && (!filter || !x.station_id || x.station_id===filter)).slice(0,250):[],error:table===fail?{message:'injected read error'}:null})};return q;
 }};
}
Deno.test('failed station inventory or sync inventory never schedules a move/delete',async()=>{
 for(const fail of ['stations','sharepoint_sync']){
  let moves=0;const db=adapter({stations:[{id:'s'}],sharepoint_sync:[{station_id:'s',sharepoint_item_id:'m'}]},fail);
  await rejects(async()=>{for(const _ of await verweesdeMappings(db)) moves++});assert(moves===0);
 }
});
Deno.test('1001+ existing station IDs, including last mapping and VG, remain intact; only actual orphan selected',async()=>{
 const stations=Array.from({length:1002},(_,i)=>({id:String(i).padStart(6,'0'),uitvoerder:i===1001?'van_gelder':'terrevolt'}));
 const mappings=stations.map(s=>({station_id:s.id,sharepoint_item_id:'m'+s.id}));mappings.push({station_id:'deleted',sharepoint_item_id:'own-managed'});
 const db=adapter({stations,sharepoint_sync:mappings});assert((await volledigeRead(db,'stations','id')).length===1002);
 const result=await verweesdeMappings(db);assert(result.length===1 && result[0].sharepoint_item_id==='own-managed');
});
Deno.test('under-claim existence recheck stops deletion, including read failure; failed acknowledgement never succeeds',async()=>{
 const ctx:any={tok:'fake',root:'/drives/fake/root',driveId:'fake',prefix:[],metadata:false};let deleted=0;
 const claim:any={check:async()=>{},deleteMapping:async()=>{deleted++}};
 assert(await verwijderMapping(ctx,adapter({stations:{id:'s'}}),'s','m',claim)===null);assert(deleted===0);
 await rejects(()=>verwijderMapping(ctx,adapter({stations:null},'stations'),'s','m',claim));assert(deleted===0);
 const original=fetch;globalThis.fetch=async()=>new Response('',{status:404});
 try{await rejects(()=>verwijderMapping(ctx,adapter({stations:null}),'s','m',{...claim,deleteMapping:async()=>{throw new Error('DB failure')}} as Claim),'DB failure')}finally{globalThis.fetch=original}
});
const station={id:'s',uitvoerder:'terrevolt',status:'opgeleverd',casenummer:'LOCAL',casenaam:'Test',datum:'2026-11-21'};
function source(accepted=true,fail?:string,missing=false){
 const tables:any={rapport_pdf:accepted?{geaccepteerde_run:'r2',pdf_pad:'immutable',pdf_hash:null}:null,sharepoint_sync:{pdf_run:'r1',pdf_hash:'old'},opleverruns:missing?null:{station_id:'s',dossier:{station,fotos:[],opmerkingen:[],skips:[],vereisten:[]}},stations:[],fotos:[],categorie_opmerkingen:[],categorie_skips:[]};
 const db:any=adapter(tables,fail);db.storage={from:()=>({download:async()=>({data:new Blob([new Uint8Array([1,2,3,4])]),error:null})})};return {db,tables};
}
for(const scenario of ['missing','opleverruns','fotos','categorie_opmerkingen','categorie_skips'] as const)Deno.test(`snapshot/legacy ${scenario} failure causes zero Graph mutations and no success`,async()=>{
 const {db}=source(['missing','opleverruns'].includes(scenario),scenario==='missing'?undefined:scenario,scenario==='missing');
 const original=fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Graph forbidden')};
 const claim:any={check:async()=>{},save:async()=>{}};
 try{await rejects(()=>syncEnRegistreer(db,station,claim));assert(calls===0)}finally{globalThis.fetch=original}
});
Deno.test('legitimately empty accepted snapshot has no live fallback and passes preflight',async()=>{
 const {db}=source(true,'fotos');const b=await leesSyncBron(db,station);assert(b.fotos.length===0 && b.skips.length===0);
});
Deno.test('same-length changed photo/note/NVT are rewritten for new accepted revision, same revision efficiently preserved',async()=>{
 const {db,tables}=source();const cat=CATEGORIES[0],skip=CATEGORIES[1];
 tables.opleverruns.dossier={station,vereisten:[],fotos:[{id:'b',categorie:cat.name,storage_path:'new/b',volgorde:1}],opmerkingen:[{categorie:cat.name,opmerking:'geel'}],skips:[{categorie:skip.name,reden:'geel'}]};
 const photo=new Uint8Array([9,8,7,6]);db.storage={from:(bucket:string)=>({download:async()=>({data:new Blob([bucket==='to-fotos'?photo:new Uint8Array([1,2,3,4])]),error:null})})};
 const files=new Map<string,Uint8Array>();const writes:string[]=[];const original=fetch;
 globalThis.fetch=async(input,init)=>{
  const url=String(input),method=init?.method??'GET';assert(url.startsWith('https://graph.microsoft.com/'));
  const match=url.match(/root:\/(.*?)(?::|$)/);const path=decodeURIComponent(match?.[1]??'');
  if(method==='PUT'){files.set(path,new Uint8Array(init?.body as Uint8Array));writes.push(path);return Response.json({id:path})}
  if(method==='GET'&&url.includes('/children?')){const value=[...files].filter(([p])=>p.substring(0,p.lastIndexOf('/'))===path).map(([p,b])=>({id:p,name:p.substring(p.lastIndexOf('/')+1),size:b.length,file:{}}));return Response.json({value})}
  return Response.json({id:'folder',webUrl:'https://example.invalid/local',folder:{}});
 };
 const ctx:any={tok:'fake',root:'/drives/fake/root',driveId:'fake',prefix:[],metadata:false,claim:{check:async()=>{}}};
 try{
  const b=await leesSyncBron(db,station);await syncStation(ctx,db,station,null,false,b);
  const photoPath=[...files.keys()].find(p=>p.endsWith('.jpg'));const notePath=[...files.keys()].find(p=>p.endsWith('opmerkingen.txt'));const nvtPath=[...files.keys()].find(p=>p.endsWith('_NIET GEMAAKT.txt'));assert(photoPath&&notePath&&nvtPath);
  // Preseed old same-length bytes; the old successful revision remains r1.
  files.set(photoPath??'',new Uint8Array([6,7,8,9]));for(const p of [notePath,nvtPath])if(p)files.set(p,new TextEncoder().encode(new TextDecoder().decode(files.get(p)).replaceAll('geel','rood')));
  writes.length=0;await syncStation(ctx,db,station,null);assert(writes.includes(photoPath??''));assert(files.get(photoPath??'')?.[0]===9);assert(new TextDecoder().decode(files.get(notePath??'')).includes('geel'));assert(new TextDecoder().decode(files.get(nvtPath??'')).includes('geel'));
  tables.sharepoint_sync={pdf_run:'r2',pdf_hash:await hashBytes(new Uint8Array([1,2,3,4]))};writes.length=0;await syncStation(ctx,db,station,null);assert(writes.length===0,'same revision should not reupload');assert(![...files.keys()].some(p=>p.includes('10 Documenten')));
 }finally{globalThis.fetch=original}
});
Deno.test('orchestrator re-reads after claim: stale null PDF cannot retry a published/terminal run',async()=>{
 const old={id:'r',station_id:'s',status:'pdf_bezig',pdf_pad:null};let read=0,saves=0;
 const db:any={from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:++read===1?old:{...old,status:'afgerond',pdf_pad:'immutable'},error:null})};return q},rpc:async(name:string)=>{if(name==='verwerking_opslaan'||name==='verwerking_run_cas')saves++;return {data:name==='station_claim'?1:name==='verwerking_wachtrij_snapshot'?null:name==='opleverrun_verweesd'?false:true,error:null}}};
 assert(await verwerk(db,'r'));assert(read===2 && saves===0);
});

Deno.test('accepted all-NVT dossier passes without live photo/note/skip reads',async()=>{
 const {db,tables}=source(true,'fotos');tables.opleverruns.dossier.vereisten=CATEGORIES.map(c=>({naam:c.name,minimum:1}));tables.opleverruns.dossier.skips=CATEGORIES.map(c=>({categorie:c.name,reden:'Niet van toepassing'}));
 const b=await leesSyncBron(db,station);assert(b.fotos.length===0 && b.skips.length===CATEGORIES.length);
});
Deno.test('published PDF is observed under fresh claim rather than old null-PDF read',async()=>{
 const at='2026-11-21T12:00:00.000Z',old={id:'r',station_id:'s',status:'pdf_bezig',pdf_pad:null,pdf_run:at,pdf_poging_op:at,poging:0,stap_fouten:{},html_pad:'html'};
 let reads=0,claims=0;const saved:any[]=[];let current:any={...old,pdf_pad:'immutable'};
 const db:any={from:(table:string)=>{const result=()=>table==='opleverruns'?(++reads===1?old:current):table==='stations'?station:{status:'klaar',geaccepteerde_run:'r',pdf_pad:'immutable',gestart_op:at};const q:any={select:()=>q,eq:()=>q,single:async()=>({data:result(),error:null}),maybeSingle:async()=>({data:result(),error:null})};return q},storage:{from:()=>({download:async()=>({data:new Blob(['pdf']),error:null})})},rpc:async(name:string,args:any)=>{
  if(name==='verwerking_opslaan'){saved.push(args._run_patch);current={...current,...args._run_patch}}
  return {data:name==='station_claim'?(++claims===1?1:null):name==='verwerking_wachtrij_snapshot'?null:name==='opleverrun_verweesd'?false:true,error:null};
 }};
 await verwerk(db,'r');assert(saved.length===1 && saved[0].status==='pdf_klaar');assert(!saved.some(p=>p.status==='wacht_op_retry'));
});

Deno.test("lost/409 PDF wakeup leaves durable cursor, busy claim cannot erase it, next invocation resumes",async()=>{
 const png=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII="),c=>c.charCodeAt(0));
 const f={id:"p",categorie:CATEGORIES[0].name,storage_path:"source/p",review_status:"pending"};
 const dossier={station,fotos:[f],opmerkingen:[],skips:[],instellingen:{},acties:[],vereisten:[]};
 let cursor=0,busy=false,released=false,wakes=0,published=false;
 const files=new Map<string,Uint8Array>();
 const sb:any={storage:{from:()=>({download:async(p:string)=>({data:p.includes('pdf-cache')?new Blob([png]):files.has(p)?new Blob([new Uint8Array(files.get(p)??[])]):null,error:null}),upload:async(p:string,b:Uint8Array)=>{files.set(p,b);return {error:null}}})},rpc:async(name:string,args:any)=>{
  if(name==='station_claim'){released=false;return {data:busy?null:1,error:null}}
  if(name==='pdf_stap_start')return {data:{status:'pdf_bezig',pdf_stap:cursor,pdf_poging_op:'2026-11-21T12:00:00Z'},error:null};
  if(name==='verwerking_snapshot')return {data:dossier,error:null};
  if(name==='pdf_stap_klaar'){assert(args._stap===cursor);cursor++;return {data:true,error:null}}
  if(name==='station_claim_check'&&args._vrijgeven)released=true;
  if(name==='verwerking_opslaan'&&args._run_patch?.pdf_pad)published=true;
  return {data:name==='verwerking_wachtrij_snapshot'?null:true,error:null};
 }};
 const adapters={sb,wakeup:async()=>{assert(released,'no nested claim');wakes++;throw new Error('409 or response lost')},kick:async()=>{}};
 await voorbereiden('s','r',99,true,adapters);assert(cursor===1 && wakes===1 && !published);
 busy=true;await voorbereiden('s','r',0,true,adapters);assert(cursor===1 && wakes===1 && !published);
 busy=false;await voorbereiden('s','r',0,true,adapters);assert(published && cursor===1);
});
