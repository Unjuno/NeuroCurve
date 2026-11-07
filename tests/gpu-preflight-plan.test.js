import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightGpuSuite} from '../public/core/gpu-preflight-plan.js';
import {readFileSync} from 'node:fs';

const metadata={
 moons:[2,2],circles:[2,2],spiral:[2,2],xor:[2,2],
 digits:[64,10],iris:[4,3],wine:[13,3],breast:[30,2],
 wave:[1,1],chirp:[1,1]
};
const load=async id=>{const dims=metadata[id];if(!dims)throw Error('unknown data '+id);return {inputs:dims[0],outputs:dims[1]};};

test('core six task GPU preflight checks every unique input/output topology before training',async()=>{
 const shapes=[],progress=[];
 const result=await preflightGpuSuite({
  scope:'core',dataset:'moons',loadDataset:load,
  verify:async(dimensions,task)=>shapes.push({dimensions,task}),
  notify:e=>progress.push(e)
 });
 assert.deepEqual(shapes.map(x=>x.task),['moons','digits','iris','wave']);
 assert.deepEqual(shapes.map(x=>x.dimensions),[[2,32,32,2],[64,32,32,10],[4,32,32,3],[1,32,32,1]]);
 assert.equal(progress.length,6);assert.equal(progress.at(-1).completed,6);
 assert.equal(result.length,4);
});
test('extended ten task preflight checks all distinct topologies and reports progress',async()=>{
 const seen=[];
 const r=await preflightGpuSuite({
  scope:'extended',dataset:'moons',loadDataset:load,
  verify:async(dimensions,task)=>seen.push(task),notify:()=>{}
 });
 assert.deepEqual(seen,['moons','digits','iris','wine','breast','wave']);
 assert.equal(r.length,6);
});
test('single task preflight only loads the selected dataset',async()=>{
 const loaded=[];
 const r=await preflightGpuSuite({
  scope:'single',dataset:'digits',loadDataset:async task=>{loaded.push(task);return load(task);},
  verify:async()=>{}
 });
 assert.deepEqual(loaded,['digits']);assert.deepEqual(r[0].dimensions,[64,32,32,10]);
});
test('unknown suite or inconsistent topology aborts GPU preflight instead of claiming support',async()=>{
 await assert.rejects(()=>preflightGpuSuite({
  scope:'unknown',dataset:'moons',loadDataset:load,verify:async()=>{}
 }),/評価範囲/);
 await assert.rejects(()=>preflightGpuSuite({
  scope:'core',dataset:'moons',loadDataset:async id=>id==='digits'?{inputs:0,outputs:10}:load(id),
  verify:async()=>{}
 }),/次元/);
});
test('GPU preflight failure propagates without silently running the rest of the tasks',async()=>{
 const verified=[];
 await assert.rejects(()=>preflightGpuSuite({
  scope:'core',dataset:'moons',loadDataset:load,
  verify:async(_dim,task)=>{verified.push(task);if(task==='digits')throw Error('GPU unavailable for digits');}
 }),/GPU unavailable for digits/);
 assert.deepEqual(verified,['moons','digits']);
});
test('production Worker invokes cross-task topology verification, not just the selected dataset',()=>{
 const worker=readFileSync(new URL('../public/worker.js',import.meta.url),'utf8');
 const build=readFileSync(new URL('../scripts/build-offline.js',import.meta.url),'utf8');
 assert.match(worker,/preflightGpuSuite\(/);
 assert.match(worker,/gpu-preflight/);
 assert.match(build,/core\/gpu-preflight-plan\.js/);
});
