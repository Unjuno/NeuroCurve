import {readFile} from 'node:fs/promises';
import {runSuite} from '../public/core/training.js';
import {defaultDefinition} from '../public/core/activation.js';
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
const outputs={kind:report.kind,suiteId:report.suiteId,completed:report.score.complete,overall:report.score.overall,tasks:report.score.tasks.map(t=>({id:t?.id,score:t?.score,metric:t?.customMedian,baseline:t?.baselineMedian})),elapsedMs:Math.round(performance.now()-started)};
console.log(JSON.stringify(outputs,null,2));
if(!report.score.complete||!Number.isFinite(report.score.overall)||report.score.tasks.length!==6)process.exitCode=1;
