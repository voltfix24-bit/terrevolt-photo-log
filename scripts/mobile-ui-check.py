import sys
"""Herhaalbare mobiele UI-check (TO Foto's).
Leest echte data alleen-lezend; ALLE schrijfverzoeken worden in de testbrowser geblokkeerd.
Modus 'beheer' mockt alleen heeft_beheer/beheer_status (UI-ontgrendeld beeld; schrijven blijft geblokkeerd).
Gebruik: python3 scripts/mobile-ui-check.py [uitvoermap]"""
import asyncio, json, re, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/browser/mobiel'); OUT.mkdir(parents=True, exist_ok=True)
B = 'http://localhost:8080'
NIEUW = '064a9f01-6bda-42ef-a8a3-6ee352278c1c'; INGEVULD = '2113ca24-7d71-47be-908e-04e482c90f1a'
OPGELEVERD = 'f0ad25e8-6714-4ca1-9583-c743d784ab06'; VG = '93bc56b7-0ae8-4685-8d53-b889db2aac98'
LEES_RPC = {'beheer_status', 'url_candidates', 'heeft_beheer', 'fotowerk_toegestaan', 'case_wv_suggesties', 'dossier_eindcontrole'}
geblokkeerd = []
async def configure(ctx, beheer=False):
    async def r(route):
        q = route.request; u = urlparse(q.url); naam = u.path.rstrip('/').split('/')[-1]
        if u.hostname in ('localhost', 'fonts.googleapis.com', 'fonts.gstatic.com'): return await route.continue_()
        if beheer and naam in ('heeft_beheer',): return await route.fulfill(status=200, content_type='application/json', body='true')
        if beheer and naam == 'beheer_status': return await route.fulfill(status=200, content_type='application/json', body=json.dumps('2099-01-01T08:00:00Z'))
        if q.method in ('GET', 'HEAD', 'OPTIONS'): return await route.continue_()
        if '/rest/v1/rpc/' in u.path and naam in LEES_RPC: return await route.continue_()
        if '/functions/v1/opleverketen' in u.path and (q.post_data or '').find('"status"') >= 0: return await route.continue_()
        if '/functions/v1/sharepoint-documenten' in u.path: return await route.continue_()
        if '/auth/v1/token' in u.path: return await route.continue_()
        geblokkeerd.append(f'{q.method} {u.path}')
        await route.fulfill(status=503, content_type='application/json', body='{"message":"geblokkeerd in mobiele test"}')
    await ctx.route('**/*', r)
AUDIT = r'''() => {
 const vw = innerWidth, sw = document.documentElement.scrollWidth;
 const sel = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],summary,[role=menuitem]';
 const klein = [], font = [], buiten = [];
 for (const el of document.querySelectorAll(sel)) {
  const cs = getComputedStyle(el); const tegel = /INPUT|TEXTAREA|SELECT/.test(el.tagName) && el.closest('label');
  const r = (tegel && tegel.getBoundingClientRect().height >= 43.5) ? tegel.getBoundingClientRect() : el.getBoundingClientRect();
  if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[aria-hidden=true]')) continue;
  if (el.type === 'file' || el.type === 'checkbox' && r.width < 2) continue;
  const t = (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.tagName).trim().slice(0, 40);
  const inline = el.tagName === 'A' && cs.display === 'inline';
  if (!inline && (r.height < 43.5 || r.width < 43.5)) klein.push(`${t} ${Math.round(r.width)}x${Math.round(r.height)}`);
  if (/INPUT|SELECT|TEXTAREA/.test(el.tagName) && parseFloat(cs.fontSize) < 16) font.push(`${t} ${cs.fontSize}`);
  const scrollt = (() => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; })();
  if ((r.right > vw + 1 || r.left < -1) && !scrollt) buiten.push(`${t} ${Math.round(r.left)}..${Math.round(r.right)}`);
 }
 return {vw, sw, overflow: sw > vw + 1, klein: [...new Set(klein)], font, buiten};
}'''
resultaten = []
async def audit(page, label, w):
    await page.wait_for_timeout(600)
    a = await page.evaluate(AUDIT); a.update(label=label, w=w, url=page.url.replace(B, ''))
    shot = OUT / f'{w}-{re.sub(r"[^a-z0-9]+", "-", label.lower())}.png'
    await page.screenshot(path=str(shot)); a['shot'] = str(shot); resultaten.append(a)
    print(f"{w} {label}: overflow={a['overflow']} klein={len(a['klein'])} font<16={len(a['font'])} buiten={len(a['buiten'])}")
async def klik(page, loc, label):
    try:
        await loc.first.click(timeout=6000); return True
    except Exception as e:
        resultaten.append({'label': label, 'fout': 'niet klikbaar/gevonden: ' + str(e).splitlines()[0]}); print('NIET GEVONDEN', label); return False
async def ga(page, pad, wacht='main, body'):
    await page.goto(B + pad, wait_until='domcontentloaded')
    await page.locator('body').wait_for()
    await page.wait_for_function("!document.querySelector('[data-laden],[aria-busy=true]')", timeout=20000)
async def run(browser, w, h=844, zoom=None, beheer=False, alleen=None):
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
    await configure(ctx, beheer); page = await ctx.new_page(); fouten = []
    page.on('pageerror', lambda e: fouten.append(str(e)))
    sfx = (f' zoom{zoom}' if zoom else '') + (f' h{h}' if h != 844 else '') + (' beheer' if beheer else '')
    async def A(l): 
        if zoom: await page.evaluate(f"document.documentElement.style.zoom='{zoom}%'")
        await audit(page, l + sfx, w)
    stappen = alleen or ['home', 'nieuw', 'station', 'wizard', 'ingevuld', 'opgeleverd', 'beoordelen', 'cases', 'casedetail', 'instellingen', 'lijsten', 'fout']
    if 'home' in stappen:
        await ga(page, '/'); await A('Stations start')
        if await klik(page, page.get_by_role('button', name='Zoeken'), 'zoeken'):
            await page.keyboard.type('Wezep'); await A('Stations zoeken')
    if 'nieuw' in stappen:
        await ga(page, '/stations/new'); await A('Nieuw station')
    if 'station' in stappen:
        await ga(page, '/stations/' + NIEUW); await page.get_by_role('navigation', name='Stationnavigatie').wait_for(timeout=20000); await A('Station nieuw')
        if await klik(page, page.get_by_role('button', name='Meer acties'), 'Meer'): await A('Station Meer'); await page.keyboard.press('Escape')
        if await klik(page, page.get_by_role('button', name=re.compile('^Beheer')), 'Beheer'): await A('Station beheer-popover'); await page.keyboard.press('Escape')
        if await klik(page, page.get_by_text('Casegegevens'), 'Casegegevens'): await A('Station Casegegevens open')
        await page.evaluate('scrollTo(0, document.body.scrollHeight)'); await A('Station onderkant')
    if 'wizard' in stappen:
        await ga(page, '/stations/' + NIEUW); await page.get_by_role('navigation', name='Stationnavigatie').wait_for(timeout=20000)
        if await klik(page, page.get_by_role('button', name='Start fotowerk'), 'Start fotowerk'):
            await page.get_by_role('button', name='Foto maken', exact=True).first.wait_for(timeout=15000); await A('Fotowizard categorie')
            if await klik(page, page.get_by_role('button', name='Voorbeeldfoto vergroten'), 'Voorbeeld'): await A('Voorbeeld lightbox'); await page.keyboard.press('Escape')
            if await klik(page, page.get_by_role('button', name=re.compile('Notitie|Opmerking', re.I)), 'Notitie'):
                await page.set_viewport_size({'width': w, 'height': int(h * 0.55)}); await A('NotitieSheet toetsenbord-sim'); await page.set_viewport_size({'width': w, 'height': h}); await page.keyboard.press('Escape')
    if 'ingevuld' in stappen:
        await ga(page, '/stations/' + INGEVULD); await page.get_by_role('navigation', name='Stationnavigatie').wait_for(timeout=20000); await A('Station ingevuld')
        await ga(page, page.url.replace(B, '') + '/opleveren'); await A('Opleveren')
        await ga(page, '/stations/' + INGEVULD + '/documenten'); await A('Documenten deeplink')
    if 'opgeleverd' in stappen:
        await ga(page, '/stations/' + OPGELEVERD); await page.get_by_role('navigation', name='Stationnavigatie').wait_for(timeout=20000); await A('Station opgeleverd')
        await ga(page, '/stations/' + OPGELEVERD + '/rapport'); await A('Rapport-opener')
    if 'beoordelen' in stappen:
        await ga(page, '/beoordelen'); await A('Beoordelen overzicht')
        await ga(page, '/beoordelen/' + OPGELEVERD); await page.wait_for_timeout(1500); await A('BeoordeelDossier')
    if 'cases' in stappen:
        await ga(page, '/cases'); await page.get_by_role('button', name='Meer acties').wait_for(timeout=20000); await A('Cases start')
        for groep in ['Weergave', 'Uitvoering']:
            g = page.get_by_role('group', name=groep).or_(page.locator(f'[aria-label="{groep}"]'))
            n = await g.first.locator('button,[role=tab],[role=radio]').count()
            for i in range(n):
                b = g.first.locator('button,[role=tab],[role=radio]').nth(i); t = (await b.inner_text()).strip().split('\n')[0]
                await b.click(); await A(f'Cases {groep} {t}')
        if await klik(page, page.get_by_role('button', name='Meer acties'), 'Cases menu'): await A('Cases actiemenu')
        if await klik(page, page.get_by_role('menuitem', name=re.compile('Case toevoegen')).or_(page.get_by_role('button', name=re.compile('Case toevoegen'))), 'Case toevoegen'):
            await A('Case toevoegen dialoog'); await page.keyboard.press('Escape')
        await ga(page, '/cases'); await page.get_by_role('button', name='Meer acties').wait_for(timeout=20000)
        await klik(page, page.get_by_role('button', name='Meer acties'), 'Cases menu 2')
        if await klik(page, page.get_by_role('menuitem', name=re.compile('Excel')).or_(page.get_by_role('button', name=re.compile('Excel'))), 'Excel'):
            ta = page.get_by_role('textbox', name='Geplakte Excel-rijen')
            if await ta.count():
                await ta.fill('Casenummer\tCasenaam\tWV\n0295546\tBestaat al\tX\nTEST-0001\t' + 'ZeerLangeFictieveCasenaamZonderSpaties' * 2 + '\tFictief\nTEST-0002\t\t')
            await A('Excelimport preview')
    if 'casedetail' in stappen:
        for lab, sid in [('CaseDetail TerreVolt', '6cdf0626-c64f-4791-a5bb-9b948b569315'), ('CaseDetail Van Gelder', VG), ('CaseDetail opgeleverd', OPGELEVERD)]:
            await ga(page, '/cases/' + sid); await page.wait_for_timeout(1200); await A(lab)
    if 'instellingen' in stappen:
        await ga(page, '/instellingen'); await page.wait_for_timeout(1200); await A('Instellingen')
        await ga(page, '/instellingen/categorieen'); await page.wait_for_timeout(1200); await A('Categoriebeheer')
    if 'lijsten' in stappen:
        await ga(page, '/van-gelder'); await A('Opdrachtgever'); await ga(page, '/van-gelder/2026'); await A('Jaarlijst')
        await ga(page, '/c/0295546'); await A('Korte link')
    if 'fout' in stappen:
        await ga(page, '/bestaat-zeker-niet/x/y/z'); await A('404')
    if fouten: resultaten.append({'label': f'pageerrors {w}{sfx}', 'fout': fouten})
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for w in (320, 390, 430): await run(b, w)
        await run(b, 390, beheer=True, alleen=['station', 'instellingen', 'cases'])
        await run(b, 246, h=649, alleen=['station', 'nieuw', 'cases', 'ingevuld'])
        await run(b, 740, h=360, alleen=['station', 'wizard', 'cases'])
        await b.close()
    (OUT / 'resultaat.json').write_text(json.dumps({'resultaten': resultaten, 'geblokkeerd': sorted(set(geblokkeerd))}, indent=1))
    print('geblokkeerde schrijfverzoeken:', sorted(set(geblokkeerd)))
    falen = [r for r in resultaten if r.get('fout') or r.get('overflow') or r.get('font') or r.get('buiten') or r.get('klein')]
    for r in falen: print('FOUT', r.get('label'), {k: r.get(k) for k in ('fout', 'overflow', 'font', 'buiten', 'klein') if r.get(k)})
    print(f'{len(resultaten)} metingen, {len(falen)} fouten')
    sys.exit(1 if falen else 0)
asyncio.run(main())
