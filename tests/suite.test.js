import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSuite,SUITES,relativeTaskScore} from '../public/core/suite.js';
import {makeDataset} from '../public/core/data.js';

const result=(dataset,seed,custom=0.84,baseline=0.80,task='classification')=>({dataset,mode:'quick',datasetVersion:'test',settings:{seeds:[seed]},runs:[
 {name:'Custom',seed,test:{metric:custom},backend:'native-js-cpu',dtype:'float64'},
 {name:'ReLU',seed,test:{metric:baseline},backend:'native-js-cpu',dtype:'float64'},
 {name:'Swish',seed,test:{metric:baseline},backend:'native-js-cpu',dtype:'float64'},
 {name:'GELU',seed,test:{metric:baseline},backend:'native-js-cpu',dtype:'float64'}
 ],task});

test('relative game score is neutral at reference, improves for lower error and respects metric direction',()=>{
 assert.equal(relativeTaskScore(.2,.2),50);
 assert.ok(relativeTaskScore(.1,.2)>50);
 assert.ok(relativeTaskScore(.3,.2)<50);
 assert.ok(relativeTaskScore(.1,.2)>=0&&relativeTaskScore(.1,.2)<=100);
 assert.ok(Number.isFinite(relativeTaskScore(0,0)));
});

test('official core suite requires every task and reports categories separately',()=>{
 const suite=SUITES.core;const reports=suite.tasks.map(task=>result(task,17,task==='wave'||task==='chirp'?.21:.84,task==='wave'||task==='chirp'?.26:.80,task==='wave'||task==='chirp'?'regression':'classification'));
 const out=scoreSuite(reports,'core');
 assert.equal(out.complete,true);assert.equal(out.tasks.length,suite.tasks.length);assert.ok(out.overall>50);
 assert.equal(out.status,'exploratory');assert.equal(Object.keys(out.categories).length,4);
 assert.equal(out.overall,Math.round(out.overall*100)/100);
});

test('incomplete, duplicate or failed tasks cannot earn certified aggregate',()=>{
 const suite=SUITES.core;const reports=suite.tasks.map(task=>result(task,17,.84,.80));
 assert.equal(scoreSuite(reports.slice(1),'core').complete,false);
 assert.equal(scoreSuite([...reports,reports[0]],'core').complete,false);
 const broken=structuredClone(reports);broken[0].runs[0].failed=true;
 assert.equal(scoreSuite(broken,'core').complete,false);
});

test('ten reproducible benchmark datasets have known shape and disjoint splits',()=>{
 for(const [name,inputs,outputs] of [['moons',2,2],['circles',2,2],['spiral',2,3],['xor',2,2],['wave',1,1],['chirp',1,1]]){
  const d=makeDataset(name);const e=makeDataset(name);assert.equal(d.inputs,inputs);assert.equal(d.outputs,outputs);
  assert.deepEqual(d.train[0],e.train[0]);
  const ids=[...d.train,...d.validation,...d.test].map(r=>r.id);assert.equal(new Set(ids).size,ids.length);
  assert.ok(d.train.every(r=>r.x.every(Number.isFinite)));
 }
});

test('score rejects extra failed or off-protocol runs instead of hiding them',()=>{
 const reports=SUITES.core.tasks.map(task=>result(task,17,task==='wave'||task==='chirp'?.21:.84,task==='wave'||task==='chirp'?.26:.80));
 const broken=structuredClone(reports);
 broken[0].runs.push({name:'Custom',seed:29,failed:true,error:'extra trial failed'});
 assert.equal(scoreSuite(broken,'core').complete,false);
});

test('score rejects CPU and GPU mixed between seeds of one task',()=>{
 const reports=SUITES.core.tasks.map(task=>result(task,17,task==='wave'||task==='chirp'?.21:.84,task==='wave'||task==='chirp'?.26:.80));
 const report=reports[0];
 report.mode='full';report.settings.seeds=[17,29];
 report.runs.push(...report.runs.map(r=>({...r,seed:29,backend:'webgpu-compute',dtype:'float32'})));
 for(const other of reports.slice(1)){
  other.mode='full';other.settings.seeds=[17,29];other.runs.push(...other.runs.map(r=>({...r,seed:29})));
 }
 assert.equal(scoreSuite(reports,'core').complete,false);
});

test('official suite rejects cross-task backend or precision mismatches',()=>{
 const reports=SUITES.core.tasks.map(task=>result(task,17,task==='wave'||task==='chirp'?.21:.84,task==='wave'||task==='chirp'?.26:.80));
 reports[3].runs.forEach(r=>{r.backend='webgpu-compute';r.dtype='float32';});
 assert.equal(scoreSuite(reports,'core').complete,false);
});
