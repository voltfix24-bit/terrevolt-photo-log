"""All backend/Storage/Graph calls are intercepted; browser emulation, not iPhone hardware."""
import asyncio,json,re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/review3'); ROOT.mkdir(parents=True,exist_ok=True)
SID='80000000-0000-4000-8000-000000000001'
FAIL='80000000-0000-4000-8000-000000000099'
LONG='EenZeerLangeCasenaamEnWerkverantwoordelijkeZonderSpatiesVoorMobieleControle'
ST=dict(id=SID,naam_msr='Lokaal station',casenummer='LOCAL',casenaam=LONG,behuizingsnummer='1234',status='concept',dossier_status='ingediend',dossier_notitie='Bestaande notitie',dossier_notitie_versie=0,uitvoerder='van_gelder',wv=LONG,case_verborgen=False,created_at='2026-11-01T00:00:00Z',on_hold=False,hold_periodes=[])
async def configure(ctx,chunk=False):
 async def fake(route):
  req=route.request;u=urlparse(req.url);q=parse_qs(u.query);name=u.path.split('/')[-1]
  if u.hostname=='localhost':
   if chunk and 'ExcelImportDialog.tsx' in u.path: await route.abort();return
   await route.continue_();return
  if u.hostname in ['fonts.googleapis.com','fonts.gstatic.com']:await route.continue_();return
  if '/rest/v1/' not in u.path and '/functions/v1/' not in u.path and '/auth/v1/' not in u.path:await route.abort();return
  body=req.post_data_json if req.post_data else {};result=[];status=200
  if name=='stations':
   if q.get('id')==['eq.'+FAIL]:status=503;result={'message':'Local backend failure'}
   elif q.get('id')==['eq.'+SID]: result={**ST,'to_rondes':[]}
   elif q.get('select')==['casenummer']: result=[{'casenummer':'LOCAL'}]
   else:result=[]
  elif name=='url_candidates':
   if body.get('_key')=='cold-failure': status=503;result={'message':'Local slug failure'}
   else:result=[ST]
  elif name=='case_overzicht':result=[{'id':SID,'station':ST,'rondes':[]}]
  elif name=='case_wv_suggesties':result=[{'wv':LONG}]
  elif name=='beheer_status':result='2026-11-21T20:00:00Z'
  elif name=='heeft_beheer':result=True
  elif name=='case_notitie_opslaan':status=503;result={'message':'Local rejected note save'}
  elif name=='opdrachtgevers':result=[{'naam':'van Gelder'}]
  elif name=='opleverketen':result={'ok':True,'run':None}
  elif name=='instellingen':result=[]
  await route.fulfill(status=status,content_type='application/json',body=json.dumps(result))
 await ctx.route('**/*',fake)
async def fits(page,width,label):
 await page.wait_for_timeout(350)
 size=await page.evaluate('({w:innerWidth,s:document.documentElement.scrollWidth})');assert size['s']<=size['w']+1,(width,label,size)
 await page.screenshot(path=str(ROOT/f'{width}-{label}.png'))
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for width in [360,390,428]:
   ctx=await browser.new_context(viewport={'width':width,'height':844});await configure(ctx);page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://localhost:8080/cases/'+SID,wait_until='networkidle')
   note=page.get_by_role('textbox',name='Dossiernotitie');await note.fill('NieuwConceptDatNaEenFoutBewaardMoetBlijvenOpDitApparaat');await note.blur()
   await page.get_by_role('alert').filter(has_text='Niet opgeslagen').wait_for();await fits(page,width,'note-error')
   assert await page.evaluate("JSON.parse(localStorage.getItem('dossier-notitie:"+SID+"')).tekst")=='NieuwConceptDatNaEenFoutBewaardMoetBlijvenOpDitApparaat'
   await page.get_by_role('button',name=re.compile('Wie moet wat doen')).click()
   await ctx.set_offline(True);await page.get_by_role('button',name='Importeren uit Excel',exact=True).click();await page.get_by_text(re.compile('Internet vereist')).wait_for();assert await page.get_by_role('dialog').count()==0
   await ctx.set_offline(False);await page.get_by_text(re.compile('Internet vereist')).wait_for(state='hidden');await page.get_by_role('button',name='Importeren uit Excel',exact=True).click()
   await page.get_by_role('textbox',name='Geplakte Excel-rijen').fill('Casenummer\tCasenaam\tWV\nLOCAL-NEW\t'+LONG+'\t'+LONG)
   await fits(page,width,'import');await page.get_by_role('button',name='Annuleren',exact=True).click()
   await page.goto('http://localhost:8080/cases/'+FAIL,wait_until='domcontentloaded');await page.get_by_role('alert').filter(has_text='Deze pagina').wait_for(timeout=20000);await fits(page,width,'uuid-error')
   await page.get_by_role('button',name='Terug naar stations',exact=True).click();await page.goto('http://localhost:8080/cases/cold-failure',wait_until='domcontentloaded');await page.get_by_role('alert').filter(has_text='Deze pagina').wait_for(timeout=20000);await fits(page,width,'slug-error')
   assert not errors,errors;await ctx.close()
   # Fresh browser context: first import download is deliberately interrupted.
   ctx=await browser.new_context(viewport={'width':width,'height':844});await configure(ctx,True);page=await ctx.new_page();chunk_errors=[];page.on('pageerror',lambda e:chunk_errors.append(str(e)))
   await page.goto('http://localhost:8080/cases',wait_until='networkidle');await page.get_by_role('button',name='Importeren uit Excel',exact=True).click();await page.get_by_role('alert').filter(has_text='Het importscherm').wait_for();await fits(page,width,'chunk-error')
   await page.get_by_role('button',name='Sluiten',exact=True).click();await page.get_by_role('button',name='TO-score',exact=True).click();await page.get_by_text('Bal bij',exact=True).wait_for();assert await page.get_by_text('Cases & TO',exact=True).count()==1
   print(json.dumps({'width':width,'note':'retained after failure','offlineImport':'blocked before load','coldUUID':'finite error','coldSlug':'finite error','chunkError':'contained, Cases still usable','pageErrors':errors,'chunkPageErrors':chunk_errors}))
   assert not chunk_errors,chunk_errors;await ctx.close()
  await browser.close()
asyncio.run(main())
