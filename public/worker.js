import {runBenchmark,runSuite} from './core/training.js';
import {probeWebGPU,preflightGpuTraining,trainOneGpu} from './core/webgpu.js';
import {loadDataset,makeDataset} from './core/data.js';
import {analyze,ENGINE} from './core/activation.js';

self.onmessage=async({data})=>{
 if(data.type!=='start')return;
 const preference=['auto','webgpu','cpu'].includes(data.backend)?data.backend:'auto';
 let gpu=null;
 try{
  if(preference!=='cpu'){
   self.postMessage({type:'probe-start',backend:preference});
   gpu=await probeWebGPU(self);
   if(gpu.available){
    const dataset=await loadDataset(data.dataset);
    const refs=['relu','swish','gelu'].map(name=>({schema:1,engine:ENGINE,kind:'preset',name,domain:[-100,100]}));
    try{await preflightGpuTraining(gpu.device,[data.definition,...refs],[dataset.inputs,32,32,dataset.outputs],64);}
    catch(error){try{gpu.device.destroy();}catch{}gpu={available:false,reason:error.message};}
   }
   if(!gpu.available && preference==='webgpu')throw new Error(gpu.reason+' CPUモードか自動選択に切り替えてください。');
  }
  const effective=gpu?.available?'webgpu-compute':'native-js-cpu';
  self.postMessage({type:'backend',selected:preference,effective,reason:gpu?.available?'WebGPUコンピュート演算と学習カーネルを検証しました。':gpu?.reason??'CPUを選択しました。',dtype:gpu?.available?'float32':'float64'});
  const runner=gpu?.available?trainOneGpu:null;
  const result=data.scope&&data.scope!=='single'?await runSuite(data.definition,data.scope,data.mode,e=>self.postMessage(e),()=>false,runner,gpu?.available?gpu.device:null):await runBenchmark(data.definition,data.dataset,data.mode,e=>self.postMessage(e),()=>false,null,runner,gpu?.available?gpu.device:null);
  result.backendSelection={requested:preference,effective,gpuVerified:!!gpu?.available,fallbackReason:!gpu?.available?gpu?.reason??null:null};
  self.postMessage({type:'complete',result});
 }catch(error){self.postMessage({type:'error',message:String(error.message??error)});}
 finally{try{gpu?.device?.destroy();}catch{}}
};
