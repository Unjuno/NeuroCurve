/** Build ChatGPT Sites static browser edition with benchmark suite, no server APIs. */
import {cpSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../',import.meta.url));
const dist=new URL('../dist/',import.meta.url);
rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});
cpSync(new URL('../public/',import.meta.url),dist,{recursive:true});
execFileSync(process.execPath,['scripts/build-offline.js'],{cwd:path,stdio:'inherit'});
copyFileSync(new URL('../dist/NeuroCurve-local.html',import.meta.url),new URL('../dist/index.html',import.meta.url));
console.log(JSON.stringify({directory:'dist',standalone:true,sharingEnabled:false,multiTaskBenchmark:true}));
