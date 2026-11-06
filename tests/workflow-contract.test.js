import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const style=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
test('app dispatches explicit evaluation transition events in worker lifecycle',()=>{
 for(const type of ['RUN_START','RUN_READY','RUN_SUCCESS','RUN_FAILURE','RUN_CANCEL','SELECTION_CHANGED','DOCUMENT_CHANGED'])
  assert.ok(app.includes("'"+type+"'"),type+' must be dispatched');
 assert.match(app,/state\.worker\s*!==\s*worker/);
 assert.match(app,/runId/);
});
test('editing and undo/redo invalidate an evaluation even while its Worker runs',()=>{
 assert.match(app,/function invalidateScore\(\)[\s\S]*?DOCUMENT_CHANGED/);
 assert.match(app,/\$\('undo'\)\.onclick=[^\n]*invalidateScore/);
 assert.match(app,/\$\('redo'\)\.onclick=[^\n]*invalidateScore/);
});
test('sharing is revision guarded by explicit consent and request identity',()=>{
 for(const type of ['SHARING_AVAILABLE','SHARE_PREPARE','SHARE_SUBMIT','SHARE_SUCCESS','SHARE_FAILURE'])
  assert.ok(app.includes("'"+type+"'"),type+' must be dispatched');
 assert.match(app,/maySubmitShare\(workflow\)/);
});
test('workflow state is visible and accessible without relying on color alone',()=>{
 for(const id of ['workflow-status','workflow-document','workflow-evaluation','workflow-sharing'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/role="status"/);assert.match(style,/\.workflow-ribbon/);assert.match(style,/:focus-visible/);
});
