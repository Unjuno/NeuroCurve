import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { defaultDefinition } from '../public/core/activation.js';
import { runBenchmark } from '../public/core/training.js';
mkdirSync('evidence',{recursive:true});
const digits=JSON.parse(readFileSync('public/data/digits-v1.json','utf8'));
const hardware={runtime:process.version,cpu:os.cpus()[0]?.model,logicalCPUs:os.availableParallelism(),observedMHz:os.cpus()[0]?.speed,clockFixed:false,backend:'native-js-cpu',dtype:'float64',workerCount:1,exclusiveMachine:false,backgroundLoadControlled:false,mode:'full',purpose:'integration test, not an independent research evaluation'};
for (const dataset of ['moons','wave','digits']) {
 console.log('START',dataset,new Date().toISOString());
 const result=await runBenchmark(defaultDefinition(),dataset,'full',e=>{if(e.type==='run-end') console.log('RUN',dataset,e.run.name,e.run.seed,e.run.failed?'FAIL':e.run.test.metric,e.run.elapsedMs??e.run.error)},()=>false,dataset==='digits'?digits:null);
 writeFileSync(`evidence/integration-${dataset}.json`,JSON.stringify({...result,hardware},null,2));
 console.log('DONE',dataset,JSON.stringify(result.summary.groups));
}
