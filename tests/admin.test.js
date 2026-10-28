import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,writeFileSync,utimesSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {ShareStore,sha} from '../server/store.js';
import {defaultDefinition} from '../public/core/activation.js';

test('operator CLI backups are valid, pruning is scoped, and revoke preserves independent ledger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'neurocurve-admin-test-'));
 const path=join(dir,'content.sqlite'),ledgerPath=join(dir,'independent','ledger.sqlite'),backups=join(dir,'backups');
 const env={...process.env,DATA_PATH:path,LEDGER_PATH:ledgerPath,RATE_SALT:'test-only-local-rate-salt-not-a-production-secret'};
 const run=(...args)=>{const r=spawnSync(process.execPath,['scripts/admin.js',...args],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
 try {
  const store=new ShareStore({path,ledgerPath,salt:env.RATE_SALT});
  const shareId='a'.repeat(32),secret='b'.repeat(64);
  store.create({shareId,requestId:'c'.repeat(32),deleteHash:sha(secret),definition:defaultDefinition(),title:'CLI test',description:'Synthetic test data',days:7,consent:true,termsVersion:'2026-10-v1',reuse:'local-only'},'127.0.0.1',Date.now());
  store.report(shareId,'operator smoke test','127.0.0.1',Date.now());store.close();
  assert.equal(JSON.parse(run('reports')).length,1);
  const first=JSON.parse(run('backup',backups));
  assert.equal(statSync(first.backup).mode&0o777,0o600);
  const copy=new DatabaseSync(first.backup,{readOnly:true});assert.equal(copy.prepare('SELECT COUNT(*) n FROM shares').get().n,1);copy.close();
  const old=join(backups,'neurocurve-content-2020-01-01T00-00-00-000Z.sqlite');writeFileSync(old,'old');utimesSync(old,0,0);
  const unrelated=join(backups,'unrelated.sqlite');writeFileSync(unrelated,'keep');utimesSync(unrelated,0,0);
  assert.equal(JSON.parse(run('backup',backups)).pruned,1);assert.ok(readdirSync(backups).includes('unrelated.sqlite'));
  run('revoke',shareId,'--confirm');run('cleanup');
  const current=new ShareStore({path,ledgerPath,salt:env.RATE_SALT});assert.equal(current.get(shareId,Date.now()),null);assert.ok(current.retired(shareId));current.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
