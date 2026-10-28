import {writeFileSync,mkdirSync} from 'node:fs';
import {defaultDefinition,compileDefinition,PRESETS} from '../public/core/activation.js';
import {exportPython} from '../public/core/export.js';
const out=process.argv[2]??'/tmp/neurocurve-reference';mkdirSync(out,{recursive:true});
const base={schema:1,engine:'neurocurve-1',domain:[-6,8]};
const asymmetric=defaultDefinition();asymmetric.params.skew=.6;asymmetric.params.ripple=.2;asymmetric.params.nested=.5;asymmetric.params.shape=3;
const definitions=[defaultDefinition(),asymmetric,...Object.keys(PRESETS).map(name=>({...base,kind:'preset',name})),...['x*sigmoid(x)','sin(x)+0.1*x^2','log(x^2+1)','2','x^0','swish(x)+0.1*sin(3*x)'].map(expression=>({...base,kind:'expression',expression})),{...base,domain:[-4,5],kind:'sketch',points:[[-4,-.5],[-2,-1],[-.3,.8],[0,0],[.2,1],[1,.5],[2,2],[5,2.1]]}];
const fixtures=definitions.map((definition,index)=>{const f=compileDefinition(definition);const xs=Array.from({length:101},(_,i)=>-8+i*.17717);writeFileSync(`${out}/activation_${index}.py`,exportPython(definition));return {definition,xs,ys:xs.map(x=>f(x)),module:`activation_${index}.py`};});
writeFileSync(`${out}/fixtures.json`,JSON.stringify(fixtures));console.log(out);
