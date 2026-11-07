import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkflow,transitionWorkflow,suiteDisplayStatus} from '../public/core/workflow-machine.js';
import {readFileSync} from 'node:fs';

const send=(s,type,props={})=>transitionWorkflow(s,{type,...props});
const render=(s,extra={})=>suiteDisplayStatus(s,{certified:false,previewComplete:true,progressCount:6,total:6,scoreMode:'exploratory',...extra});

test('failure and cancellation never masquerade as waiting for a final completion message',()=>{
 let failed=send(initialWorkflow(),'SELECTION_CHANGED',{key:'core/cpu'});
 failed=send(failed,'RUN_START');
 failed=send(failed,'RUN_FAILURE',{runId:failed.evaluation.runId,error:'lost GPU'});
 assert.match(render(failed),/失敗/);assert.match(render(failed),/総合点未確定/);
 assert.doesNotMatch(render(failed),/通知待ち/);

 let cancelled=send(initialWorkflow(),'SELECTION_CHANGED',{key:'core/cpu'});
 cancelled=send(cancelled,'RUN_START');
 cancelled=send(cancelled,'RUN_CANCEL',{runId:cancelled.evaluation.runId});
 assert.match(render(cancelled),/中断/);assert.match(render(cancelled),/総合点未確定/);
});
test('scoreboard status distinguishes an otherwise completed task set from a certified Worker completion',()=>{
 let s=send(initialWorkflow(),'SELECTION_CHANGED',{key:'core/cpu'});
 s=send(s,'RUN_START');
 assert.match(render(s),/最終完了通知を確認中/);
 s=send(s,'RUN_SUCCESS',{runId:s.evaluation.runId});
 assert.match(render(s,{certified:true}),/探索結果/);
 assert.match(render(s,{outdated:true}),/再評価/);
});
test('scoreboard renders the pure status policy rather than inline approximations',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/suiteDisplayStatus\(workflow/);
});
