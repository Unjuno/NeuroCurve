import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';import {Worker} from 'node:worker_threads';import {defaultDefinition} from '../public/core/activation.js';
test('single-file build has no external script imports and parses',()=>{
 execFileSync(process.execPath,['scripts/build-offline.js']);const html=readFileSync('dist/NeuroCurve-local.html','utf8');
 assert.ok(!/<script[^>]*\bsrc=/.test(html));assert.ok(!/<link[^>]*\bhref=/.test(html));
 const script=html.match(/<script>([\s\S]*)<\/script>/)[1];new vm.Script(script);assert.ok(script.includes('NC_OFFLINE_MODE=true'));
 assert.match(html,/<button disabled id="manage-button"/);assert.match(html,/<button disabled id="report-button"/);
 const policy=html.match(/<details id="offline-policy"[\s\S]*?<\/details>/)[0];
 assert.match(policy,/URLでの投稿・削除・通報は使えません/);assert.doesNotMatch(policy,/本番公開前|1時間ごとに整理|バックアップを設定する場合/);
});
test('packaged offline Worker trains on embedded Digits, without network',async()=>{
 const source=readFileSync('dist/worker-validation.js','utf8');
 const dir=mkdtempSync(join(tmpdir(),'nc-offline-worker-')),path=join(dir,'worker.cjs');writeFileSync(path,"const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:x=>parentPort.postMessage(x)};"+source+";parentPort.on('message',data=>self.onmessage({data}));");const w=new Worker(path);
 const result=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Offline worker timeout')),30000);w.on('error',reject);w.on('message',e=>{if(e.type==='complete'){clearTimeout(t);resolve(e.result);}if(e.type==='error'){clearTimeout(t);reject(new Error(e.message));}});w.postMessage({type:'start',definition:defaultDefinition(),dataset:'digits',mode:'quick'});}).finally(async()=>{await w.terminate();rmSync(dir,{recursive:true,force:true});});
 assert.equal(result.runs.length,4);assert.equal(result.runs.filter(r=>r.failed).length,0);assert.equal(result.dataset,'digits');
});
