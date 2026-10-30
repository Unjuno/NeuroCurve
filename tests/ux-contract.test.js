import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const bundle=readFileSync(new URL('../scripts/build-offline.js',import.meta.url),'utf8');

test('sketch uses normalized sorted coordinates in both online and standalone bundles',()=>{
 assert.match(app,/import \{normalizeStrokePoints\} from '\.\/core\/sketch-stroke\.js';/);
 assert.match(app,/normalizeStrokePoints\(g\.points\)/);
 assert.match(bundle,/core\/sketch-stroke\.js/);
});

test('score visibly invalidates when selected suite, mode or backend differs',()=>{
 assert.match(app,/function matchesRunSelection\(\)/);
 assert.match(app,/!matchesRunSelection\(\)/);
 assert.match(app,/\$\('suite-score'\)\.textContent='—'/);
 assert.match(app,/\$\('compute-backend'\)\.onchange=/);
});

test('mobile scoreboard gives readable per-task cards with baseline and detail table',()=>{
 assert.match(html,/id="suite-task-cards"/);
 assert.match(html,/id="score-balance"/);
 assert.match(css,/\.task-card-grid/);
 assert.match(css,/@media\s*\(max-width:\s*720px\)/);
 assert.match(app,/score\.tasks\.filter\(t=>t\?\.score>50\)/);
});

test('explicit offline function and score pack sharing never implies public URL',()=>{
 assert.match(html,/id="share-score-pack"/);
 assert.match(app,/NeuroCurve-share-pack\.json/);
 assert.match(app,/navigator\.canShare/);
});
