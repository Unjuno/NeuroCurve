"""Optional browser CPU smoke; no server, no mocked model or benchmark metrics."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError

root=Path(__file__).resolve().parents[1]
html=(root/'dist/NeuroCurve-local.html').read_text('utf-8')
shots=root/'evidence'/'ux'; shots.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':900})
 errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.set_content(html,wait_until='load')
 page.locator('[data-mode="sketch"]').click()
 canvas=page.locator('#curve-canvas')
 canvas.scroll_into_view_if_needed()
 bb=canvas.bounding_box()
 points=[(.13,.65),(.22,.40),(.215,.41),(.33,.7),(.42,.60),(.57,.24),(.65,.38),(.82,.48)]
 page.mouse.move(bb['x']+bb['width']*points[0][0],bb['y']+bb['height']*points[0][1]);page.mouse.down()
 for x,y in points[1:]:page.mouse.move(bb['x']+bb['width']*x,bb['y']+bb['height']*y,steps=8)
 page.mouse.up()
 page.wait_for_timeout(250)
 note=page.locator('#fit-note').inner_text()
 assert '元の谷' in note,note
 print('DRAW:',note)
 assert 'PCHIP' in page.locator('#function-caption').inner_text()
 page.locator('[data-tab="learning"]').click()
 page.select_option('#compute-backend','cpu')
 page.select_option('#evaluation-scope','core')
 page.select_option('#benchmark-mode','quick')
 page.click('#start-training')
 try:page.wait_for_function("document.querySelector('#training-status').textContent.includes('全課題') || document.querySelector('#training-status').textContent.includes('停止') || document.querySelector('#training-status').textContent.includes('エラー')",timeout=220000)
 except TimeoutError:raise AssertionError('CPU browser suite timed out')
 status=page.locator('#training-status').inner_text()
 score=page.locator('#suite-score').inner_text()
 cards=page.locator('.task-score-card').count()
 print('TRAIN:',status,'SCORE:',score,'TASK CARDS:',cards)
 assert status=='全課題の評価が完了',(status,score)
 assert score!='—',(status,score)
 assert cards==6,cards
 assert not errors,errors
 page.screenshot(path=str(shots/'04-real-cpu-six-task.png'),full_page=True)
 browser.close()
 print('PASS: real CPU learning from new hand drawing, no fabricated results')
