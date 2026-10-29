/** Transparent multi-task challenge score. Never replaces per-task scientific results. */
export const SUITES=Object.freeze({
 core:Object.freeze({id:'core-v1',name:'基本6課題',tasks:['moons','circles','digits','iris','wave','chirp'],categories:{nonlinear:['moons','circles'],vision:['digits'],tabular:['iris'],signal:['wave','chirp']}}),
 extended:Object.freeze({id:'extended-v1',name:'拡張10課題',tasks:['moons','circles','spiral','xor','digits','iris','wine','breast','wave','chirp'],categories:{nonlinear:['moons','circles','spiral','xor'],vision:['digits'],tabular:['iris','wine','breast'],signal:['wave','chirp']}})
});
export const DATASET_TASK=Object.freeze({moons:'classification',circles:'classification',spiral:'classification',xor:'classification',digits:'classification',iris:'classification',wine:'classification',breast:'classification',wave:'regression',chirp:'regression'});
export const TASK_LABEL=Object.freeze({moons:'Two Moons',circles:'Concentric Circles',spiral:'Spiral',xor:'XOR',digits:'Digits 8×8',iris:'Iris',wine:'Wine',breast:'Breast Cancer (WDBC)',wave:'Multi-frequency',chirp:'Chirp Signal'});
export const CATEGORY_LABEL=Object.freeze({nonlinear:'非線形分類',vision:'画像特徴',tabular:'表形式分類',signal:'信号回帰'});
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length%2?b[(b.length-1)/2]:(b[b.length/2-1]+b[b.length/2])/2;};
const mean=a=>a.reduce((sum,x)=>sum+x,0)/a.length;
const round=v=>Math.round(v*100)/100;
/** Ratio-based, bounded score: baseline median of ReLU/Swish/GELU = 50 points. */
export function relativeTaskScore(customError,baselineError){
 if(!Number.isFinite(customError)||!Number.isFinite(baselineError)||customError<0||baselineError<0)throw new Error('相対評価に使用する誤差が不正です。');
 const denominator=customError+baselineError+1e-6;
 return Math.max(0,Math.min(100,50+50*(baselineError-customError)/denominator));
}
const isValidMetric=(v,type)=>Number.isFinite(v)&&(type==='classification'?v>=0&&v<=1:v>=0);
const metricError=(v,type)=>type==='classification'?1-v:v;
function scoreTask(report){
 const type=DATASET_TASK[report.dataset],expected=report.settings?.seeds;
 if(!type||!Array.isArray(expected)||!expected.length||new Set(expected).size!==expected.length||!Array.isArray(report.runs))return null;
 const names=['Custom','ReLU','Swish','GELU'];
 // Extra/failed/off-protocol runs must never be omitted from the final grade.
 if(report.runs.length!==expected.length*names.length||report.runs.some(r=>!names.includes(r.name)||!expected.includes(r.seed)))return null;
 const scores=[],raw=[],references=[],diffs=[];
 let backend=null,dtype=null;
 for(const seed of expected){
  const rows=names.map(name=>{
   const match=report.runs.filter(r=>r.name===name&&r.seed===seed);
   return match.length===1?match[0]:null;
  });
  if(rows.some(r=>!r||r.failed||!r.test||!isValidMetric(r.test.metric,type)))return null;
  if(new Set(rows.map(r=>r.backend)).size!==1||new Set(rows.map(r=>r.dtype)).size!==1)return null;
  if(typeof rows[0].backend!=='string'||!rows[0].backend||typeof rows[0].dtype!=='string'||!rows[0].dtype)return null;
  if(backend!==null&&(backend!==rows[0].backend||dtype!==rows[0].dtype))return null;
  backend=rows[0].backend;dtype=rows[0].dtype;
  const custom=metricError(rows[0].test.metric,type);
  const baseline=median(rows.slice(1).map(r=>metricError(r.test.metric,type)));
  scores.push(relativeTaskScore(custom,baseline));raw.push(rows[0].test.metric);references.push(type==='classification'?1-baseline:baseline);diffs.push(type==='classification'?rows[0].test.metric-(1-baseline):baseline-rows[0].test.metric);
 }
 return {id:report.dataset,label:TASK_LABEL[report.dataset],type,score:round(median(scores)),nSeeds:scores.length,customMedian:median(raw),baselineMedian:median(references),medianImprovement:median(diffs),scoreMin:round(Math.min(...scores)),scoreMax:round(Math.max(...scores)),datasetVersion:report.datasetVersion,mode:report.mode,backend,dtype};
}
/** Incomplete/failed tasks are never silently omitted from the overall score. */
export function scoreSuite(reports,suiteId='core'){
 const suite=SUITES[suiteId];if(!suite)throw new Error('不正な評価セットです。');
 if(!Array.isArray(reports))throw new Error('評価データが不正です。');
 const tasks=suite.tasks.map(id=>{const matching=reports.filter(r=>r.dataset===id);return matching.length===1?scoreTask(matching[0]):null;});
 const sameMode=reports.length>0&&new Set(reports.map(r=>r.mode)).size===1;
 const sameBackend=tasks.every(Boolean)&&new Set(tasks.map(t=>t.backend)).size===1&&new Set(tasks.map(t=>t.dtype)).size===1;
 const complete=reports.length===suite.tasks.length&&sameMode&&sameBackend&&tasks.every(Boolean);
 const categories={};for(const [key,ids]of Object.entries(suite.categories)){
  const values=ids.map(id=>tasks.find(t=>t?.id===id)?.score);
  categories[key]=values.every(Number.isFinite)?round(mean(values)):null;
 }
 // Category-balanced aggregate, not raw Accuracy/RMSE averaging or a hardware ranking.
 const overall=complete?round(mean(Object.values(categories))):null;
 const seeds=complete?Math.min(...tasks.map(t=>t.nSeeds)):0;
 return {suiteId:suite.id,suiteName:suite.name,complete,overall,status:!complete?'incomplete':seeds>=5?'multi-seed descriptive':'exploratory',tasks,categories,scoring:'50 + 50 × (baselineError − customError)/(baselineError + customError + 10⁻⁶). The baseline error is the median of ReLU, Swish and GELU, and the aggregate weights task categories equally. Not statistical proof of superiority.',note:'Scores are self-reported browser measurements and are not verified by a trusted server. Same training protocol and seed pairing required.'};
}
