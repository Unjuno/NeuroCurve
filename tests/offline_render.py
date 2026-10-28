"""Inspect the shipped standalone HTML without navigating restricted URLs.
No Worker or network claims: the managed browser blocks URL navigation.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
checks, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content((ROOT/'dist/NeuroCurve-local.html').read_text(), wait_until='domcontentloaded')
    assert page.locator('#stat-minima').inner_text() == '8'
    checks.append('shipped standalone HTML renders and computes eight true minima')
    assert not page.locator('#share-button').is_enabled()
    checks.append('standalone edition clearly disables server-backed sharing')
    page.locator('[data-mode="expression"]').click()
    page.locator('#expression-input').fill('x*sigmoid(x)')
    page.locator('#apply-expression').click()
    expect(page.locator('#stat-minima')).to_have_text('1')
    checks.append('standalone formula parser computes the Swish valley')
    page.locator('[data-mode="valleys"]').click()
    expect(page.locator('#stat-minima')).to_have_text('8')
    page.screenshot(path=str(ROOT/'evidence/standalone-desktop.png'),full_page=True)
    assert not errors, errors
    checks.append('no JavaScript exceptions from the standalone bundle')
    browser.close()
result = {'passed':len(checks),'checks':checks,'errors':errors,'limits':['about:blank set_content used; no file URL or HTTP navigation.','Browser Worker execution is not covered.']}
(ROOT/'evidence/standalone-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False))
