import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUITES} from '../public/core/suite.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('every benchmark dataset is listed once, matching the official extended suite',()=>{
 const select=html.match(/<select id="dataset">([\s\S]*?)<\/select>/)?.[1];
 assert.ok(select,'dataset selector must exist');
 const values=[...select.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(values).size,values.length,'duplicate dataset options');
 assert.deepEqual([...values].sort(),[...SUITES.extended.tasks].sort());
});

test('every function-changing UI path invalidates an existing challenge score',()=>{
 const undo=source.match(/\$\('undo'\)\.onclick=\(\)=>\{([\s\S]*?)\};\$\('redo'\)/)?.[1];
 const redo=source.match(/\$\('redo'\)\.onclick=\(\)=>\{([\s\S]*?)\};\s*\$\('depth-square'\)/)?.[1];
 const pointEdit=source.match(/function finishGesture\(\)\{([\s\S]*?)\n\}/)?.[1];
 for(const [name,handler]of [['undo',undo],['redo',redo],['point-edit',pointEdit]]){
  assert.ok(handler,name+' handler exists');
  assert.match(handler,/invalidateScore\(\)/,name+' must invalidate prior measurements');
 }
});
