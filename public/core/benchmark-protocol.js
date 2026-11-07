/**
 * Shared, strictly local evaluation protocol for all official NeuroCurve scores.
 *
 * This module only validates consistency of a reported experiment. It cannot
 * attest to whether an untrusted client actually performed its calculations.
 * It is independent of both the training engine and the UI to avoid cycles.
 */
export const PROTOCOL_MODES=Object.freeze({
 quick:Object.freeze({steps:150,seeds:Object.freeze([17])}),
 full:Object.freeze({steps:600,seeds:Object.freeze([17,29,43,71,101])})
});
export const PROTOCOL_NAMES=Object.freeze(['Custom','ReLU','Swish','GELU']);
export const PROTOCOL_HIDDEN=Object.freeze([32,32]);
export const PROTOCOL_BATCH=64;
export const PROTOCOL_LR=.001;

const sameNumbers=(values,expected)=>Array.isArray(values)&&values.length===expected.length&&
 expected.every((value,i)=>values[i]===value);
const validMetric=(value,type)=>Number.isFinite(value)&&
 (type==='classification'?(value>=0&&value<=1):value>=0);

/**
 * Validate the complete experimental protocol before certifying a local score.
 * @param {object} report - the output of runBenchmark, not editable UI state.
 * @param {'classification'|'regression'} type - fixed task metadata.
 */
export function inspectBenchmarkProtocol(report,type){
 const failures=[];
 const reject=message=>{if(failures.length<12)failures.push(message);};
 const mode=report?.mode,policy=PROTOCOL_MODES[mode];
 if(!policy||!['classification','regression'].includes(type)){
  reject('不正な課題または評価モードです。');
  return {complete:false,totalExpected:0,observed:0,failures};
 }
 const expected=policy.seeds,totalExpected=expected.length*PROTOCOL_NAMES.length;
 const settings=report?.settings;
 if(!sameNumbers(settings?.seeds,expected))reject('評価シードが規定と一致しません。');
 if(settings?.steps!==policy.steps||settings?.batch!==PROTOCOL_BATCH||
    !sameNumbers(settings?.hidden,PROTOCOL_HIDDEN)||
    settings?.learningRate!==PROTOCOL_LR||settings?.optimizer!=='Adam')
  reject('モデル構造または学習条件が規定と一致しません。');
 if(typeof report?.datasetVersion!=='string'||!report.datasetVersion||
    report.datasetVersion==='unavailable')
  reject('データセットのバージョンが不明です。');
 const runs=Array.isArray(report?.runs)?report.runs:[];
 if(runs.length!==totalExpected)
  reject(`学習実行数が不足または重複しています（${runs.length}/${totalExpected}）。`);
 let backend=null,dtype=null;
 const visited=new Set();
 for(const run of runs){
  const name=run?.name,seed=run?.seed;
  if(!PROTOCOL_NAMES.includes(name)||!expected.includes(seed)){
   reject('想定外の活性化関数またはシードが含まれています。');continue;
  }
  const id=`${name}:${seed}`;
  if(visited.has(id)){reject(`重複実行: ${name} / seed ${seed}`);continue;}
  visited.add(id);
  if(run.failed!==false){
   reject(`${name} / seed ${seed}: ${String(run.error??'学習失敗').slice(0,145)}`);
   continue;
  }
  if(!validMetric(run.test?.metric,type))
   reject(`${name} / seed ${seed}: 測定値が無効です。`);
  if(run.metricName!==(type==='classification'?'Accuracy':'RMSE'))
   reject(`${name} / seed ${seed}: 評価指標が一致しません。`);
  if(!['native-js-cpu','webgpu-compute'].includes(run.backend)||
     (run.backend==='native-js-cpu'&&run.dtype!=='float64')||
     (run.backend==='webgpu-compute'&&run.dtype!=='float32'))
   reject(`${name} / seed ${seed}: 計算方式と数値精度が一致しません。`);
  else if(backend!==null&&(backend!==run.backend||dtype!==run.dtype))
   reject('CPU/GPUまたは数値精度が混在しています。');
  else if(backend===null){backend=run.backend;dtype=run.dtype;}
  const config=run.config;
  if(!config||config.steps!==policy.steps||config.batch!==PROTOCOL_BATCH||
     !sameNumbers(config.hidden,PROTOCOL_HIDDEN)||config.learningRate!==PROTOCOL_LR||
     config.optimizer!==(run.backend==='webgpu-compute'?'Adam GPU':'Adam'))
   reject(`${name} / seed ${seed}: 固定学習条件と一致しません。`);
 }
 return {complete:failures.length===0&&visited.size===totalExpected,
  totalExpected,observed:runs.length,failures,backend,dtype};
}
