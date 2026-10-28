import {readdirSync,readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const code=[...walk('public'),...walk('server'),...walk('scripts'),...walk('tests')].filter(p=>p.endsWith('.js')||p.endsWith('.mjs'));
for(const file of code){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)throw new Error(file+'\n'+r.stderr);}
for(const file of walk('public').filter(f=>f.endsWith('.js'))){const s=readFileSync(file,'utf8');if(/\beval\s*\(|\bnew\s+Function\s*\(/.test(s))throw new Error('Arbitrary-code execution: '+file);if(/\b(?:localStorage|sessionStorage|indexedDB)\s*\./.test(s))throw new Error('Automatic browser storage: '+file);}
const hash=createHash('sha256').update(readFileSync('public/data/digits-v1.json')).digest('hex');const meta=JSON.parse(readFileSync('public/data/digits-meta.json','utf8'));if(hash!==meta.sha256)throw new Error('Dataset integrity mismatch');
for(const file of ['LICENSE','README.md','public/policy.html','docs/OPERATIONS.md'])if(!existsSync(file))throw new Error('Missing release file: '+file);
console.log(JSON.stringify({syntaxChecked:code.length,arbitraryCodeEvaluation:false,automaticBrowserPersistence:false,datasetHash:hash}));
