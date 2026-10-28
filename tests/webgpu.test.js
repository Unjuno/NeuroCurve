import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDefinition,compileDefinition,ENGINE} from '../public/core/activation.js';
import {buildActivationLut, interpolateActivationLut, webGpuShaders, probeWebGPU, isWebGpuAvailable,checkGpuGradients} from '../public/core/webgpu.js';
import {runBenchmark,trainOne} from '../public/core/training.js';
import {readFileSync} from 'node:fs';

const preset = name => ({schema:1,engine:ENGINE,kind:'preset',name,domain:[-6,8]});

test('GPU lookup preserves value and derivative of custom and reference activations',()=>{
  const defs=[defaultDefinition(),preset('swish'),preset('gelu'),preset('relu'),{schema:1,engine:ENGINE,kind:'expression',expression:'x*sigmoid(x)+0.1*sin(3*x)',domain:[-5,5]},{schema:1,engine:ENGINE,kind:'sketch',domain:[-2,2],points:[[-2,-1],[-1,-.2],[0,0],[1,.5],[2,2]]}];
  for(const def of defs){const lut=buildActivationLut(def),fn=compileDefinition(def);assert.equal(lut.values.length, (lut.intervals+1)*2);assert.ok(lut.values.every(Number.isFinite));let maxY=0,maxD=0;
    for(let i=0;i<601;i++){const x=def.domain[0]+(def.domain[1]-def.domain[0])*(i+.285)/601;const [v,d]=interpolateActivationLut(lut,x),[exact,der]=fn(x);maxY=Math.max(maxY,Math.abs(v-exact));if(Math.abs(x)<1e-4&&def.name==='relu')continue;maxD=Math.max(maxD,Math.abs(d-der));}
    assert.ok(maxY<0.003,`${def.kind}: value mismatch ${maxY}`);assert.ok(maxD<0.12,`${def.kind}: derivative mismatch ${maxD}`);
    for(const x of [def.domain[0]-5,def.domain[1]+5]){const [v,d]=interpolateActivationLut(lut,x),[expected,ed]=fn(x);assert.ok(Math.abs(v-expected)<.001);assert.ok(Math.abs(d-ed)<.001);}
  }
});

test('GPU shader generation uses fixed bounded dimensions and GPU reduction / Adam stages',()=>{
 const shaders=webGpuShaders(2,32,32,2,64,1218);
 for(const name of ['gradient','reduce','clip','adam']){assert.ok(shaders[name].includes('@compute'),name);assert.ok(shaders[name].includes('@workgroup_size'),name);}
 assert.match(shaders.gradient,/sampleGrad/);
 assert.match(shaders.reduce,/meanGrad/);
 assert.match(shaders.clip,/normStats/);
 assert.match(shaders.adam,/weights\[index\]/);
});

test('WebGPU absence is detected, and no fake GPU backend is reported',async()=>{
 assert.equal(isWebGpuAvailable(null),false);
 const res=await probeWebGPU({navigator:{}});
 assert.equal(res.available,false);
 assert.match(res.reason,/WebGPU/);
});


test('benchmark passes all four activations to an injected GPU runner and reports the actual backend',async()=>{
 const names=[];const runner=async(def,data,options,onProgress,cancelled,device)=>{names.push({name:def.name??def.kind,device});const result=await trainOne(def,data,{...options,steps:2},onProgress,cancelled);return {...result,backend:'test-gpu',dtype:'float32'};};
 const dummyDevice={valid:true};
 const result=await runBenchmark(defaultDefinition(),'moons','quick',()=>{},()=>false,null,runner,dummyDevice);
 assert.equal(names.length,4);assert.ok(names.every(n=>n.device===dummyDevice));assert.ok(result.runs.every(r=>r.backend==='test-gpu'));
});
test('web UI exposes backend auto, WebGPU-required and CPU modes',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="compute-backend"/);assert.match(html,/value="auto"/);assert.match(html,/value="webgpu"/);assert.match(html,/value="cpu"/);
 const src=readFileSync(new URL('../public/worker.js',import.meta.url),'utf8');
 assert.match(src,/probeWebGPU/);assert.match(src,/trainOneGpu/);
});

test('GPU gradient audit rejects a wrong kernel and accepts finite Float32-scale differences',()=>{
 const check=checkGpuGradients(.5,[1,-2,3,.02],.5000002,new Float32Array([1.00001,-2.00001,3.00002,.01999]));
 assert.equal(check.passed,true);
 assert.ok(check.relativeError<.01);
 assert.throws(()=>checkGpuGradients(.5,[1,-2,3],.5,new Float32Array([-1,2,-3])),/勾配/);
 assert.throws(()=>checkGpuGradients(.5,[1],Number.NaN,new Float32Array([1])),/非有限/);
});

test('GPU smoke page follows strict site Content Security Policy',()=>{
 const html=readFileSync(new URL('../public/gpu-check.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/i);
 assert.match(html,/gpu-check\.js/);
});
