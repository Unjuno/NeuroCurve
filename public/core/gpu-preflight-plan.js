/**
 * Preflight all distinct input/output topologies for a multi-task GPU run.
 *
 * A GPU adapter that handles Two Moons (2→2) need not support Digits (64→10)
 * or larger tabular tasks. A suite must select one consistent backend before
 * any task starts; partial GPU/CPU scores are not scientifically comparable.
 */
import {SUITES,DATASET_TASK} from './suite.js';

export async function preflightGpuSuite({scope='single',dataset,loadDataset,verify,notify=()=>{}}={}){
 if(typeof loadDataset!=='function'||typeof verify!=='function'||typeof notify!=='function')
  throw new TypeError('GPU preflight requires loader, verifier and progress callback');
 let tasks;
 if(!scope||scope==='single'){
  if(!DATASET_TASK[dataset])throw new Error('不正な評価課題です。');
  tasks=[dataset];
 }else{
  const suite=SUITES[scope];
  if(!suite)throw new Error('不正な評価範囲です。');
  tasks=suite.tasks;
 }
 const checked=[],seen=new Set();
 for(let i=0;i<tasks.length;i++){
  const task=tasks[i],data=await loadDataset(task);
  if(!data||!Number.isInteger(data.inputs)||data.inputs<1||!Number.isInteger(data.outputs)||data.outputs<1)
   throw new Error('GPU事前検査のデータ次元が不正です: '+task);
  const key=`${data.inputs}/${data.outputs}`,dimensions=[data.inputs,32,32,data.outputs];
  if(!seen.has(key)){
   // Any failure aborts selection of GPU for the whole suite; callers may
   // explicitly choose uniform CPU fallback in "auto" mode.
   await verify(dimensions,task);
   seen.add(key);checked.push({dataset:task,dimensions});
  }
  notify({type:'gpu-preflight',dataset:task,completed:i+1,total:tasks.length,verifiedShapes:checked.length});
 }
 return checked;
}
