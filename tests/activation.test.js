import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDefinition, defaultDefinition, analyze, validateDefinition, pchip } from '../public/core/activation.js';
import { parseExpression, compileExpression } from '../public/core/expression.js';
const close=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t*(1+Math.abs(b)),`${a} != ${b}`);
const formulas=['x','x^2','x^3','-x^2','2*x+3','sin(x)','cos(x)','tanh(x)','sigmoid(x)','swish(x)','gelu(x)','softplus(x)','exp(x)','log(x+4)','sqrt(x+4)','abs(x)','relu(x)','sin(x)*cos(x)','tanh(2*x+1)','1/(1+exp(-x))','x*sigmoid(2*x)','sin(3*x+sin(x))','exp(-x^2)','x/(2+x^2)','softplus(sin(x))','(x+1)^4','sin(pi*x)','cos(e*x)','x^0','0*x','-sin(-x)','sigmoid(x)^2'];
for(const expression of formulas)test(`analytic derivative: ${expression}`,()=>{const f=compileExpression(parseExpression(expression));for(const x of [-1.7,-.6,.3,1.1,2.1]){let h=1e-5;close(f(x)[1],(f(x+h)[0]-f(x-h)[0])/(2*h));}});
test('operator precedence and power associativity',()=>{close(compileExpression(parseExpression('-2^2'))(0)[0],-4);close(compileExpression(parseExpression('2^3^2'))(0)[0],512);});
for(const s of ['alert(1)','x.constructor','globalThis','(()=>1)()','sin(x);fetch(1)','Math.sin(x)','[x]','x**x','x^x'])test(`reject unsafe/unsupported expression: ${s}`,()=>assert.throws(()=>parseExpression(s)));
test('node/depth budgets',()=>{assert.throws(()=>parseExpression(Array(100).fill('x').join('+')));assert.throws(()=>parseExpression('sin('.repeat(30)+'x'+')'.repeat(30)));});
test('PCHIP nodes, extrema and tangent continuation',()=>{const f=pchip([[-2,0],[-1,1],[0,-.5],[1,1],[2,2]]);for(const [x,y] of [[-2,0],[-1,1],[0,-.5],[1,1],[2,2]])close(f(x)[0],y);close(f(0)[1],0);close(f(3)[0],f(2)[0]+f(2)[1]);});
test('PCHIP monotone shape stays within each interval',()=>{const f=pchip([[0,0],[1,1],[2,1.2],[3,4]]);for(let x=0;x<=3;x+=.01)assert.ok(f(x)[1]>=-1e-10);});
test('reject duplicate x without silently changing sketch',()=>assert.throws(()=>pchip([[0,0],[0,1],[1,2]])));
test('default valleys match finite differences',()=>{const f=compileDefinition(defaultDefinition());for(let x=-5.8;x<5.8;x+=.071)close(f(x)[1],(f(x+1e-5)[0]-f(x-1e-5)[0])/2e-5);});
test('default has actual valleys; zero amplitude removes them',()=>{let d=defaultDefinition();assert.ok(analyze(d).minima.length>=4);d.params.depth=0;assert.equal(analyze(d).minima.length,0);});
test('version and finite parameter validation',()=>{assert.throws(()=>validateDefinition({...defaultDefinition(),engine:'unknown'}));let d=defaultDefinition();d.params.width=0;assert.throws(()=>validateDefinition(d));d=defaultDefinition();d.params.depth=NaN;assert.throws(()=>validateDefinition(d));});
test('serialization preserves values and derivatives',()=>{const d=defaultDefinition(),a=compileDefinition(d),b=compileDefinition(JSON.parse(JSON.stringify(d)));for(let x=-8;x<=8;x+=.1){assert.deepEqual(a(x),b(x));}});
test('non-finite equations cannot start training',()=>{const d={schema:1,engine:'neurocurve-1',kind:'expression',domain:[-6,6],expression:'1/x'};assert.equal(analyze(d).safe,false);});

test('asymmetric widths with inner ripples remain C1 at well centers',()=>{
  const d=defaultDefinition();d.params.skew=.7;d.params.ripple=.3;d.params.nested=.4;
  const f=compileDefinition(d),center=d.params.start,h=1e-8;
  assert.ok(Math.abs(f(center-h)[1]-f(center+h)[1])<1e-5,'left/right derivatives disagree at the asymmetric join');
});

test('sketch fitting reports point error, shape preservation and between-point difference',async()=>{
  const {inspectSketch}=await import('../public/core/activation.js');
  const d={schema:1,engine:'neurocurve-1',kind:'sketch',domain:[-3,3],points:[[-3,1],[-2,0],[-1,1],[0,-.5],[1,2],[2,.2],[3,2]]};
  const report=inspectSketch(d);
  assert.equal(report.sourceMinima,3);assert.equal(report.fittedMinima,3);
  assert.ok(report.controlMaxError<1e-12);assert.ok(report.polylineMaxDifference>0);
});
test('engine self-test checks differentiable evaluation before learning',async()=>{
  const {selfTest}=await import('../public/core/activation.js');
  assert.equal(selfTest(defaultDefinition()).passed,true);
  assert.throws(()=>selfTest({schema:1,engine:'neurocurve-1',kind:'expression',domain:[-1,1],expression:'1/x'}));
});
