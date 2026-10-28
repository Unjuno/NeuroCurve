import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {defaultDefinition} from '../public/core/activation.js';
test('real Worker entry point reports compatibility, progress and four completed runs',async()=>{
 const w=new Worker(new URL('./worker-harness.mjs',import.meta.url)),events=[];
 const result=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Worker timeout')),30000);w.on('error',reject);w.on('message',e=>{events.push(e.type);if(e.type==='error'){clearTimeout(t);reject(new Error(e.message));}if(e.type==='complete'){clearTimeout(t);resolve(e.result);}});w.postMessage({type:'start',definition:defaultDefinition(),dataset:'moons',mode:'quick'});}).finally(()=>w.terminate());
 assert.ok(events.includes('self-test'));assert.ok(events.includes('progress'));assert.equal(result.runs.length,4);assert.equal(result.runs.filter(r=>r.failed).length,0);
});
test('terminating an active Worker stops its messages and frees the thread',async()=>{
 const w=new Worker(new URL('./worker-harness.mjs',import.meta.url));let received=0;
 await new Promise((resolve,reject)=>{w.on('error',reject);w.on('message',()=>{received++;resolve();});w.postMessage({type:'start',definition:defaultDefinition(),dataset:'moons',mode:'full'});});
 await w.terminate();const count=received;await new Promise(r=>setTimeout(r,30));assert.equal(received,count);assert.equal(w.threadId,-1);
});

test('GPU required never silently executes CPU when WebGPU is absent',async()=>{
 const w=new Worker(new URL('./worker-harness.mjs',import.meta.url));
 const result=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Timeout')),10000);w.on('error',reject);w.on('message',e=>{if(e.type==='error'||e.type==='complete'){clearTimeout(t);resolve(e);}});w.postMessage({type:'start',backend:'webgpu',definition:defaultDefinition(),dataset:'moons',mode:'quick'});}).finally(()=>w.terminate());
 assert.equal(result.type,'error');assert.match(result.message,/WebGPU/);
});
test('Auto backend exposes fallback reason and true executed backend',async()=>{
 const w=new Worker(new URL('./worker-harness.mjs',import.meta.url));const events=[];
 const result=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Timeout')),30000);w.on('error',reject);w.on('message',e=>{events.push(e);if(e.type==='error'){clearTimeout(t);reject(new Error(e.message));}if(e.type==='complete'){clearTimeout(t);resolve(e.result);}});w.postMessage({type:'start',backend:'auto',definition:defaultDefinition(),dataset:'moons',mode:'quick'});}).finally(()=>w.terminate());
 const selection=events.find(e=>e.type==='backend');assert.equal(selection.effective,'native-js-cpu');assert.equal(selection.selected,'auto');assert.match(selection.reason,/WebGPU/);
 assert.equal(result.backendSelection.gpuVerified,false);assert.ok(result.runs.every(r=>r.backend==='native-js-cpu'));
});
