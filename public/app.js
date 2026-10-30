import {defaultDefinition,validateDefinition,compileDefinition,analyze,PRESETS,PARAMS,samplePoints,inspectSketch} from './core/activation.js';
import {exportPython,functionCSV,curveSVG} from './core/export.js';
import {summarize} from './core/training.js';
import {normalizeStrokePoints} from './core/sketch-stroke.js';
import {SUITES,scoreSuite,TASK_LABEL,CATEGORY_LABEL,DATASET_TASK} from './core/suite.js';
const $=id=>document.getElementById(id),all=s=>[...document.querySelectorAll(s)],clone=x=>structuredClone(x);
const state={def:defaultDefinition(),analysis:null,mode:'valleys',tab:'studio',history:[],future:[],comparison:null,derivative:false,drawTool:'draw',source:null,shared:null,busy:false,worker:null,result:null,runConfig:null,runs:[],loss:{},config:null,pending:null,dirty:false,backendInfo:null,suiteReports:[],scoreStale:false};
let toastTimer,renderTimer,workerTimer,plotView=null,gesture=null;
const snapshot=()=>({definition:clone(state.def),origin:clone(state.source)});
const fmt=(v,d=3)=>Number.isFinite(v)?v.toFixed(d):'—',pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',5000);}
function download(name,data,type='application/json'){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('コピーしました。');}catch{toast('コピーできません。入力欄を選択してコピーしてください。');}}
function invalidateScore(){if(state.result){state.scoreStale=true;renderSuiteScore();syncScoreStale();}}
function setDef(d,{history=true,controls=false}={}){
  try{const clean=validateDefinition(d);if(history){state.history.push(snapshot());if(state.history.length>50)state.history.shift();state.future=[];}state.def=clean;state.dirty=true;invalidateScore();if(controls)refreshControls();scheduleRender();}
  catch(e){toast(e.message);}
}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(render,35);}
const labels={low:'下側の値',high:'上側の値',steepness:'S字の立ち上がり',center:'S字の中心',gamma:'S字の非対称性',leak:'残す傾き',count:'谷の数',start:'最初の谷の位置',spacing:'最初の間隔',spacingGrowth:'間隔の成長倍率',depth:'最初の谷の深さ',depthGrowth:'深さの成長倍率',depthPower:'段番号の指数',width:'最初の谷の幅',widthGrowth:'幅の成長倍率',skew:'左右の非対称性',shape:'谷底の平らさ',ripple:'谷の中の波',frequency:'内側の波の密度',nested:'波の入れ子の強さ'};
const sections={'primary-params':['count','depth','depthGrowth','width'],'base-params':['low','high','steepness','center','gamma','leak'],'position-params':['start','spacing','spacingGrowth'],'shape-params':['depthPower','widthGrowth','skew','shape','ripple','frequency','nested']};
function buildParameters(){
  for(const [id,keys]of Object.entries(sections)){const container=$(id);container.replaceChildren();for(const key of keys){const [min,max]=PARAMS[key],step=key==='count'?1:key==='depth'||key==='leak'?.005:key==='shape'?.1:.01,wrapper=document.createElement('div');wrapper.className='param';const top=document.createElement('div');top.className='param-top';const label=document.createElement('label');label.textContent=labels[key];label.htmlFor='slider-'+key;
      const number=document.createElement('input');number.type='number';number.min=min;number.max=max;number.step=step;number.dataset.param=key;number.setAttribute('aria-label',labels[key]+' 数値');
      const range=document.createElement('input');range.type='range';range.id='slider-'+key;range.min=min;range.max=max;range.step=step;range.dataset.param=key;range.setAttribute('aria-label',labels[key]);
      for(const input of [number,range]){input.value=state.def.params?.[key]??defaultDefinition().params[key];input.addEventListener('input',()=>{if(input.value==='')return;const value=Number(input.value),d=clone(state.def);if(d.kind!=='valleys')return;d.params[key]=value;setDef(d);for(const other of all(`[data-param="${key}"]`))if(other!==input)other.value=input.value;if(key==='count')buildIndividual();});}
      top.append(label,number);wrapper.append(top,range);container.append(wrapper);}
  }
}
function buildIndividual(){const parent=$('individual-params');parent.replaceChildren();if(state.def.kind!=='valleys')return;for(let j=0;j<state.def.params.count;j++){
  const section=document.createElement('div');section.className='individual';const title=document.createElement('h4');title.textContent=`谷 ${j+1}`;section.append(title);const adj=state.def.adjustments[j]??{shift:0,depth:1,left:1,right:1};
  for(const pair of [['shift','depth'],['left','right']]){const row=document.createElement('div');row.className='row';for(const key of pair){const label=document.createElement('label');label.textContent=({shift:'位置の補正',depth:'深さの倍率',left:'左幅の倍率',right:'右幅の倍率'})[key];const input=document.createElement('input');input.type='number';input.step=.05;input.min=key==='shift'?-5:key==='depth'?0:.25;input.max=key==='shift'?5:4;input.value=adj[key];input.setAttribute('aria-label',`谷${j+1} ${label.textContent}`);input.addEventListener('change',()=>{const d=clone(state.def);for(let i=0;i<=j;i++)if(!d.adjustments[i])d.adjustments[i]={shift:0,depth:1,left:1,right:1};d.adjustments[j][key]=Number(input.value);setDef(d);});label.append(input);row.append(label);}section.append(row);}parent.append(section);
}}
function refreshControls(){
  $('share-button').disabled=!!state.source||!!window.NC_OFFLINE_MODE;if(!state.source)$('shared-banner').classList.add('hidden');
  all('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  for(const mode of ['valleys','sketch','expression','preset'])$(mode+'-controls').classList.toggle('hidden',mode!==state.mode);
  if(state.def.kind==='valleys'){for(const input of all('[data-param]'))input.value=state.def.params[input.dataset.param];buildIndividual();}
  if(state.def.kind==='expression')$('expression-input').value=state.def.expression;
  if(state.def.kind==='sketch')$('points-input').value=state.def.points.map(p=>p.map(x=>Number(x.toFixed(6))).join(', ')).join('\n');
  $('domain-min').value=state.def.domain[0];$('domain-max').value=state.def.domain[1];$('curve-canvas').classList.toggle('drawing',state.mode==='sketch');
  $('undo').disabled=!state.history.length;$('redo').disabled=!state.future.length;
}
function mode(name){state.mode=name;if(name==='valleys'&&state.def.kind!=='valleys')setDef(defaultDefinition(),{controls:true});else if(name==='expression'&&state.def.kind!=='expression'){$('expression-input').value='x*sigmoid(x)';refreshControls();}else if(name==='sketch'&&state.def.kind!=='sketch'){
  const points=samplePoints(state.def);setDef({schema:1,engine:'neurocurve-1',kind:'sketch',domain:[...state.def.domain],points},{controls:true});$('fit-note').textContent='現在の関数を65制御点に変換しました。ここから描き直すか、点を編集できます。';
}else refreshControls();render();}
function tab(name){state.tab=name;all('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-pressed',b.dataset.tab===name?'true':'false');});$('workspace').classList.toggle('hidden',name==='learning');$('analysis-panel').classList.toggle('hidden',name!=='analysis');$('learning-panel').classList.toggle('hidden',name!=='learning');if(name==='learning')drawLoss();else drawPlot();}
function baselineDefinition(){const name=$('baseline').value;if(name==='none')return null;if(name==='base'){if(state.def.kind!=='valleys')return null;const d=clone(state.def);d.params.depth=0;return d;}return {schema:1,engine:'neurocurve-1',kind:'preset',name,domain:[...state.def.domain]};}
function render(){
  state.analysis=analyze(state.def);const a=state.analysis;$('stat-minima').textContent=a.minima.length;$('stat-slope').textContent=fmt(a.maxSlope);$('stat-negative').textContent=pct(a.negativeFraction);$('stat-flat').textContent=pct(a.flatFraction);$('specified-count').textContent=state.def.kind==='valleys'?`指定 ${state.def.params.count} 個 / 実際の谷を検出`:'現在の表示範囲内';
  $('math-status').textContent=a.safe?'計算可能 / 走査検査通過':'注意 / 学習実行を制限';$('math-status').className='status '+(a.safe?'ok':'warn');$('math-warnings').replaceChildren(...a.warnings.map(w=>{const p=document.createElement('p');p.textContent=w;return p;}));
  $('function-caption').textContent=state.def.kind==='valleys'?'Multi-valley logistic':state.def.kind==='preset'?PRESETS[state.def.name]:state.def.kind==='sketch'?'Hand-drawn / PCHIP':'Custom expression';
  $('function-formula').textContent=state.def.kind==='valleys'?'f(x) = S字の土台 − Σ 深さ × 局所的なくぼみ':state.def.kind==='expression'?`f(x) = ${state.def.expression}`:state.def.kind==='sketch'?`${state.def.points.length} points · C¹ interpolation · tangent tails`:'Engine: neurocurve-1 · tangent tails';
  $('undo').disabled=!state.history.length;$('redo').disabled=!state.future.length;$('start-training').disabled=state.busy||!a.safe;
  const table=$('valley-table');table.replaceChildren();a.minima.forEach((p,i)=>{const tr=document.createElement('tr');for(const text of [i+1,fmt(p.x,5),fmt(p.y,5),fmt(p.depth,5),fmt(p.basinWidth,5)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}table.append(tr);});if(!a.minima.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='この範囲の走査では、局所的な谷を検出していません。';tr.append(td);table.append(tr);}
  $('endpoint-note').textContent=`左端の傾き ${fmt(a.endpointSlopes?.[0],5)} / 右端の傾き ${fmt(a.endpointSlopes?.[1],5)}。範囲外はこの傾きで線形延長します。`;
  if(state.def.kind==='sketch'){const fit=inspectSketch(state.def);$('fit-note').textContent=`制御点の最大誤差 ${fit.controlMaxError.toExponential(2)} / 元の折れ線との差 ${fmt(fit.polylineMaxDifference,5)} / 元の谷 ${fit.sourceMinima} → 検出 ${fit.fittedMinima}。灰色の線は元の折れ線。`; }
  drawPlot();
}
function canvasSize(canvas){const r=canvas.getBoundingClientRect();if(r.width<1||r.height<1)return null;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);return {ctx,width:r.width,height:r.height};}
function drawPlot(){
  const a=state.analysis;if(!a)return;const canvas=$('curve-canvas'),box=canvasSize(canvas);if(!box)return;const {ctx,width:W,height:H}=box;ctx.clearRect(0,0,W,H);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  const [xmin,xmax]=state.def.domain,main=a.samples.map(p=>[p.x,state.derivative?p.dy:p.y]);let baseline=[],comparison=[];
  const make=d=>{try{const f=compileDefinition(d);return Array.from({length:801},(_,i)=>{const x=xmin+(xmax-xmin)*i/800;return [x,f(x)[state.derivative?1:0]];});}catch{return [];}};
  const b=baselineDefinition();if(b)baseline=make(b);if(state.comparison)comparison=make(state.comparison);
  const vals=[...main,...baseline,...comparison].map(p=>p[1]).filter(Number.isFinite);let ymin=Math.min(0,...vals),ymax=Math.max(1,...vals);const m=(ymax-ymin)*.14;ymin-=m;ymax+=m;
  const pad={l:54,r:22,t:30,b:50};const v=gesture?.view??{xmin,xmax,ymin,ymax,pad,W,H};plotView=v;
  const X=x=>v.pad.l+(x-v.xmin)/(v.xmax-v.xmin)*(W-v.pad.l-v.pad.r),Y=y=>H-v.pad.b-(y-v.ymin)/(v.ymax-v.ymin)*(H-v.pad.t-v.pad.b);
  ctx.lineWidth=1;ctx.font='10px ui-monospace, monospace';ctx.textBaseline='middle';
  for(let i=0;i<=7;i++){const x=v.xmin+(v.xmax-v.xmin)*i/7,px=X(x);ctx.strokeStyle='#eaf0f1';ctx.beginPath();ctx.moveTo(px,v.pad.t);ctx.lineTo(px,H-v.pad.b);ctx.stroke();ctx.fillStyle='#8a9ba5';ctx.textAlign='center';ctx.fillText(x.toFixed(1),px,H-v.pad.b+17);}
  for(let i=0;i<=5;i++){const y=v.ymin+(v.ymax-v.ymin)*i/5,py=Y(y);ctx.strokeStyle='#eaf0f1';ctx.beginPath();ctx.moveTo(v.pad.l,py);ctx.lineTo(W-v.pad.r,py);ctx.stroke();ctx.fillStyle='#8a9ba5';ctx.textAlign='right';ctx.fillText(Math.abs(y)>99?y.toExponential(1):y.toFixed(1),v.pad.l-9,py);}
  ctx.strokeStyle='#b4c2c8';ctx.lineWidth=1;if(v.xmin<=0&&v.xmax>=0){ctx.beginPath();ctx.moveTo(X(0),v.pad.t);ctx.lineTo(X(0),H-v.pad.b);ctx.stroke();}if(v.ymin<=0&&v.ymax>=0){ctx.beginPath();ctx.moveTo(v.pad.l,Y(0));ctx.lineTo(W-v.pad.r,Y(0));ctx.stroke();}
  ctx.save();ctx.beginPath();ctx.rect(v.pad.l,v.pad.t,W-v.pad.l-v.pad.r,H-v.pad.t-v.pad.b);ctx.clip();
  function path(points,color,lineWidth,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.setLineDash(dash);ctx.beginPath();let started=false;for(const [x,y]of points){if(!Number.isFinite(y)){started=false;continue;}if(!started){ctx.moveTo(X(x),Y(y));started=true;}else ctx.lineTo(X(x),Y(y));}ctx.stroke();ctx.setLineDash([]);}
  path(baseline,'#a8b9c0',1.5,[5,5]);path(comparison,'#8c77a7',1.7,[4,4]);path(main,'#0c8576',2.4);
  if(!state.derivative)for(const p of a.minima){ctx.fillStyle='#f8e6bc';ctx.strokeStyle='#b58b49';ctx.lineWidth=1;ctx.beginPath();ctx.arc(X(p.x),Y(p.y),3.8,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(state.mode==='sketch'&&state.def.kind==='sketch'&&!state.derivative){ctx.fillStyle='#fff';ctx.strokeStyle='#0c8576';ctx.lineWidth=1.3;for(const [x,y]of state.def.points){ctx.beginPath();ctx.arc(X(x),Y(y),state.drawTool==='points'?3.5:1.6,0,Math.PI*2);ctx.fill();ctx.stroke();}}
  if(state.def.kind==='sketch'&&!state.derivative)path(state.def.points,'#aab5bc',1,[3,3]);
  if(gesture?.points)path(gesture.points,'#b58545',2);
  ctx.restore();ctx.fillStyle='#738993';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText(state.derivative?"導関数 f′(x)":"出力 f(x)",v.pad.l,14);ctx.textAlign='right';ctx.fillText('入力 x · 無次元',W-v.pad.r,H-10);
}
function pointerCoord(event){const rect=$('curve-canvas').getBoundingClientRect(),v=plotView;if(!v)return null;const px=event.clientX-rect.left,py=event.clientY-rect.top;return {x:v.xmin+(px-v.pad.l)/(v.W-v.pad.l-v.pad.r)*(v.xmax-v.xmin),y:v.ymin+(v.H-v.pad.b-py)/(v.H-v.pad.t-v.pad.b)*(v.ymax-v.ymin),px,py};}
$('curve-canvas').addEventListener('pointerdown',event=>{if(state.mode!=='sketch'||state.derivative)return;const p=pointerCoord(event);if(!p||p.px<plotView.pad.l||p.py<plotView.pad.t||p.px>plotView.W-plotView.pad.r||p.py>plotView.H-plotView.pad.b)return;event.preventDefault();$('curve-canvas').setPointerCapture(event.pointerId);
  if(state.drawTool==='draw')gesture={points:[[p.x,p.y]],view:clone(plotView),before:clone(state.def)};
  else{let closest=-1,distance=20;state.def.points.forEach(([x,y],i)=>{const dx=(x-p.x)/(plotView.xmax-plotView.xmin)*(plotView.W-76),dy=(y-p.y)/(plotView.ymax-plotView.ymin)*(plotView.H-80),d=Math.hypot(dx,dy);if(d<distance){distance=d;closest=i;}});if(closest>=0)gesture={point:closest,view:clone(plotView),before:clone(state.def)};}
});
$('curve-canvas').addEventListener('pointermove',event=>{const p=pointerCoord(event);if(!p)return;try{const f=compileDefinition(state.def);$('coordinate-readout').textContent=`x ${fmt(p.x,3)}   f(x) ${fmt(f(p.x)[0],3)}`;}catch{}
  if(!gesture)return;if(gesture.points){if(gesture.points.length<2048)gesture.points.push([p.x,p.y]);drawPlot();}
  else{const i=gesture.point,d=clone(state.def),prev=d.points[i-1]?.[0]??-100,next=d.points[i+1]?.[0]??100;if(p.x>prev+1e-5&&p.x<next-1e-5&&Math.abs(p.y)<=100){d.points[i]=[p.x,p.y];d.domain=[d.points[0][0],d.points.at(-1)[0]];try{state.def=validateDefinition(d);state.analysis=analyze(d);drawPlot();}catch{}}}
});
function finishGesture(){if(!gesture)return;const g=gesture;gesture=null;
  if(g.points){try{if(g.points.length<2)return;const clean=normalizeStrokePoints(g.points);const d={schema:1,engine:'neurocurve-1',kind:'sketch',points:clean,domain:[clean[0][0],clean.at(-1)[0]]};validateDefinition(d);setDef(d,{controls:true});$('sketch-status').textContent=`描画完了：${g.points.length}筆跡点 → ${clean.length}制御点。PCHIPで再計算しました。`; }catch(e){toast(e.message);render();}}
  else{state.history.push({definition:g.before,origin:clone(state.source)});state.future=[];state.dirty=true;invalidateScore();refreshControls();render();}
}
$('curve-canvas').addEventListener('pointerup',finishGesture);$('curve-canvas').addEventListener('pointercancel',()=>{if(gesture)state.def=gesture.before;gesture=null;render();});
all('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));all('[data-mode]').forEach(b=>b.onclick=()=>mode(b.dataset.mode));
$('hero-draw').onclick=()=>{tab('studio');mode('sketch');$('curve-canvas').scrollIntoView({behavior:'smooth',block:'center'});};
$('hero-benchmark').onclick=()=>{tab('learning');$('learning-panel').scrollIntoView({behavior:'smooth',block:'start'});};
$('clear-sketch').onclick=()=>{if(state.mode!=='sketch')return;const [min,max]=state.def.domain;setDef({schema:1,engine:'neurocurve-1',kind:'sketch',domain:[min,max],points:[[min,0],[max,0]]},{controls:true});toast('下書きの直線に戻しました。グラフ上に新しい線を描いてください。');};
$('go-analysis').onclick=()=>{tab('analysis');$('analysis-panel').scrollIntoView({behavior:'smooth',block:'start'});};$('go-learning').onclick=()=>tab('learning');
$('reset').onclick=()=>{state.mode='valleys';setDef(defaultDefinition(),{controls:true});state.source=null;state.shared=null;$('shared-banner').classList.add('hidden');refreshControls();};
$('undo').onclick=()=>{if(!state.history.length)return;state.future.push(snapshot());const record=state.history.pop();state.def=record.definition;state.source=record.origin;state.mode=state.def.kind;state.dirty=true;invalidateScore();refreshControls();render();};$('redo').onclick=()=>{if(!state.future.length)return;state.history.push(snapshot());const record=state.future.pop();state.def=record.definition;state.source=record.origin;state.mode=state.def.kind;state.dirty=true;invalidateScore();refreshControls();render();};
$('depth-square').onclick=()=>{const d=clone(state.def);d.params.depthPower=2;d.params.depthGrowth=1;d.params.depth=.02;setDef(d,{controls:true});toast('段番号の2乗で深さを増やしました。曲線全体の二乗ではありません。');};
for(const [name,label]of Object.entries(PRESETS)){const b=document.createElement('button');b.textContent=label;b.onclick=()=>setDef({schema:1,engine:'neurocurve-1',kind:'preset',name,domain:[...state.def.domain]});$('preset-buttons').append(b);}
$('apply-expression').onclick=()=>{const d={schema:1,engine:'neurocurve-1',kind:'expression',expression:$('expression-input').value,domain:[...state.def.domain]};try{validateDefinition(d);$('expression-error').textContent='';setDef(d);}catch(e){$('expression-error').textContent=e.message;}};
$('apply-points').onclick=()=>{try{const points=$('points-input').value.trim().split(/\n/).filter(Boolean).map(line=>line.trim().split(/[,\s]+/).map(Number));const d={schema:1,engine:'neurocurve-1',kind:'sketch',points,domain:[points[0][0],points.at(-1)[0]]};validateDefinition(d);setDef(d,{controls:true});}catch(e){toast(e.message);}};
$('draw-mode').onclick=()=>{state.drawTool='draw';$('draw-mode').classList.add('active');$('point-mode').classList.remove('active');drawPlot();};$('point-mode').onclick=()=>{state.drawTool='points';$('point-mode').classList.add('active');$('draw-mode').classList.remove('active');drawPlot();};
$('apply-domain').onclick=()=>{if(state.def.kind==='sketch')return toast('手描きの範囲は両端の制御点を変更してください。');const d=clone(state.def);d.domain=[Number($('domain-min').value),Number($('domain-max').value)];setDef(d);};
$('baseline').onchange=drawPlot;$('plot-function').onclick=()=>{state.derivative=false;$('plot-function').classList.add('active');$('plot-derivative').classList.remove('active');drawPlot();};$('plot-derivative').onclick=()=>{state.derivative=true;$('plot-derivative').classList.add('active');$('plot-function').classList.remove('active');drawPlot();};
$('compare-save').onclick=()=>{state.comparison=clone(state.def);$('comparison-note').classList.remove('hidden');drawPlot();};$('compare-clear').onclick=()=>{state.comparison=null;$('comparison-note').classList.add('hidden');drawPlot();};
all('[data-export]').forEach(b=>b.onclick=()=>{try{switch(b.dataset.export){case 'json':download('NeuroCurve-function.json',JSON.stringify({definition:state.def,origin:state.source},null,2));break;case 'csv':download('NeuroCurve-function.csv',functionCSV(state.def),'text/csv');break;case 'svg':download('NeuroCurve-curve.svg',curveSVG(state.def),'image/svg+xml');break;case 'png':$('curve-canvas').toBlob(blob=>{if(blob)download('NeuroCurve-curve.png',blob);});break;case 'python':download('neurocurve_activation.py',exportPython(state.def),'text/x-python');break;}}catch(e){toast(e.message);}});
$('import-function').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>65536)return toast('関数ファイルは64 KiB以下にしてください。');try{const raw=JSON.parse(await file.text()),d=validateDefinition(raw.definition??raw);state.mode=d.kind;setDef(d,{controls:true});state.source=raw.origin??null;refreshControls();}catch(e){toast(e.message);}event.target.value='';};
function drawLoss(){const canvas=$('loss-canvas'),box=canvasSize(canvas);if(!box)return;const {ctx,width:W,height:H}=box;ctx.clearRect(0,0,W,H);const tracks=Object.entries(state.loss);if(!tracks.length){ctx.fillStyle='#9aa9af';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('実行すると、損失の推移を描画します。',W/2,H/2);return;}
  const values=tracks.flatMap(([,t])=>t.map(p=>Math.log10(Math.max(p.loss,1e-8)))).filter(Number.isFinite);let lo=Math.min(...values)-.1,hi=Math.max(...values)+.1,steps=(state.runConfig?.mode??$('benchmark-mode').value)==='full'?600:150;const X=x=>58+(W-88)*x/steps,Y=y=>H-34-(y-lo)/(hi-lo)*(H-65);ctx.font='10px ui-monospace,monospace';for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;ctx.strokeStyle='#e9eeef';ctx.beginPath();ctx.moveTo(58,Y(v));ctx.lineTo(W-30,Y(v));ctx.stroke();ctx.fillStyle='#8b9ca4';ctx.textAlign='right';ctx.fillText((10**v).toFixed(v< -1?3:2),48,Y(v)+3);}const colors={Custom:'#0c8576',ReLU:'#9babb2',Swish:'#887eaa',GELU:'#ba9662'};for(const [key,track]of tracks){ctx.strokeStyle=colors[key.split(':')[0]];ctx.lineWidth=key.startsWith('Custom')?2:1.3;ctx.beginPath();track.forEach((p,i)=>{const x=X(p.step),y=Y(Math.log10(Math.max(p.loss,1e-8)));i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}ctx.fillStyle='#718892';ctx.textAlign='left';ctx.fillText('損失（対数軸）',58,15);ctx.textAlign='right';ctx.fillText('更新回数',W-30,H-9);
}
function renderResults(){const lower=DATASET_TASK[state.runConfig?.dataset??$('dataset').value]==='regression',summary=summarize(state.runs,lower),body=$('results-body');body.replaceChildren();$('metric-heading').textContent=lower?'RMSE / 中央値':'正解率 / 中央値';for(const g of summary.groups){const tr=document.createElement('tr');if(g.name==='Custom')tr.className='custom';const metric=v=>v===null?'—':lower?fmt(v,4):(v*100).toFixed(2)+'%';for(const text of [g.name,metric(g.median),g.n?`${metric(g.min)} – ${metric(g.max)}`:'—',g.elapsedMedianMs===null?'—':fmt(g.elapsedMedianMs/1000,2)+' s',state.runs.find(r=>r.name===g.name&&!r.failed)?.backend??'—',`${g.n} / ${g.failures}`]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}
  const paired=$('paired-results');paired.replaceChildren();for(const c of summary.comparisons){const p=document.createElement('p');p.textContent=`対 ${c.baseline}: シード対応平均差 ${c.meanDifference===null?'—':lower?fmt(c.meanDifference,5):fmt(c.meanDifference*100,3)+' ポイント'} (${c.pairs}ペア) / UNCERTAIN — 一般的な優位性は未検証`;paired.append(p);}
  $('run-diagnostics').textContent=JSON.stringify(state.runs.map(r=>({name:r.name,seed:r.seed,backend:r.backend,dtype:r.dtype,validation:r.validation,test:r.test,initialTrainLoss:r.initialTrainLoss,finalTrainLoss:r.finalTrainLoss,maxGradientNorm:r.maxGradientNorm,clippedSteps:r.clippedSteps,activationDiagnostics:r.activationDiagnostics,activationLut:r.activationLut,gradientAudit:r.gradientAudit,gpuSetupMs:r.gpuSetupMs,config:r.config,error:r.error})),null,2);
}
/** A score is valid only for its exact curve and chosen benchmark settings. */
function matchesRunSelection(){
 const run=state.runConfig;
 return !!run&&run.scope===$('evaluation-scope').value&&run.mode===$('benchmark-mode').value&&run.backend===$('compute-backend').value&&(run.scope!=='single'||run.dataset===$('dataset').value);
}
function syncScoreStale(){
 const outdated=!!state.result&&(state.scoreStale||!matchesRunSelection());
 $('results-source-notice').textContent=outdated?'この測定結果は変更前の曲線または評価条件による履歴です。現在の条件で比較するには再実行してください。':'各数値は今回の実学習から計算しています。';
 if(outdated&&state.result?.kind==='suite'){
  $('suite-score').textContent='—';
  $('suite-status').textContent=state.scoreStale?'曲線変更・再評価が必要':'評価条件変更・再評価が必要';
  $('suite-credits').textContent='以前の測定値は現在の曲線・評価条件のスコアとして表示しません。新しい条件で再評価してください。';
  $('score-balance').textContent='前回の実測ログは下部から書き出せます。';
  for(const id of ['export-scorecard','copy-score-summary','share-score-pack'])$(id).disabled=true;
 }
}
function scopeChanged(){
 const scope=$('evaluation-scope').value,selected=scope!=='single';
 $('dataset').disabled=selected||state.busy;$('dataset').closest('label').classList.toggle('hidden',selected);
 $('suite-overview').classList.toggle('hidden',!selected);
 const total=selected?SUITES[scope].tasks.length:1,mult=$('benchmark-mode').value==='full'?5:1;
 $('suite-budget-note').textContent=selected?`${SUITES[scope].name}を${total*4*mult}学習で比較。${mult}シード × ${mult===5?'600':'150'}更新。すべての課題が完了しないと総合点は出ません。`:'選択した1課題をReLU・Swish・GELUと比較。総合スコアはありません。';
 if(state.result||state.suiteReports.length)renderSuiteScore();else syncScoreStale();
}
function renderSuiteScore(){
 const scope=$('evaluation-scope').value;
 if(scope==='single'){syncScoreStale();return;}
 const outdated=!!state.result&&(state.scoreStale||!matchesRunSelection());
 const score=scoreSuite(outdated?[]:state.suiteReports,scope),table=$('suite-tasks');
 const cards=$('suite-task-cards');cards.replaceChildren();
 table.replaceChildren();$('suite-score').textContent=score.overall===null?'—':score.overall.toFixed(2);
 $('suite-status').textContent=score.complete?(score.status==='exploratory'?'探索結果 / 1シード':'複数シード・記述的評価'):`進行中または未完了 ${score.tasks.filter(Boolean).length}/${score.tasks.length}`;
 $('suite-credits').textContent=score.complete?'基準50点：ReLU / Swish / GELUの同一条件での誤差中央値と比較。カテゴリー均等重み。一般的優位性の証明ではありません。':'未実行・失敗の課題は総合点に含めず、全課題成功まで総合点を表示しません。';
 const better=score.tasks.filter(t=>t?.score>50).length;
 $('score-balance').textContent=score.complete?`${score.tasks.length}課題中 ${better}課題で基準50点を上回りました。数値の高低は今回の条件に限ります。`:`${score.tasks.filter(Boolean).length}/${score.tasks.length}課題を評価済み。全課題が成功すると総合点を確定します。`;
 const categories=$('suite-categories');categories.replaceChildren();
 for(const [id,value] of Object.entries(score.categories)){const row=document.createElement('div');row.className='category-row';const title=document.createElement('span');title.textContent=CATEGORY_LABEL[id];const scale=document.createElement('div');scale.className='category-scale';const bar=document.createElement('progress');bar.max=100;bar.value=value??0;bar.setAttribute('aria-label',CATEGORY_LABEL[id]+' 相対点・基準50点');scale.append(bar);const num=document.createElement('strong');num.textContent=value===null?'—':value.toFixed(2);row.append(title,scale,num);categories.append(row);}
 for(const name of SUITES[scope].tasks){
  const task=score.tasks.find(t=>t?.id===name),report=state.suiteReports.find(r=>r.dataset===name),tr=document.createElement('tr');
  if(task?.score>50)tr.classList.add('better');
  const format=(n,type)=>Number.isFinite(n)?type==='classification'?(n*100).toFixed(2)+'%':n.toFixed(4):'—';
  const col=[TASK_LABEL[name],DATASET_TASK[name]==='classification'?'分類':'回帰',task?format(task.customMedian,task.type):'—',task?format(task.baselineMedian,task.type):'—',task?task.score.toFixed(2):'—',task?'完了':report?'失敗 / データを確認':'未実行'];
  for(const value of col){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
  // Mobile: a readable task-by-task card; desktop retains the precise table.
  const article=document.createElement('article');article.className='task-score-card';article.setAttribute('role','listitem');
  const heading=document.createElement('div');heading.className='task-card-heading';const label=document.createElement('strong');label.textContent=TASK_LABEL[name];const scoreNumber=document.createElement('strong');scoreNumber.className='task-card-number';scoreNumber.textContent=task?`${task.score.toFixed(2)} / 100`:'未完了';if(task?.score>50)scoreNumber.classList.add('above-baseline');heading.append(label,scoreNumber);
  const meter=document.createElement('div');meter.className='task-score-meter';const progress=document.createElement('progress');progress.max=100;progress.value=task?.score??0;progress.setAttribute('aria-label',`${TASK_LABEL[name]}：${task?.score.toFixed(2)??'未評価'}点、基準50点`);meter.append(progress);
  const desc=document.createElement('p');desc.textContent=`${DATASET_TASK[name]==='classification'?'正解率':'RMSE'}：Custom ${task?format(task.customMedian,task.type):'—'} / 基準 ${task?format(task.baselineMedian,task.type):'—'}`;
  const stateText=document.createElement('small');stateText.textContent=task?(task.score>50?'基準より良好':task.score<50?'基準未満':'基準と同等'):report?'失敗 / データを確認':'未実行';
  article.append(heading,meter,desc,stateText);cards.append(article);
 }
 const ready=score.complete&&!state.scoreStale&&matchesRunSelection()&&!!state.result?.score?.complete;
 for(const id of ['export-scorecard','copy-score-summary','share-score-pack'])$(id).disabled=!ready;
 syncScoreStale();
}
function scoreCardText(){
 const r=state.result,score=r?.score;
 if(!r||r.kind!=='suite'||!score?.complete||state.scoreStale||!matchesRunSelection())return '';
 return `NeuroCurve / ${score.suiteName} 相対スコア: ${score.overall}/100 (基準50)\n`+score.tasks.map(t=>`${t.label}: ${t.score}/100`).join('\n')+`\n${r.mode==='quick'?'1シード探索':'5シード記述評価'} / ${r.backendSelection?.effective??'unknown'} / 測定結果は自己申告・独立検証なし。`;
}
$('copy-score-summary').onclick=()=>{const value=scoreCardText();if(value)copy(value);};
$('export-scorecard').onclick=()=>{
 const r=state.result,score=r?.score;if(!score?.complete||state.scoreStale||!matchesRunSelection())return;
 const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const rows=score.tasks.map((t,i)=>`<text x="56" y="${225+28*i}" font-size="16" fill="#e3efed">${xml(t.label)}<tspan x="650" text-anchor="end" fill="#91f2bd">${t.score.toFixed(2)}</tspan></text>`).join('');
 const height=270+score.tasks.length*28;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}"><rect width="100%" height="100%" fill="#10282e"/><text x="56" y="65" fill="#9ed3c4" font-size="16" font-family="sans-serif">NEUROCURVE · CHALLENGE REPORT</text><text x="56" y="145" fill="white" font-size="68" font-weight="bold" font-family="sans-serif">${score.overall.toFixed(2)}<tspan font-size="24" fill="#9ed3c4"> / 100</tspan></text><text x="56" y="178" fill="#b0c4c4" font-size="16">${xml(score.suiteName)} · 基準50点</text>${rows}<text x="56" y="${height-35}" fill="#aec0c0" font-size="12">Local self-reported result · Not independently verified · No general superiority claim</text></svg>`;
 download('NeuroCurve-challenge-score.svg',svg,'image/svg+xml');
};
$('share-score-pack').onclick=async()=>{
 const r=state.result,score=r?.score;if(!score?.complete||state.scoreStale||!matchesRunSelection())return;
 const pack={format:'neurocurve-share-pack-v1',definition:clone(r.definition),benchmark:{suiteId:r.suiteId,mode:r.mode,score:clone(score)},environment:{backend:state.backendInfo?.effective??'unknown',dtype:state.backendInfo?.dtype??'unknown'},notice:'ユーザーが明示的に共有した自己申告スコア。サーバー検証・性能優位性の証明ではありません。削除キー・生データは含みません。'};
 const name='NeuroCurve-share-pack.json',file=new File([JSON.stringify(pack,null,2)],name,{type:'application/json'});
 try{if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({title:'NeuroCurve / 評価結果と関数',text:scoreCardText(),files:[file]});toast('端末の共有メニューに渡しました。');}
 else{download(name,file);toast('共有用JSONを保存しました。ファイルを送る相手を自分で選んでください。公開URLではありません。');}}
 catch(e){if(e.name!=='AbortError')toast('ファイル共有に失敗しました。保存してから共有してください。');}
};
function finishWorker(){clearTimeout(workerTimer);$('workspace').inert=false;state.worker?.terminate();state.worker=null;state.busy=false;$('stop-training').disabled=true;$('dataset').disabled=false;$('benchmark-mode').disabled=false;$('compute-backend').disabled=false;$('evaluation-scope').disabled=false;scopeChanged();$('start-training').disabled=!state.analysis.safe;}
$('start-training').onclick=()=>{
  if(state.busy||!state.analysis.safe)return;if(!window.Worker)return toast('このブラウザはWorkerに対応していません。');
  state.runConfig={scope:$('evaluation-scope').value,dataset:$('dataset').value,mode:$('benchmark-mode').value,backend:$('compute-backend').value};state.suiteReports=[];state.scoreStale=false;renderSuiteScore();state.backendInfo=null;$('effective-backend').textContent='GPU検査待ち / CPUも利用可';$('compute-backend').disabled=true;$('evaluation-scope').disabled=true;state.busy=true;state.runs=[];state.loss={};state.result=null;$('export-results').disabled=true;$('start-training').disabled=true;$('stop-training').disabled=false;$('dataset').disabled=true;$('benchmark-mode').disabled=true;$('training-progress').value=0;$('training-status').textContent='初期化中 / この端末で実行';$('paired-results').replaceChildren();$('results-body').replaceChildren();drawLoss();
  let worker;try{worker=new Worker('/worker.js',{type:'module'});}catch{ $('training-status').textContent='起動失敗: Workerを開始できません。';finishWorker();return;}state.worker=worker;$('workspace').inert=true;workerTimer=setTimeout(()=>{$('training-status').textContent='起動失敗: Workerの応答がありません。';finishWorker();},15000);
  worker.onmessage=({data:e})=>{clearTimeout(workerTimer);if(e.type==='probe-start'){$('training-status').textContent='WebGPUの実演算を検査中';$('training-detail').textContent='GPUコンピュート検証。停止ボタンで中断できます。';}
    else if(e.type==='backend'){state.backendInfo=e;$('effective-backend').textContent=e.effective==='webgpu-compute'?'WebGPU · Float32':'CPU / JavaScript · Float64';$('training-status').textContent=e.effective==='webgpu-compute'?'WebGPUで学習を開始':'CPUで学習を開始';$('training-detail').textContent=e.reason;if(e.effective==='native-js-cpu'&&e.selected==='auto')toast('WebGPUは利用できませんでした。CPUで実行します。 '+e.reason);}
    else if(e.type==='suite-task-start'){state.runConfig.dataset=e.dataset;state.runs=[];state.loss={};drawLoss();$('training-status').textContent=`${TASK_LABEL[e.dataset]} / ${e.taskIndex+1} / ${e.taskCount} 課題`;renderSuiteScore();}
    else if(e.type==='suite-task-end'){state.suiteReports.push(e.report);renderSuiteScore();$('training-progress').value=(e.taskIndex+1)/e.taskCount;}
    else if(e.type==='self-test'){$('training-detail').textContent=`数学自己検査: ${e.result.checked}点 / 最大微分誤差 ${e.result.maxError.toExponential(2)}`;}else if(e.type==='run-start'){$('training-status').textContent=`${e.name} を学習中`;$('training-detail').textContent=`seed ${e.seed} · ${e.index+1}/${e.total} 実行`;state.loss[`${e.name}:${e.seed}`]=[];}
    else if(e.type==='progress'){state.loss[`${e.name}:${e.seed}`].push({step:e.step,loss:e.loss});$('training-progress').value=e.taskCount?(e.taskIndex+(e.index+e.step/e.steps)/e.total)/e.taskCount:(e.index+e.step/e.steps)/e.total;$('training-detail').textContent=`seed ${e.seed} · ${e.step}/${e.steps} 更新 · ${e.index+1}/${e.total} 実行`;drawLoss();}
    else if(e.type==='run-end'){state.runs.push(e.run);renderResults();}
    else if(e.type==='complete'){state.result=e.result;state.result.environment={userAgent:navigator.userAgent,logicalProcessors:navigator.hardwareConcurrency??null,backend:state.backendInfo?.effective??'unknown',dtype:state.backendInfo?.dtype??'unknown',clock:'not fixed / not available from browser'};if(state.result.kind==='suite'){state.suiteReports=state.result.reports;renderSuiteScore();$('training-status').textContent=state.result.score.complete?'全課題の評価が完了':'全課題を実行・一部失敗';}else{$('training-status').textContent=`評価終了 / ${state.runs.filter(r=>!r.failed).length} 成功・${state.runs.filter(r=>r.failed).length} 失敗`;} $('training-detail').textContent='結果はこのタブ内のみ。サーバーに送信していません。';$('training-progress').value=1;$('export-results').disabled=false;finishWorker();renderResults();}
    else if(e.type==='error'){$('training-status').textContent='実行停止: '+e.message;finishWorker();}};
  worker.onerror=e=>{$('training-status').textContent='実行エラー。ブラウザまたは共通データの取得状況を確認してください。';finishWorker();};
  worker.postMessage({type:'start',definition:clone(state.def),dataset:$('dataset').value,mode:$('benchmark-mode').value,backend:$('compute-backend').value,scope:$('evaluation-scope').value});
};
$('evaluation-scope').onchange=scopeChanged;$('benchmark-mode').onchange=scopeChanged;$('compute-backend').onchange=scopeChanged;$('dataset').onchange=scopeChanged;scopeChanged();
$('stop-training').onclick=()=>{finishWorker();$('training-status').textContent='学習を中断しました';$('training-detail').textContent='Workerを終了しました。GPU側の計算停止・解放はブラウザが管理します。';};
$('export-results').onclick=()=>{if(state.result)download('NeuroCurve-experiment.json',JSON.stringify(state.result,null,2));};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const randomHex=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store'});let b;try{b=await r.json();}catch{b={};}if(!r.ok)throw new Error(b.error??'接続に失敗しました。');return b;}
function consentChanged(){$('publish-share').disabled=!$('share-consent').checked||!$('key-saved').checked||!state.pending||state.pending.success;}
$('share-consent').onchange=consentChanged;$('key-saved').onchange=consentChanged;
$('share-button').onclick=async()=>{
  if(state.source)return toast('この関数は他者の投稿由来です。ローカルで編集・評価できますが、この版では再投稿しません。');
  if(!state.config?.sharingEnabled)return toast('この配信環境では共有APIを利用できません。ローカル版サーバーを起動すると利用できます。');
  try{
    if(!state.pending||state.pending.success){const secret=randomHex(32);state.pending={secret,shareId:randomHex(16),requestId:randomHex(16),definition:clone(state.def),deleteHash:await digest(secret),body:null,success:false};$('delete-secret').value=secret;$('delete-secret').type='password';$('share-title').value='';$('share-description').value='';$('share-days').value='7';$('share-consent').checked=false;$('key-saved').checked=false;$('share-success').classList.add('hidden');$('share-status').textContent='';for(const id of ['share-title','share-description','share-days'])$(id).disabled=false;}
    consentChanged();$('share-dialog').showModal();
  }catch{toast('安全な乱数を利用できません。HTTPSまたはlocalhostで開いてください。');}
};
$('copy-secret').onclick=()=>copy($('delete-secret').value);$('reveal-secret').onclick=()=>{$('delete-secret').type=$('delete-secret').type==='password'?'text':'password';};
$('download-key').onclick=()=>{if(!state.pending)return;download('NeuroCurve-delete-receipt.json',JSON.stringify({shareUrl:(state.config?.origin??location.origin)+'/f/'+state.pending.shareId,deleteSecret:state.pending.secret,requestId:state.pending.requestId,warning:'秘密キーです。第三者に渡さないでください。'},null,2));};
$('publish-share').onclick=async()=>{
  if(!$('share-consent').checked||!$('key-saved').checked||!state.pending)return;const p=state.pending;
  if(!p.body)p.body={shareId:p.shareId,requestId:p.requestId,deleteHash:p.deleteHash,definition:p.definition,title:$('share-title').value,description:$('share-description').value,days:$('share-days').value==='unlimited'?null:Number($('share-days').value),consent:true,termsVersion:'2026-10-v1',reuse:'local-only'};
  $('publish-share').disabled=true;for(const id of ['share-title','share-description','share-days'])$(id).disabled=true;$('share-status').textContent='投稿を確認中…';
  try{const r=await api('/api/shares',{method:'POST',body:JSON.stringify(p.body)});p.success=true;$('share-url').value=r.url;$('share-expiry').textContent=r.expiresAt?'公開期限: '+new Date(r.expiresAt).toLocaleString()+' / UTC '+r.expiresAt:'期限設定なし。サービスの永続を保証しません。';$('share-success').classList.remove('hidden');$('share-status').textContent='関数定義のみ投稿しました。学習結果は送信していません。';}
  catch(e){$('share-status').textContent=e.message+' 同じキー・同じ内容で再試行できます。このタブを閉じないでください。';$('publish-share').disabled=false;}
};
$('copy-share').onclick=()=>copy($('share-url').value);$('native-share').onclick=async()=>{if(!navigator.share)return copy($('share-url').value);try{await navigator.share({title:'NeuroCurve',url:$('share-url').value});}catch(e){if(e.name!=='AbortError')toast('共有できません。URLコピーをご利用ください。');}};
all('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
const extractId=text=>{const m=String(text).trim().match(/(?:^|\/f\/)([a-f0-9]{32})\/?$/);if(!m)throw new Error('NeuroCurveの共有URLまたは32文字の共有IDを入力してください。');return m[1];};
$('manage-button').onclick=()=>{$('delete-dialog').showModal();};
$('delete-post').onclick=async()=>{if(!$('delete-confirm').checked){$('delete-status').textContent='削除の確認をチェックしてください。';return;}try{const id=extractId($('delete-share-id').value),key=$('delete-key').value.trim();if(!/^[a-f0-9]{64}$/.test(key))throw new Error('64文字の削除キーが必要です。');$('delete-post').disabled=true;await api('/api/shares/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+key}});$('delete-status').textContent='削除しました。共有URLからは取得できません。';$('delete-key').value='';}catch(e){$('delete-status').textContent=e.message;}finally{$('delete-post').disabled=false;}};
$('report-button').onclick=()=>{if(state.shared)$('report-id').value=location.origin+'/f/'+state.shared.shareId;$('report-dialog').showModal();};
$('report-send').onclick=async()=>{try{const shareId=extractId($('report-id').value),reason=$('report-reason').value;const r=await api('/api/reports',{method:'POST',body:JSON.stringify({shareId,reason})});$('report-status').textContent=r.message;}catch(e){$('report-status').textContent=e.message;}};
$('shared-edit').onclick=()=>{state.dirty=true;toast('このタブ内で編集できます。元の投稿は変更されません。');};
window.addEventListener('beforeunload',e=>{if(state.dirty||state.busy||state.pending&&!state.pending.success){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',()=>{drawPlot();drawLoss();});
buildParameters();buildIndividual();refreshControls();render();
async function initialize(){
  if(window.NC_OFFLINE_MODE){state.config={sharingEnabled:false};$('share-button').disabled=true;$('share-button').textContent='URL共有は準備中';return;}
  try{state.config=await api('/api/config');}catch{state.config={sharingEnabled:false};}
  const match=/^\/f\/([a-f0-9]{32})$/.exec(location.pathname);
  if(match){try{const shared=await api('/api/shares/'+match[1]);state.shared=shared;state.source={shareId:shared.shareId,contentHash:shared.contentHash,reuse:shared.reuse};state.def=validateDefinition(shared.definition);state.mode=state.def.kind;$('shared-title').textContent=shared.title||'共有された活性化関数';$('shared-details').textContent=(shared.description?shared.description+' / ':'')+(shared.expiresAt?'期限 '+new Date(shared.expiresAt).toLocaleString():'期限設定なし');$('shared-banner').classList.remove('hidden');$('share-button').disabled=true;refreshControls();render();}catch(e){toast(e.message);}}
}
initialize();
