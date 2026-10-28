export function rng(seed){let state=seed>>>0;return ()=>{let t=state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
export function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function makeDataset(name,digitRows=null){
  const random=rng(20261028);let rows,task,outputs;
  if(name==='moons'){
    rows=Array.from({length:3000},(_,i)=>{const y=i%2,t=random()*Math.PI;return {id:i,x:[(y?1-Math.cos(t):Math.cos(t))+.2*normal(random),(y?.5-Math.sin(t):Math.sin(t))+.2*normal(random)],y};});task='classification';outputs=2;
  }else if(name==='circles'){
    rows=Array.from({length:2400},(_,i)=>{const y=i%2,a=2*Math.PI*random(),r=y?.75:1.65;return {id:i,x:[r*Math.cos(a)+.12*normal(random),r*Math.sin(a)+.12*normal(random)],y};});task='classification';outputs=2;
  }else if(name==='spiral'){
    rows=Array.from({length:2400},(_,i)=>{const y=i%3,t=.08+.92*random(),a=y*2*Math.PI/3+3*Math.PI*t,r=.15+2.8*t;return {id:i,x:[r*Math.cos(a)+.12*normal(random),r*Math.sin(a)+.12*normal(random)],y};});task='classification';outputs=3;
  }else if(name==='xor'){
    rows=Array.from({length:2400},(_,i)=>{const x=4*(random()-.5),z=4*(random()-.5),y=(x*z<0)?1:0;return {id:i,x:[x+.12*normal(random),z+.12*normal(random)],y};});task='classification';outputs=2;
  }else if(name==='chirp'){
    rows=Array.from({length:2400},(_,i)=>{const x=2*random()-1,t=(x+1)/2;return {id:i,x:[x],y:Math.sin(2*Math.PI*(1.4*t+3*t*t))+.15*Math.cos(20*Math.PI*t)};});task='regression';outputs=1;
  }else if(['iris','wine','breast'].includes(name)){
    const shape={iris:[150,4,3],wine:[178,13,3],breast:[569,30,2]}[name];
    if(!Array.isArray(digitRows)||digitRows.length!==shape[0]||digitRows.some(r=>!Array.isArray(r)||r.length!==shape[1]+1||r.slice(0,-1).some(v=>!Number.isFinite(v))||!Number.isInteger(r.at(-1))||r.at(-1)<0||r.at(-1)>=shape[2]))throw new Error('表形式データの形式が不正です。');
    rows=digitRows.map((r,i)=>({id:i,x:r.slice(0,-1),y:r.at(-1)}));task='classification';outputs=shape[2];
  }else if(name==='wave'){
    rows=Array.from({length:2400},(_,i)=>{const x=-Math.PI+2*Math.PI*random();return {id:i,x:[x],y:Math.sin(2*x)+.3*Math.sin(10*x)+.1*Math.sin(24*x)};});task='regression';outputs=1;
  }else if(name==='digits'){
    if(!Array.isArray(digitRows)||digitRows.length!==1797||digitRows.some(r=>!Array.isArray(r)||r.length!==65||r.some(v=>!Number.isInteger(v)||v<0||v>16)||r[64]>9))throw new Error('Digitsデータの形式が不正です。');
    rows=digitRows.map((r,i)=>({id:i,x:r.slice(0,64).map(v=>v/16),y:r[64]}));task='classification';outputs=10;
  }else throw new Error('共通データセットから選択してください。');
  const train=[],validation=[],test=[];
  const groups=task==='classification'?Array.from({length:outputs},(_,k)=>rows.filter(r=>r.y===k)):[rows];
  for(const group of groups){const a=shuffle(group,rng(314159+group[0].id)),n=Math.floor(a.length*.7),v=Math.floor(a.length*.15);train.push(...a.slice(0,n));validation.push(...a.slice(n,n+v));test.push(...a.slice(n+v));}
  const inputs=rows[0].x.length,mean=new Array(inputs).fill(0),scale=new Array(inputs).fill(1);
  if(name!=='digits'){
    for(let j=0;j<inputs;j++){mean[j]=train.reduce((s,r)=>s+r.x[j],0)/train.length;scale[j]=Math.sqrt(train.reduce((s,r)=>s+(r.x[j]-mean[j])**2,0)/train.length)||1;}
    for(const r of rows)r.x=r.x.map((v,j)=>(v-mean[j])/scale[j]);
  }
  return {name,version:name==='digits'?'digits-uci-v1':['iris','wine','breast'].includes(name)?name+'-uci-v1':['moons','wave'].includes(name)?'synthetic-v1':'synthetic-v2',task,inputs,outputs,train:shuffle(train,rng(888)),validation,test,preprocessing:{mean,scale,fitOn:'train only',digits:name==='digits'?'pixel / 16':null},splitSeed:314159,generationSeed:20261028};
}
export const FILE_DATASETS=Object.freeze({
  digits:{file:'digits-v1.json',sha256:'f984821d12b8b038b539d9ce08387af6ec203cb77e86039f8bb5c25226d2a3ac'},
  iris:{file:'iris-v1.json',sha256:'dc718bd91e03ac9821a46330c798d75d14a45128236a773f68e7911cf211c9f8'},wine:{file:'wine-v1.json',sha256:'87b9dae4ade42f3b0c03a17508471b2fa0fd4d6c53b2582dd4ee4004bf2106e5'},breast:{file:'breast-v1.json',sha256:'c6c378a8c3e796c65dbf88317d0e6c89930f9c8e714c8cffb9c1b97dd84707e0'}
});
export async function loadDataset(name){
  if(!Object.hasOwn(FILE_DATASETS,name))return makeDataset(name);
  const source=FILE_DATASETS[name];const response=await fetch('/data/'+source.file,{cache:'force-cache'});if(!response.ok)throw new Error('共通データセット '+name+' を取得できません。');
  const bytes=await response.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==source.sha256)throw new Error('共通データのハッシュが一致しません: '+name);
  return makeDataset(name,JSON.parse(new TextDecoder().decode(bytes)));
}
