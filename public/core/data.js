export function rng(seed){let state=seed>>>0;return ()=>{let t=state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function normal(random){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
export function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function makeDataset(name,digitRows=null){
  const random=rng(20261028);let rows,task,outputs;
  if(name==='moons'){
    rows=Array.from({length:3000},(_,i)=>{const y=i%2,t=random()*Math.PI;return {id:i,x:[(y?1-Math.cos(t):Math.cos(t))+.2*normal(random),(y?.5-Math.sin(t):Math.sin(t))+.2*normal(random)],y};});task='classification';outputs=2;
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
  return {name,version:name==='digits'?'digits-uci-v1':'synthetic-v1',task,inputs,outputs,train:shuffle(train,rng(888)),validation,test,preprocessing:{mean,scale,fitOn:'train only',digits:name==='digits'?'pixel / 16':null},splitSeed:314159,generationSeed:20261028};
}
export async function loadDataset(name){
  if(name!=='digits')return makeDataset(name);
  const response=await fetch('/data/digits-v1.json',{cache:'force-cache'});if(!response.ok)throw new Error('共通Digitsデータを取得できません。');
  const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!=='f984821d12b8b038b539d9ce08387af6ec203cb77e86039f8bb5c25226d2a3ac')throw new Error('Digitsデータのハッシュが一致しません。');
  return makeDataset(name,JSON.parse(new TextDecoder().decode(bytes)));
}
