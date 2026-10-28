import {defaultDefinition,ENGINE} from './core/activation.js';
import {makeDataset} from './core/data.js';
import {probeWebGPU,preflightGpuTraining,trainOneGpu} from './core/webgpu.js';
self.onmessage=async({data})=>{
 if(data?.type!=='test')return;
 let probe;
 try{
  self.postMessage({type:'status',text:'Worker内のGPUアダプターと演算を確認中…'});
  probe=await probeWebGPU(self);
  if(!probe.available)throw new Error(probe.reason);
  const d=defaultDefinition(),dataset=makeDataset('moons');
  const definitions=[d,...['relu','swish','gelu'].map(name=>({schema:1,engine:ENGINE,kind:'preset',name,domain:[-100,100]}))];
  const preflight=await preflightGpuTraining(probe.device,definitions,[dataset.inputs,32,32,dataset.outputs]);
  self.postMessage({type:'status',text:'学習用カーネル検証済み。10更新のGPU学習と勾配照合を実行中…'});
  const result=await trainOneGpu(d,dataset,{steps:10,batch:64,seed:17},progress=>self.postMessage({type:'progress',progress}),()=>false,probe.device);
  self.postMessage({type:'complete',result:{backend:result.backend,dtype:result.dtype,gpuSetupMs:result.gpuSetupMs,elapsedMs:result.elapsedMs,initialTrainLoss:result.initialTrainLoss,finalTrainLoss:result.finalTrainLoss,gradientAudit:result.gradientAudit,activationLut:result.activationLut,preflight,gradientClip:result.gradientClip}});
 }catch(e){self.postMessage({type:'error',message:String(e.message??e)});}
 finally{try{probe?.device?.destroy();}catch{}}
};
