"""End-to-end checks against a running local server. No synthetic scores or mocked ML."""
import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.getenv('TEST_URL','http://127.0.0.1:4173')
def run():
    checks=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        posts=[];page.on('request',lambda r:posts.append(r.url) if r.method=='POST' else None)
        page.goto(BASE);page.get_by_role('heading',name='描く。調べる。学習で確かめる。').wait_for()
        checks.append('studio loads')
        assert page.locator('#curve-canvas').is_visible()
        assert page.locator('#stat-minima').inner_text()!='—'
        page.locator('[data-mode="expression"]').click();page.locator('#expression-input').fill('x*sigmoid(x)');page.locator('#apply-expression').click()
        assert 'エラー' not in page.locator('#expression-error').inner_text()
        checks.append('formula input and analytic diagnosis')
        page.locator('#expression-input').fill('alert(1)');page.locator('#apply-expression').click();assert page.locator('#expression-error').inner_text()
        checks.append('untrusted formula rejected')
        page.locator('#expression-input').fill('swish(x)');page.locator('#apply-expression').click()
        page.locator('[data-mode="valleys"]').click();old=page.locator('#stat-slope').inner_text()
        page.locator('input[type="number"][data-param="depth"]').fill('0.15');page.locator('input[type="number"][data-param="depth"]').dispatch_event('input')
        page.wait_for_timeout(100);assert page.locator('#stat-slope').inner_text()!=old
        checks.append('parameter updates function')
        page.locator('#compare-save').click();assert page.locator('#comparison-note').is_visible()
        assert not posts;assert page.evaluate('localStorage.length')==0
        checks.append('no persistence and no opt-out upload')
        page.screenshot(path=str(ROOT/'evidence/studio-desktop.png'),full_page=True)
        page.locator('[data-tab="learning"]').click();page.locator('#start-training').click()
        page.wait_for_function("document.querySelector('#training-status').textContent.includes('評価終了')",timeout=120000)
        assert page.locator('#results-body tr').count()>=4
        assert '未実行' not in page.locator('#results-body').inner_text()
        checks.append('real browser Worker training: custom + 3 baselines')
        page.screenshot(path=str(ROOT/'evidence/learning-desktop.png'),full_page=True)
        page.locator('#start-training').click();page.locator('#stop-training').click();page.wait_for_timeout(100)
        assert '中断' in page.locator('#training-status').inner_text()
        checks.append('worker cancellation')
        page.locator('#share-button').click();assert not page.locator('#publish-share').is_enabled()
        page.locator('#share-consent').check();page.locator('#key-saved').check();page.locator('#publish-share').click()
        page.locator('#share-success').wait_for(state='visible');share_url=page.locator('#share-url').input_value();key=page.locator('#delete-secret').input_value()
        assert len(key)==64;assert key not in share_url;checks.append('explicit consent, publication, separate delete capability')
        page.locator('#share-dialog').evaluate('(d)=>d.close()')
        second=browser.new_page();second.goto(share_url);second.locator('#shared-banner').wait_for(state='visible');checks.append('shared definition reload')
        page.locator('#manage-button').click();page.locator('#delete-share-id').fill(share_url);page.locator('#delete-key').fill(key);page.locator('#delete-confirm').check();page.locator('#delete-post').click()
        page.wait_for_function("document.querySelector('#delete-status').textContent.includes('削除しました')")
        r=page.request.get(share_url);assert r.status==404;checks.append('delete revokes share')
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
        m=mobile.new_page();m.goto(BASE);m.get_by_role('heading',name='描く。調べる。学習で確かめる。').wait_for();assert m.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        m.screenshot(path=str(ROOT/'evidence/studio-mobile.png'),full_page=True);checks.append('mobile layout without horizontal overflow')
        assert not errors,errors;checks.append('no browser exceptions')
        browser.close()
    (ROOT/'evidence/browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},ensure_ascii=False,indent=2))
    print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False))
if __name__=='__main__':run()
