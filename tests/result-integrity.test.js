import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSingleBenchmark,describeTaskFailure} from '../public/core/result-integrity.js';
import {readFileSync} from 'node:fs';

const NAMES=['Custom','ReLU','Swish','GELU'];
function makeReport({
 dataset='moons',mode='quick',seeds=mode==='quick'?[17]:[17,29,43,71,101],
 backend='native-js-cpu',dtype='float64'
}={}){
 const steps=mode==='quick'?150:600;
 const runs=seeds.flatMap(seed=>NAMES.map(name=>({
  name,seed,backend,dtype,failed:false,
  metricName:dataset==='wave'||dataset==='chirp'?'RMSE':'Accuracy',
  test:{metric:dataset==='wave'||dataset==='chirp'?.25:.85},
  config:{steps,batch:64,hidden:[32,32],learningRate:.001,optimizer:'Adam'}
 })));
 return {dataset,mode,datasetVersion:'test',settings:{steps,seeds,hidden:[32,32],batch:64,optimizer:'Adam',learningRate:.001},runs};
}
test('all matched four activations produce an auditable quick benchmark',()=>{
 const a=auditSingleBenchmark(makeReport());
 assert.equal(a.complete,true);assert.equal(a.totalExpected,4);
 assert.equal(a.failures.length,0);
});
test('a genuine five-seed benchmark requires exactly twenty matched runs',()=>{
 const a=auditSingleBenchmark(makeReport({mode:'full'}));
 assert.equal(a.complete,true);assert.equal(a.totalExpected,20);
});
test('single-task report with one failed run is partial and exposes failure cause',()=>{
 const r=makeReport();r.runs[1]={...r.runs[1],failed:true,error:'out of memory',test:null};
 const a=auditSingleBenchmark(r);
 assert.equal(a.complete,false);assert.ok(a.failures.some(f=>f.includes('out of memory')));
 assert.match(a.statusText,/未完了/);
});
test('missing, duplicated and unexpected runs are rejected',()=>{
 const lost=makeReport();lost.runs.pop();assert.equal(auditSingleBenchmark(lost).complete,false);
 const duplicate=makeReport();duplicate.runs.push(duplicate.runs[0]);
 assert.equal(auditSingleBenchmark(duplicate).complete,false);
 const unexpected=makeReport();unexpected.runs[0].name='Fake';assert.equal(auditSingleBenchmark(unexpected).complete,false);
});
test('CPU/GPU/dtype mixed within a single task never passes as a paired comparison',()=>{
 const r=makeReport();r.runs[0].backend='webgpu-compute';r.runs[0].dtype='float32';
 assert.equal(auditSingleBenchmark(r).complete,false);
});
test('invalid, nonfinite or out-of-range test metrics cannot be certified',()=>{
 for(const v of [NaN,Infinity,-.001,1.001]){
  const r=makeReport();r.runs[0].test.metric=v;
  assert.equal(auditSingleBenchmark(r).complete,false);
 }
 const regression=makeReport({dataset:'wave'});regression.runs[0].test.metric=-.01;
 assert.equal(auditSingleBenchmark(regression).complete,false);
});
test('missing or mismatched step, hidden, batch and protocol seed configuration is rejected',()=>{
 const list=[
  r=>r.runs[0].config.steps=300,
  r=>r.runs[0].config.batch=32,
  r=>r.runs[0].config.hidden=[16,16],
  r=>r.runs[0].config.learningRate=.01,
  r=>r.settings.seeds=[29],
  r=>r.mode='full'
 ];
 for(const mutation of list){const r=makeReport();mutation(r);assert.equal(auditSingleBenchmark(r).complete,false);}
});
test('the task failure description exposes bounded user-safe context',()=>{
 assert.match(describeTaskFailure({error:'dataset download failed'}),/dataset download failed/);
 const r=makeReport();r.runs[0].failed=true;r.runs[0].error='x'.repeat(300);
 const d=describeTaskFailure(r);
 assert.match(d,/Custom/);assert.ok(d.length<=220);
 assert.match(describeTaskFailure(makeReport()),/条件を再確認/);
});
test('missing reports do not crash the learning page',()=>{
 assert.equal(auditSingleBenchmark(null).complete,false);
 assert.equal(describeTaskFailure(null),'未実行');
});
test('browser UI uses the audit to certify single-task completion and reveal task failure causes',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/auditSingleBenchmark\(e\.result\)/);
 assert.match(app,/describeTaskFailure\(report\)/);
 assert.match(app,/単一課題の比較は未完了/);
});
