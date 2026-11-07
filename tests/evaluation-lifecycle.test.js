import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorkflow,transitionWorkflow,canCertifySuiteScore} from '../public/core/workflow-machine.js';
import {createWorkerWatchdog} from '../public/core/worker-watchdog.js';
import {readFileSync} from 'node:fs';

const send=(s,type,fields={})=>transitionWorkflow(s,{type,...fields});
function stateWithRun(){let s=initialWorkflow();s=send(s,'SELECTION_CHANGED',{key:'core/quick/cpu'});return send(s,'RUN_START');}
function parameters(){return {scoreComplete:true,selectionMatches:true,resultMatches:true};}

test('a complete batch of task messages does not certify a score before Worker completion',()=>{
 let s=stateWithRun(),id=s.evaluation.runId;
 assert.equal(canCertifySuiteScore(s,parameters()),false);
 s=send(s,'RUN_READY',{runId:id});assert.equal(canCertifySuiteScore(s,parameters()),false);
 s=send(s,'RUN_SUCCESS',{runId:id});assert.equal(canCertifySuiteScore(s,parameters()),true);
});
test('score remains uncertified after changes, cancellation, partial suite or failure',()=>{
 let s=stateWithRun(),id=s.evaluation.runId;
 s=send(s,'RUN_PARTIAL',{runId:id});assert.equal(canCertifySuiteScore(s,parameters()),false);
 s=send(s,'RUN_START');id=s.evaluation.runId;s=send(s,'RUN_SUCCESS',{runId:id});
 assert.equal(canCertifySuiteScore(s,{...parameters(),scoreComplete:false}),false);
 assert.equal(canCertifySuiteScore(s,{...parameters(),selectionMatches:false}),false);
 assert.equal(canCertifySuiteScore(s,{...parameters(),resultMatches:false}),false);
 s=send(s,'DOCUMENT_CHANGED');assert.equal(canCertifySuiteScore(s,parameters()),false);
 s=send(s,'RUN_START');id=s.evaluation.runId;s=send(s,'RUN_CANCEL',{runId:id});
 assert.equal(canCertifySuiteScore(s,parameters()),false);
});
test('watchdog times out if Worker never sends its first message',()=>{
 const queue=new Map();let sequence=0,phases=[];
 const clock={schedule:(fn,ms)=>{const id=++sequence;queue.set(id,{fn,ms});return id;},unschedule:id=>queue.delete(id)};
 createWorkerWatchdog({...clock,onTimeout:phase=>phases.push(phase),startupMs:15000,activeMs:130000});
 assert.equal([...queue.values()][0].ms,15000);
 [...queue.values()][0].fn();assert.deepEqual(phases,['startup']);
});
test('Worker activity rearms the deadline, and cleared older timer callbacks are harmless',()=>{
 const queue=new Map();let next=0,phases=[];
 const clock={schedule:(fn,ms)=>{let id=++next;queue.set(id,{fn,ms});return id;},unschedule:id=>queue.delete(id)};
 const watchdog=createWorkerWatchdog({...clock,onTimeout:phase=>phases.push(phase),startupMs:15,activeMs:130});
 const old=queue.get(1).fn;watchdog.activity();
 assert.equal(queue.size,1);assert.equal([...queue.values()][0].ms,130);
 old();assert.deepEqual(phases,[],'a cancelled timeout must not fire after activity');
 const active=queue.get(2).fn;watchdog.activity();active();assert.deepEqual(phases,[]);
 queue.get(3).fn();assert.deepEqual(phases,['active']);
});
test('explicit stop prevents all future watchdog timeouts',()=>{
 const queue=new Map();let next=0,timedOut=0;
 const watchdog=createWorkerWatchdog({
  schedule:(fn,ms)=>{const id=++next;queue.set(id,fn);return id;},
  unschedule:id=>queue.delete(id),onTimeout:()=>timedOut++,startupMs:100,activeMs:100
 });
 const first=queue.get(1);watchdog.stop();first();assert.equal(queue.size,0);assert.equal(timedOut,0);
 assert.equal(watchdog.activity(),false);
});
test('score certification and watchdog guards are actually used in app UI',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/canCertifySuiteScore\(workflow/);
 assert.match(app,/\$\('suite-score'\)\.textContent=certified\?/);
 assert.match(app,/createWorkerWatchdog\(/);
 assert.match(app,/workerWatchdog\.activity\(\)/);
 assert.match(app,/workerWatchdog\?\.stop\(\)/);
});
