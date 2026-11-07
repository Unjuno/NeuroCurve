import {readFile} from 'node:fs/promises';
import {cpus,arch,platform} from 'node:os';
import {runSuite} from '../public/core/training.js';
import {defaultDefinition} from '../public/core/activation.js';

// No network datasets: load the committed, hash-checked local benchmark files.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 if(typeof url==='string'&&url.startsWith('/data/')){
  const bytes=await readFile(new URL('../public'+url,import.meta.url));
  return new Response(bytes,{status:200});
 }
 return nativeFetch(url);
};
const started=performance.now();
const report=await runSuite(defaultDefinition(),'core','quick',()=>{});
const duration=performance.now()-started;
const runs=report.reports.flatMap(r=>r.runs??[]);
const cpu=cpus(),model=cpu[0]?.model??'unknown';
const successfulRuns=runs.filter(r=>r.failed===false);
const conditions={
 node:process.version,platform:platform(),arch:arch(),
 cpuModel:model,reportedLogicalCpus:cpu.length,
 reportedClockMHz:cpu[0]?.speed??null,
 floatingPoint:'JavaScript Float64',seeds:[17],steps:150,
 hiddenLayers:[32,32],batch:64,optimizer:'Adam',learningRate:0.001,
 notice:'One run on this CI runner is a smoke test, not a hardware-independent performance benchmark or proof of superiority.'
};
const output={
 suite:report.suiteId,completed:report.score.complete,overall:report.score.overall,
 tasks:report.score.tasks.map(t=>({id:t?.id,score:t?.score,metric:t?.customMedian,baseline:t?.baselineMedian})),
 attemptedTrainingRuns:runs.length,successfulTrainingRuns:successfulRuns.length,
 elapsedMs:Math.round(duration),conditions
};
console.log(JSON.stringify(output,null,2));
if(!report.score.complete||!Number.isFinite(report.score.overall)||
   report.score.tasks.length!==6||report.reports.length!==6||runs.length!==24||
   successfulRuns.length!==24||
   runs.some(r=>r.backend!=='native-js-cpu'||r.dtype!=='float64')){
 console.error('FAIL: actual six-task CPU training did not meet the full protocol');
 process.exitCode=1;
}
