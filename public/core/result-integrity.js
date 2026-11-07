/**
 * Single-task and suite scores use the same strict local benchmark protocol.
 * Data is self-reported by the browser; this is not server-side attestation.
 */
import {inspectBenchmarkProtocol} from './benchmark-protocol.js';
import {DATASET_TASK} from './suite.js';

export function auditSingleBenchmark(report){
 const inspected=inspectBenchmarkProtocol(report,DATASET_TASK[report?.dataset]);
 return {...inspected,statusText:inspected.complete?
  '単一課題の比較が完了':'単一課題の比較は未完了'};
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
