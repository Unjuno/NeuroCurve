import {parseExpression,compileExpression,sigmoid,unary} from './expression.js';
export const ENGINE='neurocurve-1';
export const PRESETS={relu:'ReLU',swish:'Swish / SiLU',gelu:'GELU (tanh近似)',sigmoid:'Sigmoid',tanh:'Tanh',softplus:'Softplus',sinlu:'SinLU',snake:'Snake'};
export const PARAMS={
  low:[-5,5],high:[-5,8],steepness:[.05,5],center:[-10,10],gamma:[.2,4],leak:[0,.3],
  count:[1,16],start:[-10,10],spacing:[.12,3],spacingGrowth:[1,1.5],
  depth:[0,2],depthGrowth:[1,1.8],depthPower:[0,2],width:[.04,1.5],widthGrowth:[.85,1.2],
  skew:[-.8,.8],shape:[2,6],ripple:[0,.4],frequency:[1,8],nested:[0,1]
};
export function defaultDefinition(){return {schema:1,engine:ENGINE,kind:'valleys',domain:[-6,8],params:{low:0,high:2.4,steepness:.65,center:0,gamma:1,leak:0,count:8,start:-3,spacing:.85,spacingGrowth:1.08,depth:.075,depthGrowth:1.3,depthPower:0,width:.19,widthGrowth:1.02,skew:0,shape:2,ripple:0,frequency:3,nested:0},adjustments:[]};}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function validateDefinition(d){
  if(!d||typeof d!=='object'||Array.isArray(d)||d.schema!==1||d.engine!==ENGINE)throw new Error('対応していない関数形式・エンジンバージョンです。');
  if(!Array.isArray(d.domain)||d.domain.length!==2||!d.domain.every(finite)||d.domain[0]>=d.domain[1]||d.domain[1]-d.domain[0]<.1||d.domain.some(x=>Math.abs(x)>100))throw new Error('入力範囲は−100〜100、幅0.1以上にしてください。');
  const clean={schema:1,engine:ENGINE,kind:d.kind,domain:[...d.domain]};
  if(d.kind==='preset'){if(!Object.hasOwn(PRESETS,d.name))throw new Error('不明な標準関数です。');clean.name=d.name;}
  else if(d.kind==='expression'){parseExpression(d.expression);clean.expression=d.expression;}
  else if(d.kind==='sketch'){
    if(!Array.isArray(d.points)||d.points.length<2||d.points.length>512)throw new Error('制御点は2〜512点にしてください。');
    clean.points=d.points.map((p,i)=>{if(!Array.isArray(p)||p.length!==2||!p.every(finite)||Math.abs(p[0])>100||Math.abs(p[1])>100||i&&p[0]-d.points[i-1][0]<1e-5)throw new Error('xは重複のない昇順、yは−100〜100にしてください。');return [...p];});
    if(clean.points[0][0]!==d.domain[0]||clean.points.at(-1)[0]!==d.domain[1])throw new Error('手描き範囲は最初と最後の制御点に一致させてください。');
  }else if(d.kind==='valleys'){
    clean.params={};for(const [k,[lo,hi]]of Object.entries(PARAMS)){const v=d.params?.[k];if(!finite(v)||v<lo||v>hi||(k==='count'&&!Number.isInteger(v)))throw new Error(`${k}は${lo}〜${hi}の範囲にしてください。`);clean.params[k]=v;}
    if(d.params.low>=d.params.high)throw new Error('上側の値は下側より大きくしてください。');
    if(d.adjustments!==undefined&&(!Array.isArray(d.adjustments)||d.adjustments.length>16))throw new Error('個別調整は最大16個です。');
    clean.adjustments=(d.adjustments??[]).map(a=>{const b={shift:a.shift??0,depth:a.depth??1,left:a.left??1,right:a.right??1};if(!Object.values(b).every(finite)||Math.abs(b.shift)>5||b.depth<0||b.depth>4||b.left<.25||b.left>4||b.right<.25||b.right>4)throw new Error('個別調整の範囲外です。');return b;});
  }else throw new Error('不明な関数種別です。');
  return clean;
}
/** Fritsch–Butland PCHIP, C1; linear tangent extension (not cubic extrapolation). */
export function pchip(points){
  if(points.length<2)throw new Error('2点以上必要です。');
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),n=xs.length,h=[],delta=[],m=new Array(n).fill(0);
  for(let i=0;i<n-1;i++){h[i]=xs[i+1]-xs[i];if(h[i]<=0)throw new Error('重複・逆順のxは補間できません。');delta[i]=(ys[i+1]-ys[i])/h[i];}
  const endpoint=(h0,h1,d0,d1)=>{let v=((2*h0+h1)*d0-h0*d1)/(h0+h1);if(Math.sign(v)!==Math.sign(d0))v=0;else if(Math.sign(d0)!==Math.sign(d1)&&Math.abs(v)>3*Math.abs(d0))v=3*d0;return v;};
  if(n===2)m[0]=m[1]=delta[0];else{
    m[0]=endpoint(h[0],h[1],delta[0],delta[1]);m[n-1]=endpoint(h[n-2],h[n-3],delta[n-2],delta[n-3]);
    for(let i=1;i<n-1;i++){if(delta[i-1]*delta[i]<=0)m[i]=0;else{const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/delta[i-1]+w2/delta[i]);}}
  }
  const coeff=h.map((v,i)=>[ys[i],m[i],(3*delta[i]-2*m[i]-m[i+1])/v,(m[i]+m[i+1]-2*delta[i])/(v*v)]);
  const f=x=>{
    if(x<xs[0])return [ys[0]+m[0]*(x-xs[0]),m[0]];
    if(x>xs[n-1])return [ys[n-1]+m[n-1]*(x-xs[n-1]),m[n-1]];
    let lo=0,hi=n-2;while(lo<hi){const mid=(lo+hi+1)>>1;if(xs[mid]<=x)lo=mid;else hi=mid-1;}
    const [a,b,c,d]=coeff[lo],t=x-xs[lo];return [a+t*(b+t*(c+t*d)),b+t*(2*c+3*t*d)];
  };f.coefficients=coeff;f.knots=xs;return f;
}
export function wells(d){if(d.kind!=='valleys')return [];const p=d.params;let t=p.start;return Array.from({length:p.count},(_,j)=>{const a=d.adjustments?.[j]??{},w={center:t+(a.shift??0),depth:p.depth*p.depthGrowth**j*(j+1)**p.depthPower*(a.depth??1),left:p.width*p.widthGrowth**j*Math.exp(-p.skew)*(a.left??1),right:p.width*p.widthGrowth**j*Math.exp(p.skew)*(a.right??1)};t+=p.spacing*p.spacingGrowth**j;return w;});}
export function compileDefinition(input){
  const d=validateDefinition(input);let raw;
  if(d.kind==='preset'){
    if(d.name==='sinlu')raw=x=>{const s=sigmoid(x),v=x+Math.sin(3*x);return [v*s,(1+3*Math.cos(3*x))*s+v*s*(1-s)];};
    else if(d.name==='snake')raw=x=>[x+Math.sin(x)**2,1+Math.sin(2*x)];
    else raw=x=>unary(d.name,x);
  }else if(d.kind==='expression')raw=compileExpression(parseExpression(d.expression));
  else if(d.kind==='sketch')raw=pchip(d.points);
  else{
    const p=d.params,ws=wells(d);
    raw=x=>{const s=sigmoid(p.steepness*(x-p.center)),t=s**p.gamma;let y=p.low+(p.high-p.low)*t+p.leak*x,dy=(p.high-p.low)*p.gamma*p.steepness*t*(1-s)+p.leak;
      for(const w of ws){const width=x<w.center?w.left:w.right,u=(x-w.center)/width,a=Math.abs(u);if(a>40)continue;const env=Math.exp(-.5*a**p.shape),envD=env*(-.5*p.shape*a**(p.shape-1)*Math.sign(u)/width);const waveWidth=Math.sqrt(w.left*w.right),v=(x-w.center)/waveWidth;const phase=p.frequency*v+p.nested*Math.sin(2*p.frequency*v),phaseD=p.frequency/waveWidth*(1+2*p.nested*Math.cos(2*p.frequency*v));const wave=1+p.ripple*Math.sin(phase);y-=w.depth*env*wave;dy-=w.depth*(envD*wave+env*p.ripple*Math.cos(phase)*phaseD);}
      return [y,dy];};
  }
  const [a,b]=d.domain,left=raw(a),right=raw(b);
  const f=x=>x<a?[left[0]+(x-a)*left[1],left[1]]:x>b?[right[0]+(x-b)*right[1],right[1]]:raw(x);
  f.definition=d;f.raw=raw;return f;
}
function bisectDerivative(f,a,b){let da=f(a)[1];for(let i=0;i<45;i++){const m=(a+b)/2,dm=f(m)[1];if(dm===0)return m;if(da*dm>0){a=m;da=dm;}else b=m;}return (a+b)/2;}
export function analyze(def,steps=3072){
  let f;try{f=compileDefinition(def);}catch(e){return {safe:false,error:e.message,samples:[],minima:[],maxima:[],warnings:[e.message]};}
  const [a,b]=def.domain,samples=[],minima=[],maxima=[];let maxSlope=0,maxOutput=0,flat=0,negative=0,bad=0,previous=null;
  for(let i=0;i<=steps;i++){const x=a+(b-a)*i/steps,[y,dy]=f(x),point={x,y,dy};samples.push(point);if(!Number.isFinite(y)||!Number.isFinite(dy)){bad++;previous=null;continue;}
    maxSlope=Math.max(maxSlope,Math.abs(dy));maxOutput=Math.max(maxOutput,Math.abs(y));if(Math.abs(dy)<.01)flat++;if(dy<0)negative++;
    if(previous&&previous.dy*dy<0){const root=bisectDerivative(f,previous.x,x),p={x:root,y:f(root)[0]};(previous.dy<0?minima:maxima).push(p);}
    if(Math.abs(dy)>1e-12)previous=point;
  }
  for(const v of minima){const l=[...maxima].reverse().find(m=>m.x<v.x),r=maxima.find(m=>m.x>v.x);v.leftPeak=l?.x??null;v.rightPeak=r?.x??null;v.depth=l?l.y-v.y:null;v.basinWidth=l&&r?r.x-l.x:null;}
  const warnings=[];if(bad)warnings.push('定義域内に非有限の値・導関数があります。');if(maxSlope>25)warnings.push('走査点で傾きの絶対値が25を超えます。学習は停止します。');if(maxOutput>100)warnings.push('走査点で出力の絶対値が100を超えます。');
  const end=Math.max(Math.abs(f(a)[1]),Math.abs(f(b)[1]));if(end>10)warnings.push('端点傾きが10を超え、範囲外で増幅する危険があります。');
  return {safe:!bad&&maxSlope<=25&&maxOutput<=100&&end<=10,error:null,samples,minima,maxima,maxSlope,maxOutput,flatFraction:flat/(steps+1),negativeFraction:negative/(steps+1),endpointSlopes:[f(a)[1],f(b)[1]],warnings,scanRange:[a,b],scanPoints:steps+1,method:'sampled analytic derivative + bisection; not a global proof'};
}
export function samplePoints(d,n=65){const f=compileDefinition(d),[a,b]=d.domain;return Array.from({length:n},(_,i)=>{const x=a+(b-a)*i/(n-1);return [x,f(x)[0]];});}

/** Compare PCHIP with the user's literal polyline. No smoothing is applied. */
export function inspectSketch(input){
  const d=validateDefinition(input);if(d.kind!=='sketch')throw new Error('手描き関数が必要です。');
  const f=compileDefinition(d),points=d.points;
  let sourceMinima=0,lastSign=0;
  for(let i=1;i<points.length;i++){const sign=Math.sign(points[i][1]-points[i-1][1]);if(lastSign<0&&sign>0)sourceMinima++;if(sign)lastSign=sign;}
  let polylineMaxDifference=0,j=0;
  for(let i=0;i<=2048;i++){const x=d.domain[0]+(d.domain[1]-d.domain[0])*i/2048;while(j<points.length-2&&points[j+1][0]<x)j++;
    const [x0,y0]=points[j],[x1,y1]=points[j+1],linear=y0+(y1-y0)*(x-x0)/(x1-x0);
    polylineMaxDifference=Math.max(polylineMaxDifference,Math.abs(f(x)[0]-linear));}
  return {sourceMinima,fittedMinima:analyze(d).minima.length,controlMaxError:Math.max(...points.map(([x,y])=>Math.abs(f(x)[0]-y))),polylineMaxDifference,samples:2049,note:'補間誤差ではなく、制御点を直線で結んだ元の折れ線との差も併記。'};
}
/** Bounded runtime check; finite differences are a test, not an arbitrary-expression proof. */
export function selfTest(def){
  const diagnostic=analyze(def);if(!diagnostic.safe)throw new Error('関数の数値診断を通過していません。');
  const f=compileDefinition(def),[a,b]=def.domain;let checked=0,skipped=0,maxError=0;
  for(let i=0;i<17;i++){
    const x=a+(b-a)*(i+.371)/17,h=1e-6*Math.max(1,Math.abs(x)),left=f(x-h),right=f(x+h),center=f(x);
    if(![...left,...right,...center].every(Number.isFinite))throw new Error('自己検査で非有限値を検出しました。');
    if(Math.abs(left[1]-right[1])>1e-3*Math.max(1,Math.abs(center[1]))){skipped++;continue;}
    const error=Math.abs((right[0]-left[0])/(2*h)-center[1]);maxError=Math.max(maxError,error);checked++;
    if(error>1e-5+1e-4*Math.abs(center[1]))throw new Error('導関数の自己検査に失敗しました。関数を調整してください。');
  }
  if(!checked)throw new Error('微分可能な検査点が不足しています。');
  return {passed:true,backend:'native-js-cpu',dtype:'float64',engine:ENGINE,checked,skipped,maxError,gpu:false};
}
