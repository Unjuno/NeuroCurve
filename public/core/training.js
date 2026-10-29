import {SUITES,scoreSuite} from './suite.js';
import {rng,normal,makeDataset,loadDataset} from './data.js';
import {compileDefinition,analyze,wells,ENGINE,selfTest} from './activation.js';
/** Minimal audited MLP. Float64 arrays, analytic activation derivatives, Adam. */
export class Network{
  constructor(dims,activation,seed){
    this.activation=activation;this.dims=dims;const random=rng(seed);this.layers=dims.slice(1).map((out,l)=>{const input=dims[l],length=out*(input+1),w=new Float64Array(length);for(let o=0;o<out;o++)for(let i=0;i<input;i++)w[o*(input+1)+i]=normal(random)*Math.sqrt(2/(input+out));return {input,out,w,g:new Float64Array(length),m:new Float64Array(length),v:new Float64Array(length)};});
    this.a=dims.map(n=>new Float64Array(n));this.z=dims.slice(1).map(n=>new Float64Array(n));this.der=dims.slice(1).map(n=>new Float64Array(n));this.delta=dims.slice(1).map(n=>new Float64Array(n));
  }
  forward(x){
    this.a[0].set(x);
    for(let l=0;l<this.layers.length;l++){const layer=this.layers[l],{input,out,w}=layer,prev=this.a[l],next=this.a[l+1];for(let o=0;o<out;o++){const offset=o*(input+1);let z=w[offset+input];for(let i=0;i<input;i++)z+=w[offset+i]*prev[i];this.z[l][o]=z;if(l===this.layers.length-1){next[o]=z;this.der[l][o]=1;}else{const [v,d]=this.activation(z);if(!Number.isFinite(v)||!Number.isFinite(d)||Math.abs(v)>1e6||Math.abs(d)>1e6)throw new Error('数値安全上限を超えたため学習を停止しました。');next[o]=v;this.der[l][o]=d;}}}
    return this.a.at(-1);
  }
  sampleLoss(row,task,backward=false){
    const out=this.forward(row.x),last=this.layers.length-1,delta=this.delta[last];let loss=0;
    if(task==='regression'){const diff=out[0]-row.y;loss=diff*diff;delta[0]=2*diff;}
    else{const max=Math.max(...out);let sum=0;for(let j=0;j<out.length;j++)sum+=Math.exp(out[j]-max);loss=max+Math.log(sum)-out[row.y];for(let j=0;j<out.length;j++)delta[j]=Math.exp(out[j]-max)/sum-(j===row.y?1:0);}
    if(!Number.isFinite(loss))throw new Error('損失が非有限になりました。');
    if(backward){
      for(let l=last;l>=0;l--){const {input,out:dim,w,g}=this.layers[l],a=this.a[l],d=this.delta[l];for(let o=0;o<dim;o++){const off=o*(input+1);for(let i=0;i<input;i++)g[off+i]+=d[o]*a[i];g[off+input]+=d[o];}
        if(l>0){for(let i=0;i<input;i++){let s=0;for(let o=0;o<dim;o++)s+=w[o*(input+1)+i]*d[o];this.delta[l-1][i]=s*this.der[l-1][i];}}
      }
    }return loss;
  }
  loss(rows,task){return rows.reduce((s,r)=>s+this.sampleLoss(r,task),0)/rows.length;}
  lossAndGrad(rows,task){for(const l of this.layers)l.g.fill(0);let loss=0;for(const row of rows)loss+=this.sampleLoss(row,task,true);for(const l of this.layers)for(let i=0;i<l.g.length;i++)l.g[i]/=rows.length;return loss/rows.length;}
  update(step,lr,clip=5){
    let norm2=0;for(const l of this.layers)for(const v of l.g)norm2+=v*v;const norm=Math.sqrt(norm2);if(!Number.isFinite(norm))throw new Error('勾配が非有限になりました。');const factor=norm>clip?clip/norm:1,b1=1-.9**step,b2=1-.999**step;
    for(const l of this.layers)for(let i=0;i<l.w.length;i++){const g=l.g[i]*factor;l.m[i]=.9*l.m[i]+.1*g;l.v[i]=.999*l.v[i]+.001*g*g;l.w[i]-=lr*(l.m[i]/b1)/(Math.sqrt(l.v[i]/b2)+1e-8);}
    return norm;
  }
  evaluate(rows,task){let loss=0,correct=0;for(const r of rows){loss+=this.sampleLoss(r,task);if(task==='classification'){const out=this.a.at(-1);let j=0;for(let k=1;k<out.length;k++)if(out[k]>out[j])j=k;if(j===r.y)correct++;}}loss/=rows.length;return {loss,metric:task==='classification'?correct/rows.length:Math.sqrt(loss),count:rows.length};}
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function trainOne(def,data,options={},onProgress=()=>{},cancelled=()=>false){
  const steps=options.steps??150,batch=options.batch??64,hidden=options.hidden??[32,32],seed=options.seed??17,lr=options.learningRate??.001;
  if(!Number.isInteger(steps)||steps<1||steps>600||!Number.isInteger(batch)||batch<1||batch>128||hidden.length!==2||hidden.some(n=>!Number.isInteger(n)||n<2||n>64))throw new Error('学習予算の上限を超えています。');
  const f=compileDefinition(def),network=new Network([data.inputs,...hidden,data.outputs],f,seed),random=rng(seed+10000),initialTrainLoss=network.loss(data.train.slice(0,256),data.task),start=performance.now(),history=[];let maxGradientNorm=0,clippedSteps=0;
  for(let t=1;t<=steps;t++){
    if(cancelled())throw new Error('学習を中断しました。');
    if(performance.now()-start>(options.maxMs??120000))throw new Error('この端末での実行時間上限に達しました。');
    const rows=Array.from({length:batch},()=>data.train[Math.floor(random()*data.train.length)]);const loss=network.lossAndGrad(rows,data.task),norm=network.update(t,lr,5);maxGradientNorm=Math.max(maxGradientNorm,norm);if(norm>5)clippedSteps++;
    if(t===1||t%25===0||t===steps){history.push({step:t,loss});onProgress({step:t,steps,loss});}
    if(t%10===0)await nextTick();
  }
  const elapsedMs=performance.now()-start,train=network.evaluate(data.train,data.task),validation=network.evaluate(data.validation,data.task),test=network.evaluate(data.test,data.task);
  const ws=wells(def),coverage=ws.map(w=>({...w,count:0}));let total=0,negative=0,flat=0,outside=0;
  for(const row of data.validation.slice(0,128)){network.forward(row.x);for(let l=0;l<network.z.length-1;l++)for(let i=0;i<network.z[l].length;i++){const z=network.z[l][i],d=network.der[l][i];total++;if(d<0)negative++;if(Math.abs(d)<.01)flat++;if(z<def.domain[0]||z>def.domain[1])outside++;for(const w of coverage)if(z>=w.center-w.left&&z<=w.center+w.right)w.count++;}}
  return {seed,backend:'native-js-cpu',dtype:'float64',engine:ENGINE,initialTrainLoss,finalTrainLoss:train.loss,train,validation,test,elapsedMs,history,metricName:data.task==='classification'?'Accuracy':'RMSE',maxGradientNorm,clippedSteps,gradientClip:5,activationDiagnostics:{samples:total,negativeFraction:negative/total,flatFraction:flat/total,outsideFraction:outside/total,coverage:coverage.map(w=>({center:w.center,fraction:w.count/total}))},config:{steps,batch,hidden,learningRate:lr,optimizer:'Adam',betas:[.9,.999],epsilon:1e-8,initializer:'Glorot normal, identical random sequence'},failed:false};
}
export const MODES={quick:{steps:150,seeds:[17]},full:{steps:600,seeds:[17,29,43,71,101]}};
export async function runBenchmark(def,dataset,mode='quick',onEvent=()=>{},cancelled=()=>false,digitRows=null,gpuRunner=null,gpuDevice=null){
  const a=analyze(def);if(!a.safe)throw new Error('数値診断を通過していません。関数を修正してください。');
  if(!Object.hasOwn(MODES,mode))throw new Error('評価モードが不正です。');
  const compatibility=selfTest(def);onEvent({type:'self-test',result:compatibility});
  const data=digitRows?makeDataset(dataset,digitRows):await loadDataset(dataset),settings=MODES[mode],entries=[['Custom',def],...['relu','swish','gelu'].map(name=>[name==='relu'?'ReLU':name==='swish'?'Swish':'GELU',{schema:1,engine:ENGINE,kind:'preset',name,domain:[-100,100]}])],runs=[];let index=0;
  for(let si=0;si<settings.seeds.length;si++){
    const order=[...entries.slice(si%4),...entries.slice(0,si%4)];
    for(const [name,d]of order){if(cancelled())throw new Error('学習を中断しました。');onEvent({type:'run-start',name,seed:settings.seeds[si],index,total:4*settings.seeds.length});
      try{const runner=gpuRunner??trainOne;const result=await runner(d,data,{...settings,seed:settings.seeds[si]},p=>onEvent({type:'progress',name,seed:settings.seeds[si],index,total:4*settings.seeds.length,...p}),cancelled,gpuDevice);runs.push({name,...result});}
      catch(e){if(cancelled())throw e;runs.push({name,seed:settings.seeds[si],failed:true,error:e.message});}
      onEvent({type:'run-end',run:runs.at(-1),index,total:4*settings.seeds.length});index++;
    }
  }
  return {version:1,compatibility,createdAt:new Date().toISOString(),definition:def,dataset:data.name,datasetVersion:data.version,mode,split:{train:data.train.length,validation:data.validation.length,test:data.test.length,seed:data.splitSeed},preprocessing:data.preprocessing,settings:{...settings,hidden:[32,32],batch:64,optimizer:'Adam',learningRate:.001},runs,summary:summarize(runs,data.task==='regression'),note:'Fixed public splits; repeated inspection causes test-set adaptation. No claim of general superiority.'};
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
export function summarize(runs,lowerIsBetter){
  const names=[...new Set(runs.map(r=>r.name))],groups=names.map(name=>{const all=runs.filter(r=>r.name===name),a=all.filter(r=>!r.failed&&r.test&&Number.isFinite(r.test.metric)),values=a.map(r=>r.test.metric);return {name,n:a.length,failures:all.length-a.length,mean:a.length?mean(values):null,median:a.length?median(values):null,min:a.length?Math.min(...values):null,max:a.length?Math.max(...values):null,sd:a.length>1?Math.sqrt(values.reduce((s,v)=>s+(v-mean(values))**2,0)/(a.length-1)):null,elapsedMedianMs:a.length?median(a.map(r=>r.elapsedMs)):null};});
  const custom=runs.filter(r=>r.name==='Custom'&&!r.failed),comparisons=names.filter(n=>n!=='Custom').map(name=>{const pairs=custom.flatMap(c=>{const b=runs.find(r=>r.name===name&&r.seed===c.seed&&!r.failed);return b?[c.test.metric-b.test.metric]:[];}),n=pairs.length,m=n?mean(pairs):null,se=n>1?Math.sqrt(pairs.reduce((s,v)=>s+(v-m)**2,0)/(n-1)/n):null;return {baseline:name,pairs:n,meanDifference:m,standardError:se,descriptive95Interval:n===5?[m-2.776*se,m+2.776*se]:null,lowerIsBetter,verdict:'UNCERTAIN',reason:'固定分割・少数シード。一般的優位性は未検証。'};});
  return {groups,comparisons,lowerIsBetter};
}

/** Run an entire fixed suite on the visitor's own worker; task-level scores are transparent. */
export async function runSuite(def,suiteId='core',mode='quick',onEvent=()=>{},cancelled=()=>false,gpuRunner=null,gpuDevice=null){
  const suite=SUITES[suiteId];if(!suite)throw new Error('評価セットが不正です。');
  if(!Object.hasOwn(MODES,mode))throw new Error('評価モードが不正です。');
  const reports=[];
  for(const [taskIndex,dataset] of suite.tasks.entries()){
    if(cancelled())throw new Error('学習を中断しました。');
    onEvent({type:'suite-task-start',taskIndex,taskCount:suite.tasks.length,dataset});
    try{
      const report=await runBenchmark(def,dataset,mode,event=>onEvent({...event,taskIndex,taskCount:suite.tasks.length,dataset}),cancelled,null,gpuRunner,gpuDevice);
      reports.push(report);
      onEvent({type:'suite-task-end',taskIndex,taskCount:suite.tasks.length,dataset,report,score:scoreSuite(reports,suiteId)});
    }catch(error){
      if(cancelled())throw error;
      const failed={dataset,mode,datasetVersion:'unavailable',settings:MODES[mode],runs:[],error:String(error?.message??error)};
      reports.push(failed);
      onEvent({type:'suite-task-end',taskIndex,taskCount:suite.tasks.length,dataset,report:failed,score:scoreSuite(reports,suiteId)});
    }
  }
  return {version:2,kind:'suite',suiteId:suite.id,createdAt:new Date().toISOString(),definition:def,mode,settings:MODES[mode],reports,score:scoreSuite(reports,suiteId),note:'Fixed, local multi-task comparative evaluation; do not treat scores as verified ranking or proof of superiority.'};
}
