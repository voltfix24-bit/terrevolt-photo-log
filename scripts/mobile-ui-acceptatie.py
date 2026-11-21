"""Gerichte mobiele acceptatiecheck TO Foto's (aanvulling op scripts/mobile-ui-check.py).
Leest echte data ALLEEN-LEZEND; elk schrijfverzoek wordt in de testbrowser geblokkeerd (exacte allowlist).
Fictieve toestanden ontstaan door antwoorden in deze testbrowser te patchen of te vervangen (zie FIXTURES);
niets daarvan zit in de app of bereikt de backend. Faalt (exit 1) bij: ontbrekende verplichte overlay/titel,
JS-pagefout, paginaoverflow, materiële clipping, dialoog buiten beeld, onbereikbare laatste actie, tikvlak <44px.
Gebruik: python3 scripts/mobile-ui-acceptatie.py <groep> [uitvoermap]   groepen: station beoordelen cases overig"""
import asyncio, json, re, sys, copy
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, expect
GROEP = sys.argv[1] if len(sys.argv) > 1 else 'station'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '/tmp/browser/acceptatie') / GROEP; OUT.mkdir(parents=True, exist_ok=True)
B = 'http://localhost:8080'
NIEUW = '064a9f01-6bda-42ef-a8a3-6ee352278c1c'; INGEVULD = '2113ca24-7d71-47be-908e-04e482c90f1a'
OPGELEVERD = 'f0ad25e8-6714-4ca1-9583-c743d784ab06'; RONDE = '520ed3e1-794b-4953-b907-f0fba0f1fed7'
# Exacte leesallowlist (geen substringmatch)
LEES_RPC = {'beheer_status', 'url_candidates', 'heeft_beheer', 'fotowerk_toegestaan', 'case_wv_suggesties', 'dossier_eindcontrole'}
LEES_FUNC = {'sharepoint-documenten'}
LANG_ONBEKEND = 'UitvoeringsverantwoordelijkeBijAannemer'
MATEN = {'320': (320, 568), '390': (390, 844), '430': (430, 932), 'liggend': (740, 360), 'zoom130': (246, 437)}
# Onderstaande kleine elementen zijn bewust geen eigen tikvlak (reden in rapport).
KLEIN_OK = re.compile(r'^(bv\. .*|Primaire knop|Foto \d+: .*)$')
fouten, metingen, geblokkeerd = [], [], set()

def walk(o, f):
    if isinstance(o, list): return [walk(x, f) for x in o]
    if isinstance(o, dict): o = f(o) or o; return {k: walk(v, f) for k, v in o.items()}
    return o

async def context(browser, maat, fx):
    w, h = MATEN[maat]
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True)
    teller = {}
    async def r(route):
        try: await r2(route)
        except Exception: pass
    async def r2(route):
        q = route.request; u = urlparse(q.url); naam = u.path.rstrip('/').split('/')[-1]; qs = parse_qs(u.query)
        if u.hostname in ('localhost', 'fonts.googleapis.com', 'fonts.gstatic.com'): return await route.continue_()
        teller[naam] = teller.get(naam, 0) + 1
        sleutel = f'{q.method} {naam}'
        if sleutel in fx.get('fail', {}) and teller[naam] <= fx['fail'][sleutel]:
            return await route.fulfill(status=503, content_type='application/json', body='{"message":"fictieve leesfout"}')
        if sleutel in fx.get('vast', {}):
            v = fx['vast'][sleutel]; v = v(teller[naam], q) if callable(v) else v
            return await route.fulfill(status=v[0], content_type='application/json', body=json.dumps(v[1]))
        if fx.get('beheer') and naam in ('heeft_beheer',): return await route.fulfill(status=200, content_type='application/json', body='true')
        if fx.get('beheer') and naam == 'beheer_status': return await route.fulfill(status=200, content_type='application/json', body=json.dumps('2099-01-01T08:00:00Z'))
        lezen = q.method in ('GET', 'HEAD', 'OPTIONS') or ('/rest/v1/rpc/' in u.path and naam in LEES_RPC) or ('/functions/v1/' in u.path and naam in LEES_FUNC) or u.path == '/auth/v1/token'
        if '/functions/v1/opleverketen' in u.path:
            try: lezen = (q.post_data_json or {}).get('actie') == 'status'
            except Exception: lezen = False
        if not lezen:
            geblokkeerd.add(sleutel)
            return await route.fulfill(status=503, content_type='application/json', body='{"message":"geblokkeerd in mobiele test"}')
        if sleutel in fx.get('patch', {}) and (q.method == 'GET' or naam in LEES_RPC):
            resp = await route.fetch(); data = await resp.json()
            data = fx['patch'][sleutel](copy.deepcopy(data), qs)
            return await route.fulfill(status=resp.status, headers={**resp.headers, 'content-type': 'application/json'}, body=json.dumps(data))
        await route.continue_()
    await ctx.route('**/*', r)
    page = await ctx.new_page(); page.pe = []
    page.on('pageerror', lambda e: page.pe.append(str(e)))
    return ctx, page

MEET = r'''([dlg]) => {
 const vv = window.visualViewport, vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight;
 const res = {vw, vh, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, clip: [], klein: [], font: [], dlg: null};
 const scrollt = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; };
 const zichtbaar = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden=true],[inert]'); };
 const root = dlg ? document.querySelector(dlg) : document;
 for (const el of root.querySelectorAll('*')) {
  if (!zichtbaar(el) || el.closest('.material-symbols-rounded')) continue;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
  const tekst = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  if (tekst && (r.right > vw + 1 || r.left < -1) && !scrollt(el)) res.clip.push(`${el.textContent.trim().slice(0, 40)} ${Math.round(r.left)}..${Math.round(r.right)}`);
  if (el.matches('button,a[href],select,[role=button],[role=tab],[role=menuitem],[role=switch],[role=radio],[role=option],[role=checkbox],summary')) {
   const cs = getComputedStyle(el); if (el.tagName === 'A' && cs.display === 'inline') continue; if (el.disabled) continue;
   if (r.bottom < 0 || r.top > vh) continue;
   const t = (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
   if (r.height < 43.5 || r.width < 43.5) res.klein.push(`${t} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  if (el.matches('input:not([type=hidden]):not([type=file]):not([type=checkbox]),select,textarea') && parseFloat(getComputedStyle(el).fontSize) < 16) res.font.push(el.getAttribute('aria-label') || el.placeholder || el.name);
 }
 if (dlg) { const d = document.querySelector(dlg); if (d) { const r = d.getBoundingClientRect();
   const kan = d.scrollHeight > d.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(d).overflowY);
   res.dlg = {top: r.top, bottom: r.bottom, h: r.height, scrollbaar: kan, sh: d.scrollHeight, ch: d.clientHeight}; } }
 return res; }'''

async def meet(page, label, maat, dlg=None, laatste=None, titel=None):
    await page.wait_for_function('() => !document.getAnimations().some(a => a.playState === "running" && !(a.effect && a.effect.getComputedTiming().iterations === Infinity) && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest("[role=dialog],[role=alertdialog],[role=menu]"))', timeout=10000)
    m = await page.evaluate(MEET, [dlg]); m.update(label=label, maat=maat, url=page.url.replace(B, ''))
    probleem = []
    if m['overflow']: probleem.append('paginaoverflow')
    if getattr(page, 'pe', None): probleem.append('JS-fout: ' + ' | '.join(page.pe[:3])); page.pe.clear()
    if m['clip']: probleem.append('clipping: ' + '; '.join(m['clip'][:4]))
    klein = [k for k in m['klein'] if not KLEIN_OK.match(k.rsplit(' ', 1)[0])]
    if klein: probleem.append('tikvlak<44: ' + '; '.join(klein[:6]))
    if m['font']: probleem.append('invoer<16px: ' + ', '.join(map(str, m['font'][:4])))
    if dlg:
        d = m['dlg']
        if not d: probleem.append('dialoog niet gevonden')
        elif d['top'] < -1 or d['bottom'] > m['vh'] + 1: probleem.append(f"dialoog buiten beeld top={d['top']:.0f} bottom={d['bottom']:.0f} vh={m['vh']:.0f}")
        if titel is not None:
            await page.locator(dlg).evaluate('d => d.scrollTop = 0')
            if not await titel.is_visible() or (await titel.bounding_box())['y'] < -1: probleem.append('titel niet bereikbaar')
        if laatste is not None:
            await laatste.scroll_into_view_if_needed()
            bb = await laatste.bounding_box(); vh = m['vh']
            if not bb or bb['y'] + bb['height'] > vh + 1 or bb['y'] < -1: probleem.append(f'laatste actie onbereikbaar {bb}')
    shot = OUT / f"{maat}-{re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')}.png"
    await page.screenshot(path=str(shot)); m['shot'] = str(shot.relative_to(OUT.parent)); m['probleem'] = probleem
    metingen.append(m)
    if probleem: fouten.append(f'{maat} {label}: ' + ' | '.join(probleem))
    print(('FOUT ' if probleem else 'ok   ') + f'{maat} {label}' + (': ' + ' | '.join(probleem) if probleem else ''))

async def hoogte(p, maat, factor=1.0):
    w, h = MATEN[maat]; h = int(h * factor)
    await p.set_viewport_size({'width': w, 'height': h})
    await p.wait_for_function('h => getComputedStyle(document.documentElement).getPropertyValue("--vvh") === h + "px"', arg=h)

async def stap(naam, maat, coro):
    try: await coro
    except Exception as e:
        fouten.append(f'{maat} {naam}: stap mislukt — {str(e).splitlines()[0][:200]}'); print('FOUT', maat, naam, str(e).splitlines()[0][:200])

async def ga(page, pad, wacht):
    await page.goto(B + pad, wait_until='domcontentloaded'); await expect(wacht(page)).to_be_visible(timeout=25000)

nav = lambda p: p.get_by_role('navigation', name='Stationnavigatie')
DLG = '[role=dialog]:not([aria-hidden=true]), [role=alertdialog]'

# ---------- FIXTURES (alleen in deze testbrowser) ----------
def station_status(stid, **velden):
    def f(data, qs):
        return walk(data, lambda d: ({**d, **velden} if d.get('id') == stid else None))
    return f
def fotos_patch(fn):
    return lambda data, qs: fn(data) if isinstance(data, list) else data
def afkeur_eerste(data):
    for i, x in enumerate(data[:2]):
        if isinstance(x, dict) and 'review_status' in x: x['review_status'] = 'rejected'; x['afkeur_reden'] = 'Fictief: onscherp'
    return data
def helft(data): return data[: max(1, len(data) // 3)]
def multi(data, qs):
    if isinstance(data, list) and data:
        extra = {**data[0], 'id': '90000000-0000-4000-8000-000000000001', 'behuizingsnummer': 'FICT-2', 'naam_msr': (data[0].get('naam_msr') or '') + ' B'}
        return data + [extra]
    return data
def sleutel(dagen):
    def f(data, qs):
        import datetime
        d = (datetime.date.today() + datetime.timedelta(days=dagen)).isoformat()
        return walk(data, lambda x: ({**x, 'sp_sleutel_verloopt_op': d, 'sp_auth_fout': None} if 'sp_sleutel_verloopt_op' in x or 'bedrijfsnaam' in x else None))
    return f
def hold(data, qs):
    return walk(data, lambda d: ({**d, 'on_hold': True, 'on_hold_sinds': '2026-11-01', 'on_hold_tot': '2026-11-10', 'on_hold_reden': 'Fictieve wachtreden met een behoorlijk lange omschrijving', 'on_hold_partij': 'liander'} if d.get('id') == RONDE else None))
def ronde_afgekeurd(data, qs):
    return walk(data, lambda d: ({**d, 'status': 'afgekeurd'} if 'nummer' in d and 'redenen' in d else None))
def import_rpc(n, q):
    body = q.post_data_json or {}
    if n == 2: return (503, {'message': 'fictieve verbindingsfout'})
    return (200, {'uitkomst': 'aangemaakt', 'id': f'90000000-0000-4000-8000-{n:012d}'})

async def run_station(b):
    for maat in ['320', '390', '430', 'liggend', 'zoom130']:
        # Meer > Wijzig station (beheer gemockt) en Delen
        ctx, p = await context(b, maat, {'beheer': True})
        async def wijzig():
            await ga(p, '/stations/' + NIEUW, nav)
            await p.get_by_role('button', name='Meer acties').click(); await p.get_by_role('menuitem', name='Wijzig station').click()
            t = p.get_by_role('heading', name='Station bewerken'); await expect(t).to_be_visible()
            await meet(p, 'EditStationDialog', maat, DLG, p.get_by_role('dialog').get_by_role('button', name='Opslaan'), t)
            await p.get_by_role('dialog').locator('input').first.focus()
            await hoogte(p, maat, 0.55)
            await meet(p, 'EditStationDialog toetsenbord-sim', maat, DLG, p.get_by_role('dialog').get_by_role('button', name='Opslaan'), t)
            await hoogte(p, maat)
            await p.keyboard.press('Escape'); await expect(t).to_be_hidden()
        await stap('EditStationDialog', maat, wijzig())
        async def delen():
            await p.get_by_role('button', name='Meer acties').click(); await p.get_by_role('menuitem', name='Delen').click()
            t = p.get_by_role('heading', name='Rapport delen'); await expect(t).to_be_visible()
            await meet(p, 'Delen-sheet', maat, '[aria-labelledby=deel-titel]', p.get_by_role('button', name='Sluiten', exact=True), t)
            await p.get_by_role('button', name='Sluiten', exact=True).click(); await expect(t).to_be_hidden()
        await stap('Delen', maat, delen())
        async def pdf():
            async with p.expect_popup() as pi:
                await p.get_by_role('button', name='Meer acties').click(); await p.get_by_role('menuitem', name='PDF bekijken').click()
            pop = await pi.value; await pop.wait_for_load_state('domcontentloaded')
            await expect(pop.locator('.page').first).to_be_visible(timeout=20000)
            m = await pop.evaluate('({vw: innerWidth, sw: document.documentElement.scrollWidth, meta: document.querySelector("meta[name=viewport]").content, pw: document.querySelector(".page").getBoundingClientRect().width})')
            await pop.screenshot(path=str(OUT / f'{maat}-rapport-html.png'))
            ok = m['sw'] <= m['vw'] + 1
            metingen.append({'label': 'Rapport-HTML (PDF bekijken)', 'maat': maat, **m, 'probleem': [] if ok else ['rapport breder dan venster']})
            print(('ok   ' if ok else 'FOUT ') + f"{maat} Rapport-HTML {m}")
            if not ok: fouten.append(f'{maat} rapport-html breder dan venster {m}')
            await pop.close()
        if maat in ('320', '390', 'liggend'): await stap('PDF bekijken', maat, pdf())
        await ctx.close()
        # Stationstoestanden (fictief gepatcht)
        toest = {
          'deels': (NIEUW, {'patch': {'GET fotos': lambda d, q: (helft(json.loads(json.dumps(FOTOS_INGEVULD))) if q.get('station_id') == ['eq.' + NIEUW] else d)}}),
          'afgekeurd-herindiening': (INGEVULD, {'patch': {'GET stations': station_status(INGEVULD, status='in uitvoering', submitted_at='2026-11-10T10:00:00Z', review_reden='Fictief: foto onscherp'), 'GET fotos': fotos_patch(afkeur_eerste)}}),
          'goedgekeurd': (OPGELEVERD, {'patch': {'GET stations': station_status(OPGELEVERD, status='goedgekeurd')}}),
          'foto-leesfout': (OPGELEVERD, {'fail': {'GET fotos': 99}}),
        }
        if maat in ('320', '390'):
            for naam, (sid, fx) in toest.items():
                ctx, p = await context(b, maat, fx)
                async def t():
                    await ga(p, '/stations/' + sid, nav); await p.wait_for_function("!document.querySelector('[aria-busy=true]')")
                    if naam == 'foto-leesfout': await expect(p.get_by_text("Foto's konden niet worden geladen")).to_be_visible(timeout=15000)
                    if naam == 'deels': await expect(p.get_by_role('button', name='Verder met fotowerk')).to_be_visible(timeout=15000)
                    if naam == 'goedgekeurd': await expect(p.get_by_role('button', name="Foto's bekijken").last).to_be_visible(timeout=15000)
                    if naam == 'afgekeurd-herindiening': await expect(p.get_by_text(re.compile('Afgekeurd|onscherp')).first).to_be_visible(timeout=15000)
                    await meet(p, f'Station {naam}', maat)
                    await p.evaluate('scrollTo(0, document.body.scrollHeight)'); await meet(p, f'Station {naam} onderkant', maat)
                await stap(f'Station {naam}', maat, t()); await ctx.close()
        # Wachtrij: echte IndexedDB-items (fictieve blobs) die niet verstuurd kunnen worden (upload geblokkeerd)
        if maat in ('320', '390'):
            ctx, p = await context(b, maat, {})
            async def wachtrij():
                await ga(p, '/stations/' + NIEUW, nav)
                await p.evaluate("""async (sid) => { const q = await import('/src/lib/offline-queue.ts');
                  const b = new Blob([new Uint8Array([255,216,255,217])], {type: 'image/jpeg'});
                  await q.queuePhoto(sid, 'Typeplaatje / fabricagenummer', b); const id2 = await q.queuePhoto(sid, 'Typeplaatje / fabricagenummer', b);
                  await q.markError(id2, 'fictief'); }""", NIEUW)
                await expect(p.get_by_text(re.compile('niet verstuurd|nog te versturen')).first).to_be_visible(timeout=20000)
                await meet(p, 'Station wachtrij open+mislukt', maat)
                await ga(p, '/stations/' + NIEUW + '/opleveren', lambda x: x.get_by_role('button', name=re.compile('Oplevering versturen')))
                await expect(p.get_by_role('button', name=re.compile('Oplevering versturen'))).to_be_disabled()
                await meet(p, 'Opleveren onvolledig (wachtrij)', maat)
                await p.evaluate("async () => { const q = await import('/src/lib/offline-queue.ts'); for (const i of await q.getPendingPhotos()) { const d = await q.getDB(); await d.delete('photo-queue', i.id); } }")
            await stap('Wachtrij', maat, wachtrij()); await ctx.close()
            for naam, fx, verwacht in [('Opleveren fotoleesfout', {'fail': {'GET fotos': 99}}, 'Kon niet laden'), ('Opleveren stationleesfout', {'fail': {'GET stations': 99}}, re.compile('Station kon niet worden geladen|Deze pagina kon niet worden geladen'))]:
                ctx, p = await context(b, maat, fx)
                async def o():
                    await p.goto(B + '/stations/' + INGEVULD + '/opleveren', wait_until='domcontentloaded')
                    await expect(p.get_by_text(verwacht).first).to_be_visible(timeout=45000); await meet(p, naam, maat)
                await stap(naam, maat, o()); await ctx.close()
            ctx, p = await context(b, maat, {'vast': {'POST oplever-rapport': (200, {'ok': True})}})
            async def succes():
                await ga(p, '/stations/' + INGEVULD + '/opleveren', lambda x: x.get_by_role('button', name=re.compile('Oplevering versturen')))
                await meet(p, 'Opleveren gereed', maat)
                knop = p.get_by_role('button', name=re.compile('Oplevering versturen'))
                await expect(knop).to_be_enabled(timeout=20000)
                if True:
                    await knop.click(); await expect(p.get_by_text('Dossier ingediend')).to_be_visible(timeout=15000); await meet(p, 'Opleveren succes (gemockt)', maat)
            await stap('Opleveren succes', maat, succes()); await ctx.close()
            ctx, p = await context(b, maat, {})
            async def mislukt():
                await ga(p, '/stations/' + INGEVULD + '/opleveren', lambda x: x.get_by_role('button', name=re.compile('Oplevering versturen')))
                knop = p.get_by_role('button', name=re.compile('Oplevering versturen'))
                await expect(knop).to_be_enabled(timeout=20000)
                if True:
                    await knop.click(); await expect(p.get_by_text('Opleveren mislukt. Probeer het opnieuw.')).to_be_visible(timeout=15000); await meet(p, 'Opleveren fout (geblokkeerd)', maat)
            await stap('Opleveren fout', maat, mislukt()); await ctx.close()
        # Wizard: lange titel, NotitieSheet met toetsenbord, afrondscherm
        ctx, p = await context(b, maat, {})
        async def wizard():
            await ga(p, '/stations/' + NIEUW, nav); await p.get_by_role('button', name='Start fotowerk').click()
            h = p.locator('h1').filter(has_text='Typeplaatje'); await expect(h).to_be_visible(timeout=15000)
            await p.evaluate("""() => { const h = [...document.querySelectorAll('h1')].find(x => x.textContent.includes('Typeplaatje')); h.textContent = 'Typeplaatje / fabricagenummer (Compact Station)'; }""")
            ov = await h.evaluate('e => e.scrollWidth > e.clientWidth + 1')
            if ov: fouten.append(f'{maat} wizardtitel afgekapt')
            await meet(p, 'Wizard lange titel', maat)
            await p.get_by_role('button', name=re.compile('Notitie$')).click()
            sheet = p.get_by_role('dialog', name=re.compile('Notitie:')); await expect(sheet).to_be_visible()
            await sheet.locator('textarea').focus()
            await hoogte(p, maat, 0.55)
            await meet(p, 'NotitieSheet toetsenbord-sim', maat)
            await hoogte(p, maat)
            await p.keyboard.press('Escape')
        await stap('Wizard', maat, wizard()); await ctx.close()

async def run_beoordelen(b):
    for maat in ['320', '390', '430', 'liggend', 'zoom130']:
        fx = {'beheer': True, 'patch': {'GET fotos': fotos_patch(afkeur_eerste)}}
        ctx, p = await context(b, maat, fx)
        async def t():
            await ga(p, '/beoordelen/' + OPGELEVERD, lambda x: x.get_by_role('listbox', name="Foto's in werklijst"))
            await meet(p, 'BeoordeelDossier inspectie', maat)
            await p.get_by_role('button', name=re.compile('^Te beoordelen')).first.click()
            await p.get_by_role('button', name='Foto afkeuren').click()
            t1 = p.get_by_role('heading', name='Waarom keur je deze foto af?'); await expect(t1).to_be_visible()
            await p.get_by_role('button', name='Anders', exact=True).click()
            await p.get_by_placeholder('Beschrijf wat er mis is').fill('Fictieve toelichting')
            await meet(p, 'Sheet afkeuren (Anders)', maat, DLG, p.get_by_role('button', name='Afkeuring opslaan'), t1)
            await hoogte(p, maat, 0.55)
            await meet(p, 'Sheet afkeuren toetsenbord-sim', maat, DLG, p.get_by_role('button', name='Afkeuring opslaan'), t1)
            await hoogte(p, maat)
            await p.keyboard.press('Escape'); await expect(t1).to_be_hidden()
            await p.get_by_role('button', name=re.compile('^Open afkeuren')).first.click()
            await p.get_by_role('button', name='Afkeur afhandelen…').click()
            t2 = p.get_by_role('heading', name='Afkeur afhandelen'); await expect(t2).to_be_visible()
            await meet(p, 'Sheet afkeur afhandelen', maat, DLG, p.get_by_role('button', name='Afhandeling opslaan'), t2)
            await p.keyboard.press('Escape'); await expect(t2).to_be_hidden()
            await p.get_by_role('button', name=re.compile('Eindcontrole bekijken|Dossier afronden…')).first.click()
            t3 = p.get_by_role('heading', name='Eindcontrole dossier'); await expect(t3).to_be_visible()
            await meet(p, 'Sheet eindcontrole', maat, DLG, p.get_by_role('dialog').get_by_role('button').last, t3)
            await p.keyboard.press('Escape'); await expect(t3).to_be_hidden()
            # actiebalk vs laatste inhoud
            await p.get_by_role('button', name=re.compile('^Alle foto')).first.click()
            await p.evaluate("""async () => { const m = document.querySelector('main'); let vorige = -1;
               for (let i = 0; i < 20 && m.scrollHeight !== vorige; i++) { vorige = m.scrollHeight; m.scrollTop = m.scrollHeight; await new Promise(r => setTimeout(r, 150)); } }""")
            gap = await p.evaluate("""() => { const b = document.querySelector('[data-actiebalk]'); if (!b || getComputedStyle(b).position !== 'fixed') return null;
               const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; window.scrollTo(0, document.body.scrollHeight);
               const els = [...m.querySelectorAll('img,button,[role=option],p,span,h1,h2,h3')].filter(e => e.getBoundingClientRect().height > 0 && !b.contains(e) && (e.tagName === 'IMG' || e.tagName === 'BUTTON' || e.textContent.trim()));
               const laatste = Math.max(...els.map(e => e.getBoundingClientRect().bottom)); return {laatste, balkTop: b.getBoundingClientRect().top}; }""")
            if gap and gap['laatste'] > gap['balkTop'] + 1: fouten.append(f'{maat} BeoordeelDossier: inhoud onder actiebalk {gap}')
            print('     actiebalk', maat, gap)
            await meet(p, 'BeoordeelDossier onderkant', maat)
            await p.get_by_role('button', name='Raster').click(); await meet(p, 'BeoordeelDossier raster', maat)
        await stap('Beoordelen', maat, t()); await ctx.close()
    for maat in ['320', '390']:
        ctx, p = await context(b, maat, {'fail': {'GET opdrachtgevers': 4}})
        async def og():
            await p.goto(B + '/beoordelen', wait_until='domcontentloaded')
            await expect(p.get_by_text('Opdrachtgevers konden niet worden geladen.')).to_be_visible(timeout=20000)
            await meet(p, 'Beoordelen opdrachtgevers leesfout', maat)
            await p.get_by_role('button', name='Opnieuw laden').click(); await expect(p.get_by_text('Opdrachtgevers konden niet worden geladen.')).to_be_hidden()
            await meet(p, 'Beoordelen opdrachtgevers na herladen', maat)
        await stap('Beoordelen opdrachtgevers', maat, og()); await ctx.close()

async def run_cases(b):
    for maat in ['320', '390', '430', 'liggend', 'zoom130']:
        ctx, p = await context(b, maat, {'beheer': True, 'vast': {'POST case_aanmaken': import_rpc}})
        async def imp():
            await ga(p, '/cases', lambda x: x.get_by_role('button', name='Meer acties'))
            await p.get_by_role('button', name='Meer acties').click(); await p.get_by_role('menuitem', name='Case toevoegen').click()
            t = p.get_by_role('heading', name='Case toevoegen'); await expect(t).to_be_visible()
            await meet(p, 'Case toevoegen', maat, DLG, p.get_by_role('dialog').get_by_role('button', name='Case toevoegen'), t)
            await p.keyboard.press('Escape'); await expect(t).to_be_hidden()
            await p.get_by_role('button', name='Meer acties').click(); await p.get_by_role('menuitem', name='Importeren uit Excel').click()
            ta = p.get_by_role('textbox', name='Geplakte Excel-rijen'); await expect(ta).to_be_visible(timeout=15000)
            rijen = '\n'.join(f'FICT-{1000+i}\tFictieve case {i}\tTest' for i in range(120))
            await ta.fill(f'Casenummer\tCasenaam\t{LANG_ONBEKEND}\n' + rijen)
            sel = p.get_by_role('combobox', name=f'Kolom {LANG_ONBEKEND} koppelen'); await expect(sel).to_be_visible()
            await meet(p, 'Excel mapping lange onbekende kop', maat, DLG, p.get_by_role('button', name=re.compile('importeren$', re.I)).last)
            await p.get_by_role('button', name='Volgende previewpagina').click(); await meet(p, 'Excel preview pagina 2', maat, DLG)
            if maat in ('320', '390'):
                await p.get_by_role('button', name=re.compile('importeren$', re.I)).last.click()
                await expect(p.get_by_text(re.compile('gepauzeerd|Probeer alleen de resterende'))).to_be_visible(timeout=30000)
                await meet(p, 'Excel import gepauzeerd (gemockt)', maat, DLG, p.get_by_role('button', name=re.compile('Opnieuw proberen|Hervat|importeren$', re.I)).last)
            await p.keyboard.press('Escape')
        await stap('Case toevoegen/Excel', maat, imp()); await ctx.close()
        if maat in ('320', '390', '430'):
            ctx, p = await context(b, maat, {'beheer': True, 'patch': {'GET stations': lambda d, q: ronde_afgekeurd(hold(d, q), q), 'GET case_overzicht': lambda d, q: ronde_afgekeurd(hold(d, q), q)}})
            async def cd():
                await ga(p, '/cases/' + RONDE, lambda x: x.get_by_role('button', name='Hervatten'))
                await meet(p, 'CaseDetail on hold + afgekeurde ronde', maat)
                await p.evaluate('scrollTo(0, document.body.scrollHeight)'); await meet(p, 'CaseDetail onderkant', maat)
            await stap('CaseDetail hold', maat, cd()); await ctx.close()
            ctx, p = await context(b, maat, {'beheer': True})
            async def oh():
                await ga(p, '/cases/' + RONDE, lambda x: x.get_by_role('button', name='On hold zetten'))
                await p.get_by_role('button', name='On hold zetten').click()
                t = p.get_by_role('heading', name='On hold zetten'); await expect(t).to_be_visible()
                await meet(p, 'OnHold-dialoog', maat, DLG, p.get_by_role('dialog').get_by_role('button', name='On hold zetten'), t)
                await p.keyboard.press('Escape')
                wv = p.get_by_role('button', name='Andere naam invoeren')
                if await wv.count():
                    await wv.first.click(); await meet(p, 'WV vrije invoer', maat)
            await stap('OnHold', maat, oh()); await ctx.close()
    for maat in ['320', '390']:
        ctx, p = await context(b, maat, {'fail': {'GET case_overzicht': 99}})
        async def fout():
            await p.goto(B + '/cases', wait_until='domcontentloaded')
            await expect(p.get_by_text('Cases konden niet worden geladen.')).to_be_visible(timeout=25000)
            if await p.get_by_text('Geen cases').count(): fouten.append(f'{maat} Cases leesfout toont "Geen cases"')
            await meet(p, 'Cases leesfout', maat)
        await stap('Cases leesfout', maat, fout()); await ctx.close()

async def run_overig(b):
    for maat in ['320', '390', '430', 'liggend', 'zoom130']:
        ctx, p = await context(b, maat, {'vast': {'POST pin-sessie': (401, {'error': 'onjuist'})}})
        async def pin():
            await ga(p, '/', lambda x: x.get_by_role('button', name='Instellingen'))
            await p.get_by_role('button', name='Instellingen').click()
            t = p.get_by_role('heading', name=re.compile('toegangscode|Beheer', re.I)); await expect(t).to_be_visible()
            await p.get_by_placeholder('Toegangscode').fill('0000'); await p.keyboard.press('Enter')
            await expect(p.locator('[aria-labelledby=pin-titel] [role=alert]')).to_be_visible(timeout=10000)
            await hoogte(p, maat, 0.55)
            await meet(p, 'PIN-fout toetsenbord-sim', maat, '[aria-labelledby=pin-titel]', p.locator('[aria-labelledby=pin-titel]').get_by_role('button', name='Ontgrendelen'), t)
            await hoogte(p, maat)
            await p.keyboard.press('Escape'); await expect(t).to_be_hidden()
        await stap('PIN', maat, pin()); await ctx.close()
        ctx, p = await context(b, maat, {'beheer': True})
        async def inst():
            await ga(p, '/instellingen', lambda x: x.get_by_role('heading', name='Instellingen').first)
            await meet(p, 'Instellingen ontgrendeld', maat)
            veld = p.locator('main input:not([type=file])').last; await veld.focus()
            await hoogte(p, maat, 0.55); await veld.scroll_into_view_if_needed()
            await meet(p, 'Instellingen onderkant toetsenbord-sim', maat)
            await hoogte(p, maat)
            await ga(p, '/instellingen/categorieen', lambda x: x.get_by_role('heading', name='Categorieën beheren'))
            await p.locator('main button').filter(has_text='edit').first.click()
            await expect(p.get_by_role('button', name='Opslaan')).to_be_visible()
            await meet(p, 'Categorie-editor', maat)
            await p.get_by_role('button', name='Annuleren').click()
            dl = p.get_by_role('button', name=re.compile('^Voorbeeld .* verwijderen$'))
            if await dl.count():
                await dl.first.click(); t = p.get_by_role('heading', name='Voorbeeld verwijderen?'); await expect(t).to_be_visible()
                await meet(p, 'Voorbeeld verwijderen bevestiging', maat, '[role=alertdialog]', p.get_by_role('button', name='Verwijderen'), t)
                await p.get_by_role('button', name='Annuleren').click(); await expect(t).to_be_hidden()
            else: fouten.append(f'{maat} geen voorbeeldfoto om verwijderknop te meten')
        await stap('Instellingen/categorieën', maat, inst()); await ctx.close()
        if maat in ('320', '390', '430'):
            for naam, dagen in [('bijna verlopen', 5), ('verlopen', -2)]:
                ctx, p = await context(b, maat, {'beheer': True, 'patch': {'GET instellingen': sleutel(dagen)}})
                async def banner():
                    await ga(p, '/instellingen', lambda x: x.get_by_role('alert').filter(has_text='SharePoint'))
                    bn = p.get_by_role('alert').filter(has_text='SharePoint'); bb = await bn.bounding_box()
                    hd = await p.locator('header').first.bounding_box()
                    if hd and hd['y'] < bb['y'] + bb['height'] - 1: fouten.append(f'{maat} sleutelbanner bedekt header {bb} {hd}')
                    kleur = await bn.evaluate("e => getComputedStyle(e).backgroundColor")
                    await meet(p, f'Sleutelbanner {naam} ({kleur})', maat)
                    await ga(p, '/', lambda x: x.get_by_role('button', name='Instellingen')); await meet(p, f'Sleutelbanner {naam} start', maat)
                await stap(f'Sleutelbanner {naam}', maat, banner()); await ctx.close()
        if maat in ('320', '390'):
            for naam, fx, pad, tekst in [
                ('Stations leesfout', {'fail': {'GET stations': 99, 'POST url_candidates': 99}}, '/', None),
                ('Categoriebeheer leesfout', {'beheer': True, 'fail': {'GET categorie_voorbeelden': 99}}, '/instellingen/categorieen', "Voorbeeldfoto's konden niet worden geladen."),
                ('SharePoint-run leesfout', {'beheer': True, 'fail': {'GET sharepoint_sync_runs': 99}}, '/instellingen', 'Laatste run kon niet worden gelezen.'),
                ('Multi-station keuzelijst', {'patch': {'POST url_candidates': multi}}, '/stations/' + OPGELEVERD, None),
                ('404', {}, '/bestaat/niet/x/y/z', 'Deze pagina bestaat niet (meer).'),
                ('Oude alias stations/uuid', {}, '/stations/' + INGEVULD, None),
                ('Categorie-deeplink', {}, '/stations/' + NIEUW, None),
            ]:
                ctx, p = await context(b, maat, fx)
                async def t():
                    await p.goto(B + pad, wait_until='domcontentloaded')
                    if tekst: await expect(p.get_by_text(tekst).first).to_be_visible(timeout=25000)
                    elif naam == 'Stations leesfout': await expect(p.get_by_role('alert').or_(p.get_by_text(re.compile('niet worden geladen|Opnieuw', re.I))).first).to_be_visible(timeout=25000)
                    elif naam.startswith('Multi'):
                        lijst = p.get_by_text('FICT-2')
                        await expect(nav(p).or_(lijst).first).to_be_visible(timeout=25000)
                        if not await lijst.count(): await p.goto(p.url, wait_until='domcontentloaded')
                        await expect(lijst).to_be_visible(timeout=25000)
                    elif naam == 'Categorie-deeplink':
                        await expect(nav(p)).to_be_visible(timeout=25000); canon = urlparse(p.url).path
                        await p.goto(B + canon + '/algemeen/1-typeplaatje-fabricagenummer', wait_until='domcontentloaded')
                        await expect(p.locator('h1').filter(has_text='Typeplaatje')).to_be_visible(timeout=20000)
                        await p.get_by_role('button', name='Sluiten').first.click(); await expect(nav(p)).to_be_visible()
                    else:
                        await expect(nav(p)).to_be_visible(timeout=25000)
                        if INGEVULD in p.url: fouten.append(f'{maat} alias niet naar canonieke url')
                    if naam == '404':
                        await p.get_by_role('link', name='Terug naar stations').click(); await expect(p).to_have_url(B + '/')
                        await p.goto(B + pad); await expect(p.get_by_text(tekst)).to_be_visible()
                    await meet(p, naam, maat)
                await stap(naam, maat, t()); await ctx.close()

FOTOS_INGEVULD = []
async def main():
    global FOTOS_INGEVULD
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        if GROEP == 'station':
            c = await b.new_context(); pg = await c.new_page()
            await pg.goto(B + '/'); FOTOS_INGEVULD = await pg.evaluate("""async (id) => { const { supabase } = await import('/src/integrations/supabase/client.ts');
                const { data } = await supabase.from('fotos').select('*').eq('station_id', id); return (data || []).map(f => ({...f, station_id: '%s'})); }""" % NIEUW, INGEVULD)
            await c.close()
        await {'station': run_station, 'beoordelen': run_beoordelen, 'cases': run_cases, 'overig': run_overig}[GROEP](b)
        await b.close()
    ok = sum(1 for m in metingen if not m.get('probleem'))
    (OUT / 'resultaat.json').write_text(json.dumps({'groep': GROEP, 'metingen': len(metingen), 'ok': ok, 'fouten': fouten, 'geblokkeerd': sorted(geblokkeerd),
        'details': [{k: m.get(k) for k in ('label', 'maat', 'url', 'probleem', 'shot', 'dlg')} for m in metingen]}, indent=1))
    print(f'\n{GROEP}: {len(metingen)} metingen, {ok} ok, {len(fouten)} fouten; geblokkeerde schrijfverzoeken: {sorted(geblokkeerd)}')
    sys.exit(1 if fouten else 0)
asyncio.run(main())
