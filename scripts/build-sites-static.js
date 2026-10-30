/** Build ChatGPT Sites static browser edition with benchmark suite, no server APIs. */
import {cpSync,copyFileSync,mkdirSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../',import.meta.url));
const dist=new URL('../dist/',import.meta.url);
rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
cpSync(new URL('../public/',import.meta.url),dist,{recursive:true});
execFileSync(process.execPath,['scripts/build-offline.js'],{cwd:path,stdio:'inherit'});
copyFileSync(new URL('../dist/NeuroCurve-local.html',import.meta.url),new URL('../dist/index.html',import.meta.url));
const offline=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const content=offline.match(/<details id="offline-policy"[^>]*><summary>[^<]*<\/summary>([\s\S]*?)<\/details>/)[1];
const policyUrl=new URL('../dist/policy.html',import.meta.url);
const policy=readFileSync(policyUrl,'utf8').replace(/<main class="policy">[\s\S]*?<\/main>/,'<main class="policy"><a href="/">← NeuroCurveに戻る</a>'+content+'</main>');
writeFileSync(policyUrl,policy);
console.log(JSON.stringify({directory:'dist',standalone:true,sharingEnabled:false,multiTaskBenchmark:true}));
