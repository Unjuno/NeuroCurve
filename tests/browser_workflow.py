"""Optional browser CPU workflow smoke; requires Playwright + Chromium, no server."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/NeuroCurve-local.html').read_text()
shots=root/'evidence'/'workflow'
shots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1300,'height':900})
 errors=[]
 page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content(html,wait_until='load')
 assert '未評価' in page.locator('#workflow-evaluation').inner_text()
 assert '未接続' in page.locator('#workflow-sharing').inner_text()
 page.locator('[data-mode="sketch"]').click()
 canvas=page.locator('#curve-canvas')
 canvas.scroll_into_view_if_needed()
 bb=canvas.bounding_box()
 points=[(.15,.68),(.23,.53),(.38,.34),(.52,.50),(.63,.25),(.78,.40),(.86,.47)]
 page.mouse.move(bb['x']+bb['width']*points[0][0],bb['y']+bb['height']*points[0][1])
 page.mouse.down()
 for x,y in points[1:]:page.mouse.move(bb['x']+bb['width']*x,bb['y']+bb['height']*y,steps=8)
 page.mouse.up()
 page.wait_for_timeout(250)
 assert 'PCHIP' in page.locator('#function-caption').inner_text()
 page.locator('[data-tab="learning"]').click()
 page.select_option('#evaluation-scope','single')
 page.select_option('#compute-backend','cpu')
 page.select_option('#dataset','moons')
 page.select_option('#benchmark-mode','quick')
 page.click('#start-training')
 page.wait_for_function("document.querySelector('#training-status').textContent.includes('評価終了') || document.querySelector('#training-status').textContent.includes('停止') || document.querySelector('#training-status').textContent.includes('エラー')",timeout=120000)
 assert page.locator('#workflow-evaluation').inner_text()=='評価完了'
 page.locator('#benchmark-mode').select_option('full')
 assert '再評価' in page.locator('#workflow-evaluation').inner_text()
 page.screenshot(path=str(shots/'01-state-desktop.png'),full_page=True)
 mobile=browser.new_page(viewport={'width':390,'height':844})
 mobile_errors=[]
 mobile.on('pageerror',lambda err:mobile_errors.append(str(err)))
 mobile.set_content(html,wait_until='load')
 assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
 mobile.screenshot(path=str(shots/'02-state-mobile.png'),full_page=True)
 assert not errors,errors
 assert not mobile_errors,mobile_errors
 print('PASS: draw → CPU quick learning → score invalidation → mobile 390px')
 browser.close()
