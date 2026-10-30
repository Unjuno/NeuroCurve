"""Optional acceptance test: pip install playwright; provide CHROMIUM_PATH as needed.
Uses an inert mock Worker solely for UI-state tests. This is NOT an ML backend test.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/NeuroCurve-local.html').read_text(encoding='utf8')
shots=root/'evidence'/'ux'
shots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1,accept_downloads=True)
 errors=[]
 page.on('pageerror',lambda exc: errors.append(str(exc)))
 page.set_content(html,wait_until='load')
 page.locator('[data-tab="learning"]').click()
 page.select_option('#compute-backend','cpu')
 mock_worker="""() => {
 window.Worker=class MockUIWorker {
  constructor(){this.onmessage=null;}
  terminate(){}
  postMessage(config){
   const tasks=globalThis.NC_BUNDLE['core/suite.js'].SUITES.core.tasks;
   const reports=tasks.map(dataset=>({dataset,mode:'quick',datasetVersion:'test-fixture',settings:{seeds:[17]},runs:['Custom','ReLU','Swish','GELU'].map(name=>({name,seed:17,backend:'native-js-cpu',dtype:'float64',test:{metric:['wave','chirp'].includes(dataset)?(name==='Custom'?.18:.2):(name==='Custom'?.84:.80)}}))}));
   const score=globalThis.NC_BUNDLE['core/suite.js'].scoreSuite(reports,'core');
   const result={version:2,kind:'suite',suiteId:'core-v1',createdAt:new Date().toISOString(),definition:globalThis.NC_BUNDLE['core/activation.js'].defaultDefinition(),mode:'quick',reports,score,backendSelection:{effective:'native-js-cpu'}};
   this.onmessage({data:{type:'complete',result}});
  }
 };
 }"""
 page.evaluate(mock_worker)
 page.click('#start-training')
 score=page.locator('#suite-score').inner_text()
 assert score not in ['','—'],score
 assert not page.locator('#share-score-pack').is_disabled()
 print('MOCK UI score:',score)
 page.screenshot(path=str(shots/'01-dashboard-desktop.png'),full_page=True)
 page.select_option('#evaluation-scope','extended')
 assert page.locator('#suite-score').inner_text()=='—', 'Old score displayed for new suite!'
 assert '再評価' in page.locator('#suite-status').inner_text()
 assert page.locator('#share-score-pack').is_disabled()
 print('PASS: scope change hides old score')
 page.select_option('#evaluation-scope','core')
 assert page.locator('#suite-score').inner_text()==score
 print('PASS: previous score returns when the identical configuration is restored')
 page.select_option('#benchmark-mode','full')
 assert page.locator('#suite-score').inner_text()=='—'
 print('PASS: budget change hides old score')
 page.select_option('#benchmark-mode','quick')
 assert page.locator('#suite-score').inner_text()==score
 page.evaluate("""() => {
  navigator.canShare=()=>true;
  navigator.share=async ({files})=>{window.__shared=await files[0].text();};
 }""")
 page.click('#share-score-pack')
 page.wait_for_timeout(250)
 if page.evaluate('window.__shared ?? null') is None:
  print('Share debug:', page.locator('#toast').inner_text(), page.evaluate('({canShare:typeof navigator.canShare,share:typeof navigator.share})'))
 pack=page.evaluate('JSON.parse(window.__shared)')
 assert pack['format']=='neurocurve-share-pack-v1'
 assert pack['definition']['kind']=='valleys'
 assert pack['benchmark']['score']['complete'] is True
 assert 'secret' not in str(pack).lower() or '秘密キー・生データは含みません' in str(pack)
 print('PASS: user-triggered portable pack includes a function and measurements')
 page.get_by_role('button',name='Studio').click()
 page.locator('[data-mode="sketch"]').click()
 # A slightly backward stroke, physically drawn. Convert to a function.
 canvas=page.locator('#curve-canvas')
 bb=canvas.bounding_box();assert bb is not None
 coords=[(.13,.69),(.25,.41),(.24,.35),(.42,.77),(.65,.26),(.84,.53)]
 x0=bb['x']+bb['width']*coords[0][0];y0=bb['y']+bb['height']*coords[0][1]
 page.mouse.move(x0,y0);page.mouse.down()
 for x,y in coords[1:]:
  page.mouse.move(bb['x']+bb['width']*x,bb['y']+bb['height']*y,steps=6)
 page.mouse.up()
 page.wait_for_timeout(120)
 assert 'PCHIP' in page.locator('#function-caption').inner_text()
 assert page.locator('#math-status').inner_text().strip()
 page.locator('[data-tab="learning"]').click()
 assert page.locator('#suite-score').inner_text()=='—','Old score remained valid after new sketch'
 print('PASS: freehand redraw invalidates old score')
 page.screenshot(path=str(shots/'02-stale-dashboard.png'),full_page=True)
 mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 mobile.set_content(html,wait_until='load')
 mobile.locator('[data-tab="learning"]').click()
 mobile.select_option('#compute-backend','cpu')
 mobile.evaluate(mock_worker)
 mobile.click('#start-training')
 assert mobile.locator('#suite-task-cards').is_visible()
 assert mobile.locator('.task-score-card').count()==6
 assert mobile.evaluate('document.documentElement.scrollWidth<=window.innerWidth+2')
 mobile.screenshot(path=str(shots/'03-mobile-summary.png'),full_page=True)
 print('PASS: mobile cards shown and no horizontal page overflow')
 assert not errors,errors
 browser.close()
 print('PASS: no page errors; browser screenshots saved')
