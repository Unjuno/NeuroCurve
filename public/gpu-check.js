const run=document.getElementById('run'),stop=document.getElementById('stop'),status=document.getElementById('status'),out=document.getElementById('result');let worker;
const reset=()=>{worker?.terminate();worker=null;run.disabled=false;stop.disabled=true;};
run.onclick=()=>{reset();run.disabled=true;stop.disabled=false;out.textContent='';status.textContent='実機GPU検証を開始';try{worker=new Worker('/gpu-smoke-worker.js',{type:'module'});}catch(e){status.textContent='Workerを起動できません。';out.textContent=String(e);reset();return;}
 worker.onmessage=({data:e})=>{if(e.type==='status')status.textContent=e.text;else if(e.type==='progress')status.textContent='GPU学習 '+e.progress.step+'/'+e.progress.steps;else if(e.type==='complete'){status.textContent='PASS: GPU実行と勾配検算が完了';out.textContent=JSON.stringify(e.result,null,2);reset();}else if(e.type==='error'){status.textContent='FAIL: GPU検証に失敗';out.textContent=e.message;reset();}};
 worker.onerror=e=>{status.textContent='FAIL: Worker実行エラー';out.textContent=e.message;reset();};worker.postMessage({type:'test'});
};stop.onclick=()=>{reset();status.textContent='ユーザーが検証を停止しました。';};
