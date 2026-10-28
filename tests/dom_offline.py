"""Offline DOM checks. Does NOT navigate around the managed browser's URL policy.
The actual source is inlined into about:blank; network and Worker integration are
NOT covered here. The real HTTP contract is separately tested with node:test.
"""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def bundle():
    output=['window.NC_TEST_MODULES={};']
    names=['core/expression.js','core/activation.js','core/data.js','core/training.js','core/export.js']
    for name in names:
        text=(ROOT/'public'/name).read_text()
        exported=re.findall(r'export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)',text)
        def dep(m):
            path=(Path(name).parent/m.group(2)).as_posix()
            path='/'.join(p for p in path.split('/') if p!='.')
            return 'const {'+m.group(1)+'}=window.NC_TEST_MODULES['+json.dumps(path)+'];'
        text=re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",dep,text)
        text=re.sub(r'\bexport\s+','',text)
        output.append('window.NC_TEST_MODULES['+json.dumps(name)+']=(()=>{\n'+text+'\nreturn {'+','.join(exported)+'};})();')
    text=(ROOT/'public/app.js').read_text()
    text=re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]\./([^'\"]+)['\"];?",lambda m:'const {'+m.group(1)+'}=window.NC_TEST_MODULES['+json.dumps(m.group(2))+'];',text)
    # This harness never asks Chromium to fetch an administratively blocked URL.
    text=text.rsplit('initialize();',1)[0]+'''\nwindow.NC_TEST_STATE=state;
window.NC_TEST_SHOW_RESULT=result=>{state.result=result;state.runs=result.runs;state.runConfig={dataset:result.dataset,mode:result.mode};state.loss=Object.fromEntries(result.runs.filter(r=>!r.failed).map(r=>[r.name+':'+r.seed,r.history]));tab('learning');renderResults();drawLoss();$('training-status').textContent='画面検査 / このブラウザで実測';$('training-detail').textContent='計算エンジンを直接実行。Worker接続は未検証。';};''' 
    output.append('(()=>{'+text+'})();')
    return '\n'.join(output)

def run():
    html=(ROOT/'public/index.html').read_text()
    html=re.sub(r'<script[^>]*src=[^>]*>\s*</script>','',html)
    html=re.sub(r'<link[^>]+>','',html)
    css=(ROOT/'public/style.css').read_text()
    html=html.replace('</head>','<style>'+css+'</style></head>')
    checks=[];errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html);page.add_script_tag(content=bundle())
        page.get_by_role('heading',name='描く。調べる。学習で確かめる。').wait_for()
        assert page.locator('#stat-minima').inner_text()!='—';checks.append('studio renders actual mathematical diagnostics')
        page.locator('[data-mode="expression"]').click();page.locator('#expression-input').fill('x*sigmoid(x)');page.locator('#apply-expression').click();page.wait_for_timeout(100)
        assert page.locator('#stat-minima').inner_text()=='1';checks.append('Swish expression has one detected valley')
        page.locator('#expression-input').fill('alert(1)');page.locator('#apply-expression').click();assert page.locator('#expression-error').inner_text();checks.append('untrusted formula rejected')
        page.locator('[data-mode="valleys"]').click();old=page.locator('#stat-slope').inner_text()
        page.locator('input[type="number"][data-param="depth"]').fill('0.15');page.wait_for_timeout(100)
        assert page.locator('#stat-slope').inner_text()!=old;checks.append('parameter changes recalculate graph')
        page.locator('#compare-save').click();assert page.locator('#comparison-note').is_visible();checks.append('comparison captured in tab memory')
        page.locator('[data-mode="sketch"]').click();page.locator('#points-input').fill('-3, 0\n-2, -0.3\n-1, 0\n0, 0.5\n1, 0.2\n2, 2\n3, 1.2\n4, 3')
        page.locator('#apply-points').click();page.wait_for_timeout(100);assert page.locator('#stat-minima').inner_text()=='3';checks.append('editable control points and three true minima')
        page.locator('[data-mode="valleys"]').click();page.wait_for_timeout(100)
        page.screenshot(path=str(ROOT/'evidence/studio-desktop.png'),full_page=True)
        page.locator('[data-tab="analysis"]').click();page.screenshot(path=str(ROOT/'evidence/analysis-desktop.png'),full_page=True);checks.append('analysis view')
        # Actual training with the unmodified engine, on this browser main thread.
        # This proves browser JS compatibility, NOT the Worker integration.
        result=page.evaluate('''async()=>{const d=window.NC_TEST_MODULES['core/activation.js'].defaultDefinition();return await window.NC_TEST_MODULES['core/training.js'].runBenchmark(d,'moons','quick')}''')
        assert len(result['runs'])==4 and all(not r['failed'] for r in result['runs']);checks.append('real browser JS learning: four activations (main-thread harness, not Worker)')
        (ROOT/'evidence/browser-learning.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        page.evaluate('(result)=>window.NC_TEST_SHOW_RESULT(result)',result);page.screenshot(path=str(ROOT/'evidence/learning-desktop.png'),full_page=True)
        assert page.locator('#results-body tr').count()==4;checks.append('results view renders actual browser-computed metrics')
        page.evaluate("window.NC_TEST_STATE.source={shareId:'a'.repeat(32),reuse:'local-only'}");page.locator('[data-tab="studio"]').click();page.locator('#reset').click();page.locator('#undo').click()
        assert page.evaluate('!!window.NC_TEST_STATE.source');assert not page.locator('#share-button').is_enabled();checks.append('undo retains source provenance')
        page.locator('[data-tab="learning"]').click();page.evaluate("()=>{window.Worker=class {constructor(){throw new Error('test worker unavailable')}};}");page.locator('#start-training').click();assert not page.evaluate('window.NC_TEST_STATE.busy');assert '起動失敗' in page.locator('#training-status').inner_text();checks.append('worker construction failure recovers UI')
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
        m=mobile.new_page();m.set_content(html);m.add_script_tag(content=bundle());assert m.evaluate('document.documentElement.scrollWidth<=innerWidth+1');checks.append('mobile layout without horizontal overflow')
        m.screenshot(path=str(ROOT/'evidence/studio-mobile.png'),full_page=True)
        assert not errors,errors;checks.append('no browser JS exceptions')
        browser.close()
    out={'passed':len(checks),'checks':checks,'errors':errors,'limitations':['Offline about:blank DOM harness. No URL navigation.','Worker and network E2E not verified: environment URLBlocklist=* policy respected.']}
    (ROOT/'evidence/dom-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False))
if __name__=='__main__':run()
