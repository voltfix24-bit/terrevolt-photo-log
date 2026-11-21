"""Gerichte check: gegenereerde HTML-rapportpreview (golden fixture, fictieve data) op 320/390. Exit 1 bij falen."""
import json,sys
from playwright.sync_api import sync_playwright
html=open('src/test/fixtures/pdf-html.golden.html').read()
res=[]
with sync_playwright() as p:
  b=p.chromium.launch()
  for w,h in [(320,568),(390,844)]:
    c=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,device_scale_factor=2)
    pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*',lambda r:r.abort() if r.request.method!='GET' else r.continue_())
    pg.set_content(html); pg.wait_for_function("document.querySelector('.rapport').style.zoom!==''")
    m=pg.evaluate("""()=>{const b=document.querySelector('.print-btn').getBoundingClientRect();const s=visualViewport.scale;const pgR=document.querySelector('.page').getBoundingClientRect();
    return {scale:s,innerW:innerWidth,scrollW:document.documentElement.scrollWidth,btnH:b.height*s,btnTop:b.top,btnRight:b.right,fs:parseFloat(getComputedStyle(document.querySelector('.print-btn')).fontSize)*s,pageL:pgR.left,pageR:pgR.right}}""")
    m['ok']=m['scale']==1 and m['scrollW']<=w and m['btnH']>=44 and m['fs']>=16 and m['btnRight']<=w and m['pageL']>=0 and m['pageR']<=w and not errs
    m['viewport']=f'{w}x{h}'; m['check']='rapportpreview'; res.append(m)
    pg.emulate_media(media='print'); m2=pg.evaluate("getComputedStyle(document.querySelector('.rapport')).zoom"); res.append({'check':'print-zoom','viewport':f'{w}x{h}','zoom':m2,'ok':m2=='1'})
  b.close()
print(json.dumps(res,indent=1)); sys.exit(0 if all(r['ok'] for r in res) else 1)
