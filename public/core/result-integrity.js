/**
 * Verify a single benchmark report against the fixed, reproducible protocol.
 * The auditor does not perform ML or accept a client-provided "complete" flag.
 * Intended for honest local UI state, not for server-side score attestation.
 */
import {MODES} from './training.js';
import {DATASET_TASK} from './suite.js';

const EXPECTED_NAMES=['Custom','ReLU','Swish','GELU'];

export function auditSingleBenchmark(report){
 const failures=[];
 const reject=reason=>{if(failures.length<12)failures.push(reason);};
 const mode=report?.mode, settings=MODES[mode], type=DATASET_TASK[report?.dataset];
 if(!settings||!type){
  reject('不正な課題または評価モードです。');
  return {complete:false,totalExpected:0,observed:0,failures,statusText:'単一課題の比較は未完了'};
 }
 const expected=settings.seeds, reported=report.settings?.seeds;
 if(!Array.isArray(reported)||reported.length!==expected.length||reported.some((seed,i)=>seed!==expected[i]))
  reject('評価シードが規定と一致しません。');
 const runs=Array.isArray(report.runs)?report.runs:[];
 const totalExpected=expected.length*EXPECTED_NAMES.length;
 if(runs.length!==totalExpected)reject(`学習実行数が不足または重複しています（${runs.length}/${totalExpected}）。`);
 const visited=new Set();
 let backend=null,dtype=null;
 for(const run of runs){
  const name=run?.name,seed=run?.seed;
  if(!EXPECTED_NAMES.includes(name)||!expected.includes(seed)){
   reject('想定外の活性化関数またはシードが含まれています。');continue;
  }
  const id=`${name}:${seed}`;
  if(visited.has(id)){reject(`重複実行: ${name} / seed ${seed}`);continue;}
  visited.add(id);
  if(run.failed!==false){
   reject(`${name} / seed ${seed}: ${String(run.error||'学習失敗').slice(0,145)}`);continue;
  }
  const value=run.test?.metric;
  if(!Number.isFinite(value)||(type==='classification'?(value<0||value>1):value<0))
   reject(`${name} / seed ${seed}: 測定値が無効です。`);
  if(run.metricName!==(type==='classification'?'Accuracy':'RMSE'))
   reject(`${name} / seed ${seed}: 評価指標が一致しません。`);
  if(typeof run.backend!=='string'||!run.backend||typeof run.dtype!=='string'||!run.dtype)
   reject(`${name} / seed ${seed}: 計算方式または精度が不明です。`);
  else if(backend!==null&&(backend!==run.backend||dtype!==run.dtype))
   reject('CPU/GPUまたは数値精度が混在しています。');
  else if(backend===null){backend=run.backend;dtype=run.dtype;}
  const c=run.config;
  if(!c||c.steps!==settings.steps||c.batch!==64||!Array.isArray(c.hidden)||c.hidden.length!==2||
    c.hidden[0]!==32||c.hidden[1]!==32||c.learningRate!==.001)
   reject(`${name} / seed ${seed}: 固定学習条件と一致しません。`);
 }
 const complete=failures.length===0&&visited.size===totalExpected;
 return {complete,totalExpected,observed:runs.length,failures,
  statusText:complete?'単一課題の比較が完了':'単一課題の比較は未完了'};
}

export function describeTaskFailure(report){
 if(!report)return '未実行';
 let reason=report.error;
 if(!reason){
  const r=report.runs?.find(run=>run.failed||!Number.isFinite(run.test?.metric));
  if(r)reason=`${r.name??'関数'} / seed ${r.seed??'?'}: ${r.error??'測定値が無効'}`;
 }
 const out=reason?String(reason):'評価条件を再確認して再実行してください。';
 return out.slice(0,200);
}
