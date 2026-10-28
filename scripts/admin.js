/** Operator-only CLI. Never expose this file or the databases as static assets. */
import {resolve,join} from 'node:path';import {mkdirSync,readdirSync,statSync,unlinkSync,chmodSync} from 'node:fs';import {backup} from 'node:sqlite';import {ShareStore,ID} from '../server/store.js';
const [command,arg,confirm]=process.argv.slice(2);
if(!['reports','revoke','cleanup','backup'].includes(command)){console.error('Usage: node scripts/admin.js reports | cleanup | revoke <shareId> --confirm | backup <directory>');process.exit(2);}
const store=new ShareStore({path:process.env.DATA_PATH??resolve('.runtime/content.sqlite'),ledgerPath:process.env.LEDGER_PATH??resolve('.revocations/ledger.sqlite'),salt:process.env.RATE_SALT??'operator-not-used-for-rate-calculation'});
try{
 if(command==='reports')console.log(JSON.stringify(store.db.prepare('SELECT id,share_id,reason,created FROM reports ORDER BY created DESC LIMIT 100').all(),null,2));
 if(command==='revoke'){if(!ID.test(arg)||confirm!=='--confirm')throw new Error('32桁の共有IDと --confirm が必要です。');store.revoke(arg,Date.now());console.log('Share revoked. Definition and description are no longer served.');}
 if(command==='cleanup')console.log(JSON.stringify({purged:store.cleanup(Date.now())}));
 if(command==='backup'){
  if(!arg)throw new Error('独立したコンテンツバックアップ先を指定してください。');const dir=resolve(arg);mkdirSync(dir,{recursive:true,mode:0o700});
  const path=join(dir,'neurocurve-content-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');await backup(store.db,path);chmodSync(path,0o600);
  let pruned=0;for(const file of readdirSync(dir)){const p=join(dir,file);if(/^neurocurve-content-\d{4}-.*\.sqlite$/.test(file)&&statSync(p).mtimeMs<Date.now()-30*86400000){unlinkSync(p);pruned++;}}
  console.log(JSON.stringify({backup:path,pruned,notice:'Deletion ledger is NOT part of this snapshot. Preserve the current independent ledger across content restores.'}));
 }
}finally{store.close();}
