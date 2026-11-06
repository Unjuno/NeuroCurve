import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkflow,transitionWorkflow,isEvaluationBusy,isCurrentResult,maySubmitShare,workflowLabel} from '../public/core/workflow-machine.js';

const send=(state,type,more={})=>transitionWorkflow(state,{type,...more});
function started(){
 let state=initialWorkflow();
 state=send(state,'SELECTION_CHANGED',{key:'core:quick:cpu'});
 state=send(state,'RUN_START');
 return state;
}
test('evaluation follows idle → preparing → running → complete with a single run ID',()=>{
 let state=started();assert.equal(state.evaluation.phase,'preparing');assert.equal(isEvaluationBusy(state),true);
 const id=state.evaluation.runId;assert.equal(send(state,'RUN_START'),state);
 state=send(state,'RUN_READY',{runId:id});assert.equal(state.evaluation.phase,'running');
 state=send(state,'RUN_SUCCESS',{runId:id});assert.equal(state.evaluation.phase,'complete');
 assert.equal(isCurrentResult(state),true);assert.equal(isEvaluationBusy(state),false);
});
test('edits invalidate active and completed evaluation results',()=>{
 let state=started();const id=state.evaluation.runId;
 state=send(state,'DOCUMENT_CHANGED');state=send(state,'RUN_SUCCESS',{runId:id});
 assert.equal(state.evaluation.phase,'stale');assert.equal(isCurrentResult(state),false);
 state=send(state,'RUN_START');const fresh=state.evaluation.runId;
 state=send(state,'RUN_SUCCESS',{runId:fresh});assert.equal(isCurrentResult(state),true);
 state=send(state,'DOCUMENT_CHANGED');assert.equal(state.evaluation.phase,'stale');assert.equal(isCurrentResult(state),false);
});
test('evaluation selection changes invalidate completed scores and in-flight results',()=>{
 let state=started(),id=state.evaluation.runId;
 state=send(state,'SELECTION_CHANGED',{key:'extended:quick:cpu'});
 state=send(state,'RUN_SUCCESS',{runId:id});assert.equal(state.evaluation.phase,'stale');
 state=send(state,'RUN_START');id=state.evaluation.runId;state=send(state,'RUN_SUCCESS',{runId:id});
 assert.equal(state.evaluation.phase,'complete');state=send(state,'SELECTION_CHANGED',{key:'extended:full:cpu'});
 assert.equal(state.evaluation.phase,'stale');
});
test('cancelled and obsolete worker messages cannot resurrect the score',()=>{
 let state=started();const old=state.evaluation.runId;state=send(state,'RUN_CANCEL',{runId:old});
 assert.equal(state.evaluation.phase,'cancelled');assert.equal(send(state,'RUN_SUCCESS',{runId:old}),state);
 state=send(state,'RUN_START');const next=state.evaluation.runId;assert.notEqual(old,next);
 assert.equal(send(state,'RUN_FAILURE',{runId:old,error:'late error'}),state);
 state=send(state,'RUN_SUCCESS',{runId:next});assert.equal(isCurrentResult(state),true);
});
test('unexpected transitions and repeated terminal events are rejected',()=>{
 const empty=initialWorkflow();assert.equal(send(empty,'RUN_SUCCESS',{runId:1}),empty);
 assert.equal(send(empty,'RUN_READY',{runId:1}),empty);
 let state=started();const id=state.evaluation.runId;
 state=send(state,'RUN_FAILURE',{runId:id,error:'GPU lost'});
 assert.equal(state.evaluation.phase,'error');assert.equal(state.evaluation.error,'GPU lost');
 assert.equal(send(state,'RUN_SUCCESS',{runId:id}),state);assert.equal(isEvaluationBusy(state),false);
});
test('share submission requires backend, current prepared revision and explicit consent',()=>{
 let state=initialWorkflow();assert.equal(send(state,'SHARE_PREPARE',{requestId:'abc'}),state);
 state=send(state,'SHARING_AVAILABLE',{enabled:true});assert.equal(state.sharing.phase,'idle');
 state=send(state,'SHARE_PREPARE',{requestId:'abc'});assert.equal(state.sharing.phase,'prepared');
 assert.equal(maySubmitShare(state),true);
 assert.equal(send(state,'SHARE_SUBMIT',{requestId:'abc',consent:false,keySaved:true}),state);
 assert.equal(send(state,'SHARE_SUBMIT',{requestId:'abc',consent:true,keySaved:false}),state);
 state=send(state,'SHARE_SUBMIT',{requestId:'abc',consent:true,keySaved:true});
 assert.equal(state.sharing.phase,'posting');assert.equal(maySubmitShare(state),false);
 state=send(state,'SHARE_SUCCESS',{requestId:'abc'});assert.equal(state.sharing.phase,'published');
});
test('an edit invalidates a prepared share and its deletion receipt',()=>{
 let state=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 state=send(state,'SHARE_PREPARE',{requestId:'old'});state=send(state,'DOCUMENT_CHANGED');
 assert.equal(state.sharing.phase,'idle');assert.equal(state.sharing.requestId,null);
 assert.equal(send(state,'SHARE_SUBMIT',{requestId:'old',consent:true,keySaved:true}),state);
});
test('shared snapshots are identified even when editing during posting',()=>{
 let state=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 state=send(state,'SHARE_PREPARE',{requestId:'f'});
 state=send(state,'SHARE_SUBMIT',{requestId:'f',consent:true,keySaved:true});
 state=send(state,'DOCUMENT_CHANGED');state=send(state,'SHARE_SUCCESS',{requestId:'f'});
 assert.equal(state.sharing.phase,'published');assert.equal(state.sharing.preparedRevision,0);
 assert.equal(state.documentRevision,1);assert.equal(state.sharing.preparedRevision===state.documentRevision,false);
});
test('failed share is retryable with same ID, but unrelated callbacks are ignored',()=>{
 let state=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 state=send(state,'SHARE_PREPARE',{requestId:'f'});
 state=send(state,'SHARE_SUBMIT',{requestId:'f',consent:true,keySaved:true});
 assert.equal(send(state,'SHARE_SUCCESS',{requestId:'other'}),state);
 state=send(state,'SHARE_FAILURE',{requestId:'f',error:'network'});
 assert.equal(state.sharing.phase,'error');
 state=send(state,'SHARE_SUBMIT',{requestId:'f',consent:true,keySaved:true});
 assert.equal(state.sharing.phase,'posting');
});
test('status label differentiates stale, failure, running and idle for UI',()=>{
 assert.match(workflowLabel(initialWorkflow()),/未評価/);
 let state=started();assert.match(workflowLabel(state),/準備/);
 state=send(state,'RUN_FAILURE',{runId:state.evaluation.runId,error:'GPU'});
 assert.match(workflowLabel(state),/失敗/);
});

test('partial suite is not a certified score even when the Worker finishes normally',()=>{
 let state=started();const id=state.evaluation.runId;
 state=send(state,'RUN_PARTIAL',{runId:id,error:'one dataset failed'});
 assert.equal(state.evaluation.phase,'partial');assert.equal(isCurrentResult(state),false);
 assert.equal(isEvaluationBusy(state),false);assert.match(workflowLabel(state),/一部/);
 assert.equal(send(state,'RUN_SUCCESS',{runId:id}),state);
});

test('communication failure after editing preserves the submitted snapshot identity',()=>{
 let s=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 s=send(s,'SHARE_PREPARE',{requestId:'original'});
 const revision=s.sharing.preparedRevision;
 s=send(s,'SHARE_SUBMIT',{requestId:'original',consent:true,keySaved:true});
 s=send(s,'DOCUMENT_CHANGED');
 s=send(s,'SHARE_FAILURE',{requestId:'original',error:'response lost'});
 assert.equal(s.sharing.phase,'error');
 assert.equal(s.sharing.requestId,'original');
 assert.equal(s.sharing.preparedRevision,revision);
 // Re-opening the dialog must never rebind an old payload to today's curve.
 assert.equal(send(s,'SHARE_PREPARE',{requestId:'original'}),s);
 assert.equal(send(s,'SHARE_SUBMIT',{requestId:'original',consent:true,keySaved:true}),s);
 assert.equal(send(s,'SHARE_RECOVER',{requestId:'original',consent:true,keySaved:true,originalConfirmed:false}),s);
 const recovered=send(s,'SHARE_RECOVER',{requestId:'original',consent:true,keySaved:true,originalConfirmed:true});
 assert.equal(recovered.sharing.phase,'posting');
 assert.equal(recovered.sharing.preparedRevision,revision);
 assert.equal(recovered.sharing.requestId,'original');
});
test('failure after a posted attempt survives further edits to preserve deletion-key recovery',()=>{
 let s=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 s=send(s,'SHARE_PREPARE',{requestId:'maybe-posted'});
 s=send(s,'SHARE_SUBMIT',{requestId:'maybe-posted',consent:true,keySaved:true});
 s=send(s,'SHARE_FAILURE',{requestId:'maybe-posted',error:'timeout'});
 s=send(s,'DOCUMENT_CHANGED');
 s=send(s,'DOCUMENT_CHANGED');
 assert.equal(s.sharing.phase,'error');
 assert.equal(s.sharing.requestId,'maybe-posted');
 assert.equal(s.sharing.preparedRevision,0);
});
test('failed submitted request cannot be replaced with a new ID without an explicit reset',()=>{
 let s=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 s=send(s,'SHARE_PREPARE',{requestId:'first'});
 s=send(s,'SHARE_SUBMIT',{requestId:'first',consent:true,keySaved:true});
 s=send(s,'SHARE_FAILURE',{requestId:'first',error:'network'});
 assert.equal(send(s,'SHARE_PREPARE',{requestId:'second'}),s);
 assert.equal(send(s,'SHARE_RECOVER',{requestId:'first',consent:true,keySaved:true,originalConfirmed:true}),s);
 const reset=send(s,'SHARE_RESET');
 assert.equal(reset.sharing.phase,'idle');
 assert.equal(send(reset,'SHARE_PREPARE',{requestId:'second'}).sharing.requestId,'second');
});
test('old-share recovery rejects the wrong request ID and missing consent or receipt',()=>{
 let s=send(initialWorkflow(),'SHARING_AVAILABLE',{enabled:true});
 s=send(s,'SHARE_PREPARE',{requestId:'first'});
 s=send(s,'SHARE_SUBMIT',{requestId:'first',consent:true,keySaved:true});
 s=send(s,'DOCUMENT_CHANGED');
 s=send(s,'SHARE_FAILURE',{requestId:'first',error:'connection'});
 for(const input of [
  {requestId:'forged',consent:true,keySaved:true,originalConfirmed:true},
  {requestId:'first',consent:false,keySaved:true,originalConfirmed:true},
  {requestId:'first',consent:true,keySaved:false,originalConfirmed:true},
  {requestId:'first',consent:true,keySaved:true,originalConfirmed:false}
 ])assert.equal(send(s,'SHARE_RECOVER',input),s);
});
