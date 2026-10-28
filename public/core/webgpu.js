/** WebGPU Float32 mini-batch MLP training. No external code, WebGL emulation, or server training.
 * GPU work: per-example forward/backward, mini-batch reduction, global gradient clipping, Adam.
 * CPU work: seeded data generation, progress readback and final metrics on read-back weights.
 * User activations are sampled into a C1 cubic-Hermite lookup table, checked against originals.
 */
import {compileDefinition,wells,ENGINE} from './activation.js';
import {rng} from './data.js';
import {Network} from './training.js';

const U={MAP_READ:1,COPY_SRC:4,COPY_DST:8,UNIFORM:64,STORAGE:128};
const MAP_READ=1;
export const GPU_GRID_INTERVALS=16384;
const float32=x=>Math.fround(x);
export function isWebGpuAvailable(nav=typeof navigator!=='undefined'?navigator:null){return !!(nav&&nav.gpu&&typeof nav.gpu.requestAdapter==='function');}

/** A deterministic Float32 interleaved [f(x), f'(x)] Hermite table. */
export function buildActivationLut(def,intervals=GPU_GRID_INTERVALS){
 if(!Number.isInteger(intervals)||intervals<512||intervals>65536||intervals&(intervals-1))throw new Error('GPUの補間分割数が不正です。');
 const f=compileDefinition(def),[min,max]=def.domain,step=(max-min)/intervals,values=new Float32Array((intervals+1)*2);
 for(let i=0;i<=intervals;i++){
  const [v,d]=f(min+i*step);
  if(!Number.isFinite(v)||!Number.isFinite(d)||Math.abs(v)>1e6||Math.abs(d)>1e6)throw new Error('GPU補間に非有限値が含まれています。');
  values[2*i]=float32(v);values[2*i+1]=float32(d);
 }
 return {min,max,step,intervals,values};
}
export function interpolateActivationLut(lut,x){
 const {min,max,step,intervals,values}=lut;
 if(x<=min)return [values[0]+(x-min)*values[1],values[1]];
 if(x>=max)return [values[2*intervals]+(x-max)*values[2*intervals+1],values[2*intervals+1]];
 const scaled=(x-min)/step,index=Math.min(intervals-1,Math.floor(scaled)),t=scaled-index,off=2*index;
 const y0=values[off],d0=values[off+1],y1=values[off+2],d1=values[off+3];
 const c1=step*d0,c2=3*(y1-y0)-step*(2*d0+d1),c3=2*(y0-y1)+step*(d0+d1);
 return [y0+t*(c1+t*(c2+t*c3)),(c1+t*(2*c2+3*t*c3))/step];
}
export function checkActivationLut(def,lut){
 const exact=compileDefinition(def);let maxOutputError=0,maxDerivativeError=0;
 // Jittered points catch interpolation errors instead of validating only table knots.
 for(let i=0;i<=513;i++){
  const x=lut.min+(lut.max-lut.min)*(i+.29)/514;
  const [a,b]=interpolateActivationLut(lut,x),[e,d]=exact(x);
  maxOutputError=Math.max(maxOutputError,Math.abs(a-e));
  // Isolated nondifferentiable knots (e.g. ReLU at zero) have no unique derivative.
  if(Math.abs(a-e)<.03&&Math.abs(b-d)>.04&&Math.abs(d)>2)continue;
  maxDerivativeError=Math.max(maxDerivativeError,Math.abs(b-d));
 }
 // All comparisons are absolute, with magnitude-relative allowances for large activations.
 if(maxOutputError>.008||maxDerivativeError>.15)throw new Error(`WebGPU補間精度が基準外です（値 ${maxOutputError.toPrecision(3)} / 導関数 ${maxDerivativeError.toPrecision(3)}）。CPUへ切り替えてください。`);
 return {maxOutputError,maxDerivativeError,points:514,method:'C1 Hermite Float32 LUT; CPU reference'};
}

const fmtF=n=>{
 if(!Number.isFinite(n))throw new Error('WGSL定数が非有限です。');
 let s=Number(n).toPrecision(12).replace(/0+$/,'').replace(/\.$/,'');
 if(s.includes('e')){const [a,e]=s.split('e');s=(a.includes('.')?a:a+'.0')+'e'+Number(e);}
 else if(!s.includes('.'))s+='.0';
 return s;
};
/** Generates only bounded integer dimensions and internally calculated Float32 constants. */
export function webGpuShaders(input,h1,h2,out,batch,weightCount,lut=null){
 for(const v of [input,h1,h2,out,batch,weightCount])if(!Number.isInteger(v)||v<1||v>15000)throw new Error('WebGPU行列の次元が不正です。');
 const offs1=(input+1)*h1,offs2=offs1+(h1+1)*h2,expected=offs2+(h2+1)*out;
 if(expected!==weightCount)throw new Error('WebGPU重み行列のサイズが不一致です。');
 const min=lut?.min??-6,max=lut?.max??8,step=lut?.step??(max-min)/GPU_GRID_INTERVALS,n=lut?.intervals??GPU_GRID_INTERVALS;
 const constants=`const IN: u32 = ${input}u;\nconst H1: u32 = ${h1}u;\nconst H2: u32 = ${h2}u;\nconst OUT: u32 = ${out}u;\nconst BATCH: u32 = ${batch}u;\nconst W: u32 = ${weightCount}u;\nconst OFF1: u32 = ${offs1}u;\nconst OFF2: u32 = ${offs2}u;`;
 const activation=`
const LUT_COUNT: u32 = ${n+1}u;
const LUT_MIN: f32 = ${fmtF(min)};
const LUT_MAX: f32 = ${fmtF(max)};
const LUT_H: f32 = ${fmtF(step)};
@group(0) @binding(4) var<storage,read> lookup: array<vec2<f32>>;
fn activation(x:f32)->vec2<f32> {
 if (x <= LUT_MIN) { let q=lookup[0u]; return vec2<f32>(q.x+(x-LUT_MIN)*q.y,q.y); }
 if (x >= LUT_MAX) { let q=lookup[LUT_COUNT-1u]; return vec2<f32>(q.x+(x-LUT_MAX)*q.y,q.y); }
 let u=(x-LUT_MIN)/LUT_H;
 let i=min(u32(floor(u)),LUT_COUNT-2u);
 let t=clamp(u-f32(i),0.0,1.0);
 let a=lookup[i]; let b=lookup[i+1u];
 let c1=LUT_H*a.y;
 let c2=3.0*(b.x-a.x)-LUT_H*(2.0*a.y+b.y);
 let c3=2.0*(a.x-b.x)+LUT_H*(a.y+b.y);
 return vec2<f32>(a.x+t*(c1+t*(c2+t*c3)),(c1+t*(2.0*c2+3.0*t*c3))/LUT_H);
}`;
 const gradient=`${constants}
@group(0) @binding(0) var<storage,read> weights: array<f32>;
@group(0) @binding(1) var<storage,read> trainingBatch: array<f32>;
@group(0) @binding(2) var<storage,read_write> sampleGrad: array<f32>;
@group(0) @binding(3) var<storage,read_write> sampleLoss: array<f32>;
${activation}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) tid:vec3<u32>) {
 let sample=tid.x;
 if(sample>=BATCH){return;}
 let base=sample*(IN+1u);
 let gradBase=sample*W;
 var x:array<f32,${input}>;
 var a1:array<f32,${h1}>;
 var d1:array<f32,${h1}>;
 var a2:array<f32,${h2}>;
 var d2:array<f32,${h2}>;
 var logits:array<f32,${out}>;
 var deltaOut:array<f32,${out}>;
 for(var i:u32=0u;i<IN;i=i+1u){x[i]=trainingBatch[base+i];}
 for(var o:u32=0u;o<H1;o=o+1u){
   let off=o*(IN+1u);
   var z=weights[off+IN];
   for(var i:u32=0u;i<IN;i=i+1u){z+=weights[off+i]*x[i];}
   let a=activation(z); a1[o]=a.x; d1[o]=a.y;
 }
 for(var o:u32=0u;o<H2;o=o+1u){
   let off=OFF1+o*(H1+1u);
   var z=weights[off+H1];
   for(var i:u32=0u;i<H1;i=i+1u){z+=weights[off+i]*a1[i];}
   let a=activation(z); a2[o]=a.x; d2[o]=a.y;
 }
 var largest=-3.402823466e+38;
 for(var o:u32=0u;o<OUT;o=o+1u){
   let off=OFF2+o*(H2+1u);
   var z=weights[off+H2];
   for(var i:u32=0u;i<H2;i=i+1u){z+=weights[off+i]*a2[i];}
   logits[o]=z; largest=max(largest,z);
 }
 if(OUT==1u){
   let diff=logits[0]-trainingBatch[base+IN];
   sampleLoss[sample]=diff*diff;
   deltaOut[0]=2.0*diff;
 }else{
   var denom=0.0;
   for(var i:u32=0u;i<OUT;i=i+1u){denom+=exp(logits[i]-largest);}
   let label=u32(trainingBatch[base+IN]);
   sampleLoss[sample]=largest+log(denom)-logits[label];
   for(var i:u32=0u;i<OUT;i=i+1u){
     deltaOut[i]=exp(logits[i]-largest)/denom;
     if(i==label){deltaOut[i]-=1.0;}
   }
 }
 for(var o:u32=0u;o<H2;o=o+1u){
   var s=0.0;
   for(var k:u32=0u;k<OUT;k=k+1u){s+=weights[OFF2+k*(H2+1u)+o]*deltaOut[k];}
   d2[o]*=s;
 }
 for(var o:u32=0u;o<H1;o=o+1u){
   var s=0.0;
   for(var k:u32=0u;k<H2;k=k+1u){s+=weights[OFF1+k*(H1+1u)+o]*d2[k];}
   d1[o]*=s;
 }
 for(var o:u32=0u;o<H1;o=o+1u){
   let off=o*(IN+1u);
   for(var i:u32=0u;i<IN;i=i+1u){sampleGrad[gradBase+off+i]=d1[o]*x[i];}
   sampleGrad[gradBase+off+IN]=d1[o];
 }
 for(var o:u32=0u;o<H2;o=o+1u){
   let off=OFF1+o*(H1+1u);
   for(var i:u32=0u;i<H1;i=i+1u){sampleGrad[gradBase+off+i]=d2[o]*a1[i];}
   sampleGrad[gradBase+off+H1]=d2[o];
 }
 for(var o:u32=0u;o<OUT;o=o+1u){
   let off=OFF2+o*(H2+1u);
   for(var i:u32=0u;i<H2;i=i+1u){sampleGrad[gradBase+off+i]=deltaOut[o]*a2[i];}
   sampleGrad[gradBase+off+H2]=deltaOut[o];
 }
}`;
 const reduce=`${constants}
@group(0) @binding(0) var<storage,read> sampleGrad: array<f32>;
@group(0) @binding(1) var<storage,read_write> meanGrad: array<f32>;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) tid:vec3<u32>){
 let index=tid.x;if(index>=W){return;}
 var value=0.0;
 for(var i:u32=0u;i<BATCH;i=i+1u){value+=sampleGrad[i*W+index];}
 meanGrad[index]=value/f32(BATCH);
}`;
 const clip=`${constants}
@group(0) @binding(0) var<storage,read> meanGrad: array<f32>;
@group(0) @binding(1) var<storage,read_write> factor: array<f32>;
@group(0) @binding(2) var<storage,read_write> normStats: array<f32>;
@group(0) @binding(3) var<uniform> settings: vec4<f32>;
@compute @workgroup_size(1)
fn main(){
 var sum=0.0;
 for(var i:u32=0u;i<W;i=i+1u){sum+=meanGrad[i]*meanGrad[i];}
 let norm=sqrt(sum);
 factor[0]=select(5.0/max(norm,1e-30),1.0,norm<=5.0);
 let idx=(u32(settings.x)-1u)*2u;
 normStats[idx]=norm;
 normStats[idx+1u]=select(1.0,0.0,norm<=5.0);
}`;
 const adam=`${constants}
@group(0) @binding(0) var<storage,read_write> weights: array<f32>;
@group(0) @binding(1) var<storage,read> meanGrad: array<f32>;
@group(0) @binding(2) var<storage,read_write> moment1: array<f32>;
@group(0) @binding(3) var<storage,read_write> moment2: array<f32>;
@group(0) @binding(4) var<storage,read> factor: array<f32>;
@group(0) @binding(5) var<uniform> settings: vec4<f32>;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) tid:vec3<u32>){
 let index=tid.x;if(index>=W){return;}
 let g=meanGrad[index]*factor[0];
 let m=0.9*moment1[index]+0.1*g;
 let v=0.999*moment2[index]+0.001*g*g;
 moment1[index]=m;moment2[index]=v;
 let mhat=m/(1.0-pow(0.9,settings.x));
 let vhat=v/(1.0-pow(0.999,settings.x));
 weights[index]=weights[index]-settings.y*mhat/(sqrt(vhat)+1e-8);
}`;
 return {gradient,reduce,clip,adam};
}

async function bufferRead(device,src,size){
 const buffer=device.createBuffer({size:Math.ceil(size/4)*4,usage:U.MAP_READ|U.COPY_DST});
 try{
  const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(src,0,buffer,0,size);device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(MAP_READ);
  return new Float32Array(buffer.getMappedRange().slice(0,size));
 }finally{try{buffer.unmap();}catch{}buffer.destroy();}
}
async function compilePipeline(device,code,name){
 device.pushErrorScope('validation');let error=null,pipeline;
 try{
  const module=device.createShaderModule({label:'NeuroCurve '+name,code});
  if(typeof module.getCompilationInfo==='function'){
   const info=await module.getCompilationInfo();
   const issues=info.messages.filter(m=>m.type==='error');
   if(issues.length)throw new Error(`${name}: ${issues.map(m=>m.message).slice(0,3).join(' / ')}`);
  }
  pipeline=await device.createComputePipelineAsync({label:'NeuroCurve '+name,layout:'auto',compute:{module,entryPoint:'main'}});
 }catch(e){error=e;}finally{const validationError=await device.popErrorScope();if(validationError&&!error)error=validationError;}
 if(error)throw new Error('WebGPUコンピュートのコンパイル失敗: '+String(error.message??error));
 return pipeline;
}

/** Live compute+readback test; a GPU label is never inferred from API presence alone. */
export async function probeWebGPU(runtime=globalThis){
 const nav=runtime?.navigator??null;
 if(!isWebGpuAvailable(nav))return {available:false,reason:'この環境ではWebGPUを使用できません。'};
 let device;
 try{
  const adapter=await nav.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)return {available:false,reason:'WebGPUアダプターが見つかりません。'};
  if(adapter.isFallbackAdapter)throw new Error('GPUアダプターはソフトウェア互換モードです。');
  const adapterName=String(adapter.info?.description??'').toLowerCase();
  if(/swiftshader|llvmpipe|software renderer/.test(adapterName))throw new Error('ソフトウェアGPUが検出されました。');
  device=await adapter.requestDevice();
  const module=`@group(0) @binding(0) var<storage,read_write> output: array<f32>; @compute @workgroup_size(1) fn main(){output[0]=21.0*2.0;}`;
  const pipeline=await compilePipeline(device,module,'GPU probe');
  const out=device.createBuffer({size:4,usage:U.STORAGE|U.COPY_SRC});
  try{const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:out}}]});const cmd=device.createCommandEncoder();const pass=cmd.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();device.queue.submit([cmd.finish()]);const result=await bufferRead(device,out,4);if(result[0]!==42)throw new Error('GPU演算の検算に失敗しました。');}
  finally{out.destroy();}
  return {available:true,device,backend:'webgpu',dtype:'float32',verified:true};
 }catch(e){try{device?.destroy();}catch{}return {available:false,reason:'WebGPU試験失敗: '+String(e.message??e)};}
}

function gpuBuffer(device,array,extraUsage=0){
 const buffer=device.createBuffer({size:Math.max(4,array.byteLength),usage:U.STORAGE|U.COPY_DST|U.COPY_SRC|extraUsage});
 if(array.byteLength)device.queue.writeBuffer(buffer,0,array);
 return buffer;
}
function makeGroups(device,pipelines,b){
 const objects={
 gradient:[b.weights,b.batch,b.sampleGrad,b.sampleLoss,b.lut],
 reduce:[b.sampleGrad,b.meanGrad],
 clip:[b.meanGrad,b.factor,b.stats,b.settings],
 adam:[b.weights,b.meanGrad,b.m,b.v,b.factor,b.settings],
 };
 return Object.fromEntries(Object.entries(objects).map(([name,arr])=>[name,device.createBindGroup({layout:pipelines[name].getBindGroupLayout(0),entries:arr.map((buffer,binding)=>({binding,resource:{buffer}}))})]));
}
const nextTick=()=>new Promise(r=>setTimeout(r,0));

/** Rejects a compute backend that produces incorrect forward/backward gradients on a real batch. */
export function checkGpuGradients(cpuLoss,cpuGrad,gpuLoss,gpuGrad){
 if(!Number.isFinite(cpuLoss)||!Number.isFinite(gpuLoss))throw new Error('GPU計算で非有限な損失を検出しました。');
 if(cpuGrad.length!==gpuGrad.length)throw new Error('GPU勾配ベクトルの長さが違います。');
 let err2=0,norm2=0,maxError=0;
 for(let i=0;i<cpuGrad.length;i++){
  const a=cpuGrad[i],b=gpuGrad[i];if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('GPU勾配に非有限な値があります。');
  const d=a-b;err2+=d*d;norm2+=a*a;maxError=Math.max(maxError,Math.abs(d));
 }
 const rel=Math.sqrt(err2)/Math.max(.001,Math.sqrt(norm2)),abs=Math.sqrt(err2),lossRel=Math.abs(cpuLoss-gpuLoss)/Math.max(.001,Math.abs(cpuLoss));
 if((rel>.05&&abs>.002)||lossRel>.02)throw new Error(`GPU逆伝播の検算に失敗しました（相対勾配誤差 ${rel.toPrecision(3)}、損失誤差 ${lossRel.toPrecision(3)}）。CPUを選択してください。`);
 return {passed:true,relativeError:rel,maxAbsoluteError:maxError,lossRelativeError:lossRel,samples:cpuGrad.length};
}

/** GPU steps are all executed in compute passes, not JS training masked as WebGPU. */
export async function trainOneGpu(def,data,options={},onProgress=()=>{},cancelled=()=>false,device){
 if(!device)throw new Error('WebGPUデバイスがありません。');
 const steps=options.steps??150,batch=options.batch??64,hidden=options.hidden??[32,32],seed=options.seed??17,lr=options.learningRate??.001;
 if(!Number.isInteger(steps)||steps<1||steps>600||!Number.isInteger(batch)||batch<1||batch>128||hidden.length!==2||hidden.some(n=>!Number.isInteger(n)||n<2||n>64))throw new Error('GPU学習のパラメータ上限を超えています。');
 const initial=performance.now(),lut=buildActivationLut(def),lutCheck=checkActivationLut(def,lut),network=new Network([data.inputs,...hidden,data.outputs],compileDefinition(def),seed);
 const weightCount=network.layers.reduce((a,l)=>a+l.w.length,0),weights=new Float32Array(weightCount);let pos=0;
 for(const l of network.layers){weights.set(l.w,pos);pos+=l.w.length;l.w.set(weights.subarray(pos-l.w.length,pos));}
 const initialTrainLoss=network.loss(data.train.slice(0,256),data.task);
 const shaders=webGpuShaders(data.inputs,hidden[0],hidden[1],data.outputs,batch,weightCount,lut);
 const sampleGradBytes=batch*weightCount*4;
 if(device.limits&&sampleGradBytes>device.limits.maxStorageBufferBindingSize)throw new Error('GPUバッファーの上限を超えています。');
 const buffers=[];
 const create=(name,array,extra=0)=>{const b=gpuBuffer(device,array,extra);buffers.push(b);return b;};
 const b={weights:create('weights',weights),m:create('m',new Float32Array(weightCount)),v:create('v',new Float32Array(weightCount)),batch:create('batch',new Float32Array(batch*(data.inputs+1))),sampleGrad:create('sampleGrad',new Float32Array(batch*weightCount)),sampleLoss:create('sampleLoss',new Float32Array(batch)),meanGrad:create('meanGrad',new Float32Array(weightCount)),factor:create('factor',new Float32Array(1)),stats:create('stats',new Float32Array(2*steps)),settings:create('settings',new Float32Array(4),U.UNIFORM),lut:create('lut',lut.values)};
 try{
  const pipelines={};for(const [name,source]of Object.entries(shaders))pipelines[name]=await compilePipeline(device,source,name);
  const groups=makeGroups(device,pipelines,b),setupMs=performance.now()-initial,random=rng(seed+10000),history=[];
  const trainStarted=performance.now();let gradientAudit=null;
  for(let step=1;step<=steps;step++){
   if(cancelled())throw new Error('GPU学習を中断しました。');
   if(performance.now()-trainStarted>(options.maxMs??120000))throw new Error('GPU学習時間が上限に達しました。');
   const rows=Array.from({length:batch},()=>data.train[Math.floor(random()*data.train.length)]),packed=new Float32Array(batch*(data.inputs+1));
   for(let j=0;j<batch;j++){const off=j*(data.inputs+1);for(let i=0;i<data.inputs;i++)packed[off+i]=rows[j].x[i];packed[off+data.inputs]=rows[j].y;}
   device.queue.writeBuffer(b.batch,0,packed);device.queue.writeBuffer(b.settings,0,new Float32Array([step,lr,0,0]));
   const encoder=device.createCommandEncoder();
   for(const name of ['gradient','reduce','clip','adam']){const pass=encoder.beginComputePass();pass.setPipeline(pipelines[name]);pass.setBindGroup(0,groups[name]);pass.dispatchWorkgroups(name==='gradient'?Math.ceil(batch/64):name==='clip'?1:Math.ceil(weightCount/128));pass.end();}
   device.queue.submit([encoder.finish()]);
   if(step===1||step%25===0||step===steps){
    const losses=await bufferRead(device,b.sampleLoss,batch*4),loss=losses.reduce((a,c)=>a+c,0)/batch;
    if(step===1){const actual=await bufferRead(device,b.meanGrad,weightCount*4);const cpuLoss=network.lossAndGrad(rows,data.task);
      const expected=network.layers.flatMap(layer=>Array.from(layer.g));
      gradientAudit=checkGpuGradients(cpuLoss,expected,loss,actual);}
    if(!Number.isFinite(loss))throw new Error('GPU演算で非有限な損失が発生しました。');
    history.push({step,loss});onProgress({step,steps,loss});await nextTick();
   }
  }
  const elapsedMs=performance.now()-trainStarted;
  const trained=await bufferRead(device,b.weights,weightCount*4);
  const stats=await bufferRead(device,b.stats,2*steps*4);
  for(const v of trained)if(!Number.isFinite(v))throw new Error('GPU重みが非有限になりました。');
  let count=0;for(const layer of network.layers){layer.w.set(trained.subarray(count,count+layer.w.length));count+=layer.w.length;}
  const train=network.evaluate(data.train,data.task),validation=network.evaluate(data.validation,data.task),test=network.evaluate(data.test,data.task);
  const ws=wells(def),coverage=ws.map(w=>({...w,count:0}));let total=0,negative=0,flat=0,outside=0;
  for(const row of data.validation.slice(0,128)){network.forward(row.x);for(let l=0;l<network.z.length-1;l++)for(let i=0;i<network.z[l].length;i++){
   const z=network.z[l][i],d=network.der[l][i];total++;if(d<0)negative++;if(Math.abs(d)<.01)flat++;if(z<def.domain[0]||z>def.domain[1])outside++;for(const w of coverage)if(z>=w.center-w.left&&z<=w.center+w.right)w.count++;
  }}
  let maxGradientNorm=0,clippedSteps=0;for(let i=0;i<steps;i++){const norm=stats[2*i];if(!Number.isFinite(norm))throw new Error('GPU勾配の検査に失敗しました。');maxGradientNorm=Math.max(maxGradientNorm,norm);if(stats[2*i+1]>=.5)clippedSteps++;}
  return {seed,backend:'webgpu-compute',dtype:'float32',engine:ENGINE,initialTrainLoss,finalTrainLoss:train.loss,train,validation,test,elapsedMs,gpuSetupMs:setupMs,history,metricName:data.task==='classification'?'Accuracy':'RMSE',maxGradientNorm,clippedSteps,gradientClip:5,activationDiagnostics:{samples:total,negativeFraction:negative/total,flatFraction:flat/total,outsideFraction:outside/total,coverage:coverage.map(w=>({center:w.center,fraction:w.count/total}))},activationLut:{intervals:lut.intervals,domain:[lut.min,lut.max],...lutCheck},gradientAudit,config:{steps,batch,hidden,learningRate:lr,optimizer:'Adam GPU',betas:[.9,.999],epsilon:1e-8,initializer:'Glorot normal; Float32 copies of the same initial weights as CPU',evaluation:'CPU Float64 metrics from GPU Float32-trained weights'},failed:false};
 }finally{for(const buf of buffers){try{buf.destroy();}catch{}}}
}

/** Verify every benchmark activation against the same GPU runtime before selecting GPU. */
export async function preflightGpuTraining(device,definitions,dimensions=[2,32,32,2],batch=64){
 const [input,h1,h2,out]=dimensions;
 const count=(input+1)*h1+(h1+1)*h2+(h2+1)*out;
 if(device.limits && batch*count*4 > device.limits.maxStorageBufferBindingSize)throw new Error('GPUのストレージバッファー容量が不足しています。');
 let maxError=0;
 for(const def of definitions){
  const lut=buildActivationLut(def),test=checkActivationLut(def,lut);
  maxError=Math.max(maxError,test.maxDerivativeError);
  const shaders=webGpuShaders(input,h1,h2,out,batch,count,lut);
  for(const [name,source]of Object.entries(shaders))await compilePipeline(device,source,name);
 }
 return {passed:true,backend:'webgpu-compute',dtype:'float32',checked:definitions.length,maximumLutDerivativeError:maxError};
}
