import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkflow,transitionWorkflow} from '../public/core/workflow-machine.js';
const go=(s,type,extra={})=>transitionWorkflow(s,{type,...extra});
function started(){let s=initialWorkflow();s=go(s,'SELECTION_CHANGED',{key:'core/quick/cpu'});return go(s,'RUN_START');}
test('switching a benchmark setting invalidates completed, failed, partial and cancelled runs',()=>{
 for(const type of ['RUN_SUCCESS','RUN_PARTIAL','RUN_FAILURE','RUN_CANCEL']){
  let s=started();s=go(s,type,{runId:s.evaluation.runId,error:'deliberate'});
  s=go(s,'SELECTION_CHANGED',{key:'extended/quick/cpu'});
  assert.equal(s.evaluation.phase,'stale',type);
 }
});
test('partial results and failed runs after a curve revision are never current',()=>{
 for(const type of ['RUN_PARTIAL','RUN_FAILURE']){
  let s=started();s=go(s,'DOCUMENT_CHANGED');s=go(s,type,{runId:s.evaluation.runId,error:'failed'});
  assert.equal(s.evaluation.phase,'stale',type);
 }
});
