/** Dependency-free build of trusted application sources. Never compiles user input. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
const publicDir=new URL('../public/',import.meta.url);
const read=name=>readFileSync(new URL(name,publicDir),'utf8');
const digits=read('data/digits-v1.json');
const meta=JSON.parse(read('data/digits-meta.json'));
if(createHash('sha256').update(digits).digest('hex')!==meta.sha256)throw new Error('Digits integrity mismatch');
const order=['core/expression.js','core/activation.js','core/data.js','core/training.js','core/webgpu.js','core/export.js'];
function rewriteImports(text,name){return text.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,dep)=>'const {'+names+'}=globalThis.NC_BUNDLE['+JSON.stringify(posix.normalize(posix.join(posix.dirname(name),dep)))+'];');}
function modules({withDigits=false}={}){
 let text='globalThis.NC_BUNDLE={};\n';
 for(const name of order){let source=read(name);const exported=[...source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/g)].map(m=>m[1]);
  if(name==='core/data.js')source=source.replace(/export async function loadDataset\(name\)\{[\s\S]*$/,withDigits?'export async function loadDataset(name){return makeDataset(name,name===\'digits\'?'+digits.trim()+':null);}\n':"export async function loadDataset(name){if(name==='digits')throw new Error('Use packaged Worker for Digits');return makeDataset(name);}\n");
  source=rewriteImports(source,name).replace(/\bexport\s+/g,'');
  text+='globalThis.NC_BUNDLE['+JSON.stringify(name)+']=(()=>{\n'+source+'\nreturn {'+exported.join(',')+'};})();\n';
 }
 return text;
}
const worker=modules({withDigits:true})+'\n'+rewriteImports(read('worker.js'),'worker.js');
let main=rewriteImports(read('app.js'),'app.js').replace("new Worker('/worker.js',{type:'module'})","new Worker(window.NC_OFFLINE_WORKER_URL)");
const source='window.NC_OFFLINE_MODE=true;\n'+modules()+'\nwindow.NC_OFFLINE_WORKER_URL=URL.createObjectURL(new Blob(['+JSON.stringify(worker)+'],{type:"text/javascript"}));\n(()=>{'+main+'})();';
let html=read('index.html').replace(/<script[^>]*src=[^>]*>\s*<\/script>/g,'').replace(/<link[^>]+>/g,'');
html=html.replace('</head>','<style>'+read('style.css')+'</style></head>').replace(/href="\/"/g,'href="#main"').replace(/href="\/policy.html"/g,'href="#offline-policy"');
html=html.replace('<section class="intro">','<div class="notice"><strong>端末内版</strong><span>解析と学習はローカルで動作します。対応端末ではWebGPU、その他はCPUで処理します。投稿・削除・共有URLの発行にはサーバー版が必要です。</span></div><section class="intro">');
// The standalone Sites build has no server-side share API. Keep sharing and
// moderation controls unavailable, and replace the hosted edition's retention
// statement so the interface never implies that local work is uploaded.
html=html.replace('作業内容は自動保存しません。タブを閉じると失われます。公開投稿だけが、同意した期限までサーバーに保存されます。','作業内容・学習結果は自動保存も送信もしません。共有投稿・削除・通報はこの端末内版では利用できません。');
html=html.replace('<button id="manage-button"','<button disabled id="manage-button"').replace('<button id="report-button"','<button disabled id="report-button"');
const policy=read('policy.html').match(/<main class="policy">([\s\S]*?)<\/main>/)[1].replace(/<a href="\/">[^<]*<\/a>/g,'');
html=html.replace('</main>','<details id="offline-policy" class="panel policy"><summary>利用条件・プライバシー・データ出典</summary>'+policy+'</details></main>');
html=html.replace('</body>','<script>'+source.replace(/<\/script/gi,'<\\/script')+'</script></body>');
mkdirSync('dist',{recursive:true});writeFileSync('dist/NeuroCurve-local.html',html);writeFileSync('dist/worker-validation.js',worker);
console.log(JSON.stringify({file:'dist/NeuroCurve-local.html',bytes:Buffer.byteLength(html),digitsHash:meta.sha256,externalRequests:false,sharingEnabled:false}));
