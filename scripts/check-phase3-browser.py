import asyncio,json,re,base64,os
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get("PHASE3_BROWSER_RESULTS", "/tmp/browser/phase3"))
ROOT.mkdir(parents=True, exist_ok=True)
SID='80000000-0000-4000-8000-000000000001'
TV='80000000-0000-4000-8000-000000000002'
LONG='WerkverantwoordelijkeMetEenBijzonderLangeNaamZonderSpatiesVoorMobieleControle'
def station(id,vg=False):
 return dict(id=id,naam_msr='Station Lange naam',casenummer='LOCAL-VG' if vg else 'LOCAL-TV',casenaam='ZeerLangeCasenaamZonderSpatiesVoorControleOpMobieleSchermen',behuizingsnummer='1234',status='concept',dossier_status='ingediend',dossier_notitie='Bestaande notitie',dossier_notitie_versie=0,case_verborgen=False,created_at='2026-11-01T00:00:00Z',uitvoerder='van_gelder' if vg else 'terrevolt',wv=LONG,is_nummer='LOCAL',tg=False,on_hold=False,on_hold_reden=None,on_hold_partij=None,on_hold_sinds=None,on_hold_tot=None,hold_periodes=[],opdrachtgever='van Gelder',type_ruimte=None,ingevuld_door='Lokale monteur',datum='2026-11-01',fotos=[])
def rounds(s):
 return [dict(id='r'+s['id'],station_id=s['id'],nummer=1,status='afgekeurd',ingediend_op=None,ingediend_bij='Liander',reactie_op=None,redenen=[],notitie=None,to_acties=[dict(id='a'+str(i),station_id=s['id'],ronde_id='r'+s['id'],omschrijving='Actiepunt '+p,bij=p,derde_naam=None,notitie=None,afgehandeld_op=None,created_at='2026-11-02T00:00:00Z') for i,p in enumerate(['TerreVolt','Liander','Derden'])])]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [360,390,428]:
   ctx=await browser.new_context(viewport={'width':width,'height':844})
   unlocked=True
   page=await ctx.new_page(); data={SID:station(SID,True),TV:station(TV)}; reads=[]; writes=[]; errors=[]
   page.on('pageerror',lambda e: errors.append(str(e)))
   async def fake(route):
    nonlocal unlocked
    req=route.request; u=urlparse(req.url); path=u.path; q=parse_qs(u.query)
    if u.hostname in ['localhost','fonts.googleapis.com','fonts.gstatic.com']: await route.continue_(); return
    if '/rest/v1/' not in path and '/functions/v1/' not in path and '/auth/v1/' not in path:
     await route.abort(); return
    # Every backend request is intercepted; no real backend or SharePoint calls.
    name=path.split('/')[-1]; body=req.post_data_json if req.post_data else {}; result=[]
    if req.method=='GET': reads.append({'name':name,'query':q})
    else: writes.append({'name':name,'body':body})
    if name=='instellingen': result=[]
    elif name=='beheer_status': result='2026-11-21T20:19:00Z' if unlocked else None
    elif name=='beheer_vergrendelen': unlocked=False;result=True
    elif name=='heeft_beheer': result=unlocked
    elif name=='pin-sessie': result={'ok':False,'error':'Onjuiste code'}
    elif name=='case_wv_suggesties': result=[{'wv':LONG}]
    elif name=='url_candidates': result=list(data.values()) if not body.get('_key') else [s for s in data.values() if body['_key'].lower().startswith(s['casenummer'].lower()) or body['_key']==s['id']]
    elif name=='opdrachtgevers': result=[{'naam':'van Gelder'}]
    elif name=='case_overzicht': result=[dict(id=s['id'],station=s,rondes=rounds(s)) for s in data.values()]
    elif name=='stations':
     ident=(q.get('id',[''])[0]).replace('eq.','')
     s=data.get(ident)
     if req.method=='PATCH':
      s.update(body); result=[{'id':ident}]
     elif s: result={**s,'to_rondes':rounds(s)} if 'to_rondes' in q.get('select',[''])[0] else s
     elif q.get('select')==['casenummer']: result=[{'casenummer':s['casenummer']} for s in data.values()]
     else: result=[{**data[TV],'to_rondes':rounds(data[TV])}]
    elif name=='case_notitie_opslaan':
     s=data[body['_station_id']]
     if body['_versie']!=s['dossier_notitie_versie']: result={'conflict':True,'tekst':s['dossier_notitie'],'versie':s['dossier_notitie_versie']}
     else: s['dossier_notitie']=body['_tekst'];s['dossier_notitie_versie']+=1;result={'conflict':False,'tekst':s['dossier_notitie'],'versie':s['dossier_notitie_versie']}
    elif name=='case_hold_start':
     s=data[body['_station_id']]; h=dict(id=body['_periode_id'],begin_op='2026-11-21',einde_op=None,reden=body['_reden'],partij=body['_partij'])
     s['hold_periodes']=[h];s.update(on_hold=True,on_hold_sinds=h['begin_op'],on_hold_reden=h['reden'],on_hold_partij=h['partij']);result=h['id']
    elif name=='case_hold_hervat':
     s=data[body['_station_id']];s['hold_periodes'][0]['einde_op']='2026-11-21';s['on_hold']=False;result=True
    elif name=='opleverketen': result={'ok':True,'run':None}
    elif '/auth/' in path: result={}
    await route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
   await page.route('**/*',fake)
   await page.goto('http://localhost:8080/cases/'+SID,wait_until='networkidle')
   await page.get_by_role('heading',level=1).wait_for()
   cold=[r for r in reads if r['name'] in ['stations','case_overzicht']]
   assert len(cold)==2 and all(r['name']=='stations' and r['query'].get('id')==['eq.'+SID] for r in cold),cold
   assert await page.get_by_text('Indieningsdatum onbekend',exact=True).count()==1
   async def fits(label):
    size=await page.evaluate('({w:innerWidth,s:document.documentElement.scrollWidth})')
    assert size['s']<=size['w']+1,(width,label,size)
   await fits('detail');await page.screenshot(path=str(ROOT/f'{width}-detail.png'))
   note=page.get_by_role('textbox',name='Dossiernotitie');await note.fill('Nieuwe notitie tijdens hervatten')
   await page.get_by_role('button',name='On hold zetten',exact=True).click()
   dialog=page.get_by_role('dialog');await dialog.get_by_role('textbox',name='Reden',exact=True).fill('Wacht op vergunning')
   await dialog.get_by_role('radio',name='Liander',exact=True).click()
   await dialog.get_by_role('button',name='On hold zetten',exact=True).click()
   await page.get_by_role('button',name='Hervatten',exact=True).wait_for()
   await note.fill('Laatste tekst vlak voor hervatten');await page.get_by_role('button',name='Hervatten',exact=True).click()
   await page.get_by_role('button',name='On hold zetten',exact=True).wait_for()
   assert data[SID]['dossier_notitie']=='Laatste tekst vlak voor hervatten',data[SID]['dossier_notitie']
   await page.get_by_role('button',name=re.compile('Wie moet wat doen')).click()
   await page.get_by_role('button',name='TO-score',exact=True).click();await fits('score');await page.screenshot(path=str(ROOT/f'{width}-score.png'))
   await page.get_by_text('Bal bij',exact=True).locator('..').locator('..').screenshot(path=str(ROOT/f'{width}-score-table.png'))
   await page.get_by_role('button',name='Wie moet wat doen',exact=True).click()
   await page.get_by_role('button',name='Importeren uit Excel',exact=True).click()
   await page.get_by_role('textbox',name='Geplakte Excel-rijen').fill('Casenummer\tCasenaam\tWV\nLOCAL-NEW\t'+LONG+'\t'+LONG)
   await fits('import');await page.wait_for_timeout(350);await page.screenshot(path=str(ROOT/f'{width}-import.png'))
   await page.get_by_role('button',name='Annuleren',exact=True).click()
   await page.get_by_role('button',name=re.compile('Stations')).click()
   await page.get_by_role('button',name=re.compile('Nieuw station')).wait_for();await fits('index')
   target=page.get_by_role('button',name=re.compile('Nieuw station'))
   box=await target.bounding_box();assert box and box['x']>=0 and box['x']+box['width']<=width
   await page.screenshot(path=str(ROOT/f'{width}-index.png'))
   # Previously opened station remains available offline; no lazy photo/note module needed.
   await page.get_by_role('button',name=re.compile('LOCAL-TV')).first.click()
   await page.get_by_text('Station Lange naam',exact=False).first.wait_for()
   await page.get_by_role('button',name='Terug naar stations',exact=True).click()
   await ctx.set_offline(True)
   await page.get_by_role('button',name=re.compile('LOCAL-TV')).first.click()
   await page.get_by_text('Station Lange naam',exact=False).first.wait_for()
   await fits('offline station');await page.wait_for_function('Array.from(document.querySelectorAll("main")).every(el => Number(getComputedStyle(el).opacity)>0.99)');await page.screenshot(path=str(ROOT/f'{width}-offline.png'))
   await page.get_by_role('button',name=re.compile('Doorgaan')).click()
   await page.locator('input[type=file]').first.set_input_files({'name':'local.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=')})
   await page.get_by_role('button',name=re.compile('Notitie')).first.click()
   sheet=page.get_by_role('dialog',name=re.compile('Notitie:'));await sheet.get_by_role('textbox').fill('Offline categorienotitie')
   await sheet.get_by_role('button',name='Opslaan',exact=True).click()
   await page.wait_for_function('Object.values(JSON.parse(localStorage.getItem("notitie-wachtrij-v1")||"{}")).some(n => n.tekst==="Offline categorienotitie")')
   count=await page.evaluate('''() => new Promise((resolve,reject) => { const r=indexedDB.open('terrevolt-offline'); r.onsuccess=()=>{const d=r.result;const c=d.transaction('photo-queue').objectStore('photo-queue').count();c.onsuccess=()=>{resolve(c.result);d.close()};c.onerror=reject};r.onerror=reject })''')
   assert count==1, count
   await page.screenshot(path=str(ROOT/f'{width}-offline-photo-note.png'))
   await page.get_by_role('button',name='Sluiten',exact=True).click()
   await page.evaluate('''() => new Promise(resolve => { const r=indexedDB.open('terrevolt-offline'); r.onsuccess=()=>{const d=r.result;const t=d.transaction('photo-queue','readwrite');t.objectStore('photo-queue').clear();t.oncomplete=()=>{d.close();localStorage.removeItem('notitie-wachtrij-v1');resolve(true)}} })''')
   await ctx.set_offline(False)
   await page.get_by_role('button',name='Beheer vergrendelen',exact=True).click(timeout=30000)
   await page.get_by_role('button',name='Ontgrendelen',exact=True).click(timeout=30000)
   await page.get_by_placeholder('Toegangscode').fill('0000')
   await page.locator('form').get_by_role('button',name='Ontgrendelen',exact=True).click(timeout=30000)
   await page.get_by_text('Onjuiste code',exact=True).wait_for();await fits('PIN error')
   await page.screenshot(path=str(ROOT/f'{width}-pin.png'))
   await page.get_by_role('button',name='Annuleren',exact=True).click()
   print(json.dumps({'width':width,'coldStationReads':len(cold),'summaryReadOnCold':False,'noteResume':'saved/readback','offlineStation':'opened','offlinePhotoCount':count,'offlineCategoryNote':'retained','pinError':'visible','pageErrors':errors}))
   assert not errors,errors
   await ctx.close()
  await browser.close()
asyncio.run(main())
