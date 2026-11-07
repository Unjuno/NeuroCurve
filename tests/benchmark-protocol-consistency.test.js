import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSuite,SUITES,DATASET_TASK} from '../public/core/suite.js';
import {auditSingleBenchmark} from '../public/core/result-integrity.js';
import {readFileSync} from 'node:fs';

const SEEDS={quick:[17],full:[17,29,43,71,101]};
const ACTIVATIONS=['Custom','ReLU','Swish','GELU'];
function report(dataset,mode='quick'){
 const type=DATASET_TASK[dataset],steps=mode==='quick'?150:600;
 const runs=SEEDS[mode].flatMap(seed=>ACTIVATIONS.map(name=>({
  name,seed,failed:false,backend:'native-js-cpu',dtype:'float64',
  metricName:type==='regression'?'RMSE':'Accuracy',
  test:{metric:type==='regression'?.25:.84},
  config:{steps,batch:64,hidden:[32,32],learningRate:.001,optimizer:'Adam'}
 })));
 return {dataset,mode,datasetVersion:dataset+'-v1',
  settings:{steps,seeds:[...SEEDS[mode]],batch:64,hidden:[32,32],optimizer:'Adam',learningRate:.001},
  runs};
}
const all=(mode='quick')=>SUITES.core.tasks.map(task=>report(task,mode));

test('a fully matched core protocol is an eligible exploratory score',()=>{
 const reports=all();
 assert.equal(reports.every(r=>auditSingleBenchmark(r).complete),true);
 const grade=scoreSuite(reports,'core');
 assert.equal(grade.complete,true);
 assert.equal(grade.tasks.length,6);
});

test('changing quick seed to unapproved seed cannot be certified by the suite',()=>{
 const reports=all(),r=reports[0];
 r.settings.seeds=[29];r.runs.forEach(x=>{x.seed=29;});
 assert.equal(auditSingleBenchmark(r).complete,false);
 assert.equal(scoreSuite(reports,'core').complete,false);
});

test('suite rejects wrong step budget and hidden layer structure for one activation',()=>{
 for(const change of [
  r=>{r.runs[0].config.steps=50;},
  r=>{r.runs[0].config.batch=32;},
  r=>{r.runs[0].config.hidden=[16,16];},
  r=>{r.runs[0].config.learningRate=.01;}
 ]){
  const reports=all();change(reports[0]);
  assert.equal(auditSingleBenchmark(reports[0]).complete,false);
  assert.equal(scoreSuite(reports,'core').complete,false);
 }
});

test('a suite cannot use a wrong metric, invalid mode or wrong optimizer',()=>{
 for(const change of [
  r=>{r.runs[0].metricName='RMSE';},
  r=>{r.mode='nonstandard';},
  r=>{r.settings.optimizer='SGD';},
  r=>{r.settings.hidden=[16,16];}
 ]){
  const reports=all();for(const r of reports)change(r);
  assert.equal(scoreSuite(reports,'core').complete,false);
 }
});

test('CPU result with Float32 precision, or fake backend, is not a fair official score',()=>{
 for(const change of [
  r=>{for(const v of r.runs)v.dtype='float32';},
  r=>{for(const v of r.runs)v.backend='unknown-accelerator';}
 ]){
  const reports=all();reports.forEach(change);
  assert.equal(scoreSuite(reports,'core').complete,false);
 }
});

test('suite refuses a successful-looking run with missing failure flag or config',()=>{
 for(const change of [
  r=>{delete r.runs[0].failed;},
  r=>{delete r.runs[0].config;},
  r=>{delete r.settings.steps;}
 ]){
  const reports=all();change(reports[0]);
  assert.equal(scoreSuite(reports,'core').complete,false);
 }
});

test('real training and score auditor use one shared protocol definition',()=>{
 const source=readFileSync(new URL('../public/core/training.js',import.meta.url),'utf8');
 const suite=readFileSync(new URL('../public/core/suite.js',import.meta.url),'utf8');
 const single=readFileSync(new URL('../public/core/result-integrity.js',import.meta.url),'utf8');
 assert.match(source,/benchmark-protocol\.js/);
 assert.match(suite,/benchmark-protocol\.js/);
 assert.match(single,/benchmark-protocol\.js/);
});
