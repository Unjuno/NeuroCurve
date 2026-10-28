import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,copyFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,createHash} from 'node:crypto';
import {ShareStore} from '../server/store.js';import {createApp} from '../server/app.js';import {defaultDefinition} from '../public/core/activation.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(){const secret=randomBytes(32).toString('hex');return {secret,body:{shareId:randomBytes(16).toString('hex'),requestId:randomBytes(16).toString('hex'),deleteHash:hash(secret),definition:defaultDefinition(),title:'My valleys',description:'テスト',days:7,consent:true,termsVersion:'2026-10-v1',reuse:'local-only'}};}
function tempStore(){const dir=mkdtempSync(join(tmpdir(),'neurocurve-'));return {dir,store:new ShareStore({path:join(dir,'content.sqlite'),ledgerPath:join(dir,'ledger.sqlite'),salt:'unit-test-salt-32-characters-long!!'})};}
async function serve(fn,options={}){const {dir,store}=tempStore();let now=Date.UTC(2026,9,28);const app=createApp({store,now:()=>now,publicOrigin:'http://localhost',publicDir:new URL('../public',import.meta.url).pathname,rateLimit:50,...options});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`,req=(path,opt={})=>fetch(url+path,{...opt,headers:{Origin:'http://localhost','Content-Type':'application/json',...opt.headers}});try{await fn({req,store,clock:x=>now=x,now,dir});}finally{await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}}
const post=(req,b)=>req('/api/shares',{method:'POST',body:JSON.stringify(b)});
test('opt-in is required by API as well as UI',()=>serve(async({req})=>{const {body}=fixture();body.consent=false;assert.equal((await post(req,body)).status,400);}));
test('create, idempotent retry, conflict and no secret leakage',()=>serve(async({req})=>{const {body}=fixture(),a=await post(req,body),v=await a.json();assert.equal(a.status,201);assert.equal(v.shareId,body.shareId);assert.equal((await post(req,body)).status,200);assert.equal((await post(req,{...body,title:'changed'})).status,409);const get=await req('/api/shares/'+body.shareId),s=await get.text();assert.equal(get.status,200);assert.ok(!s.includes('deleteHash'));assert.ok(!s.includes('requestId'));assert.equal(get.headers.get('cache-control'),'no-store');}));
test('expiry blocks HTML, JSON and PNG at exact boundary',()=>serve(async({req,clock,now})=>{const {body}=fixture();await post(req,body);clock(now+7*86400000-1);assert.equal((await req('/api/shares/'+body.shareId)).status,200);clock(now+7*86400000);for(const p of ['/api/shares/'+body.shareId,'/f/'+body.shareId,'/f/'+body.shareId+'/og.png']){const r=await req(p);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');}}));
test('wrong key fails; correct deletion immediately blocks all routes',()=>serve(async({req})=>{const {body,secret}=fixture();await post(req,body);const path='/api/shares/'+body.shareId;assert.equal((await req(path,{method:'DELETE',headers:{Authorization:'Bearer '+randomBytes(32).toString('hex')}})).status,404);assert.equal((await req(path)).status,200);assert.equal((await req(path,{method:'DELETE',headers:{Authorization:'Bearer '+secret}})).status,204);assert.equal((await req(path)).status,404);assert.equal((await req('/f/'+body.shareId+'/og.png')).status,404);assert.equal((await post(req,body)).status,409);}));
test('HTML escapes user text; OG is an actual PNG',()=>serve(async({req})=>{const {body}=fixture();body.title='<script>alert(1)</script>';await post(req,body);const r=await req('/f/'+body.shareId),html=await r.text();assert.ok(!html.includes('<script>alert'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));const p=await req('/f/'+body.shareId+'/og.png');assert.equal(p.headers.get('content-type'),'image/png');assert.deepEqual([...new Uint8Array(await p.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);}));
test('input length, content type, origin and listing restrictions',()=>serve(async({req})=>{const {body}=fixture();assert.equal((await post(req,{...body,description:'a'.repeat(66000)})).status,413);assert.equal((await req('/api/shares',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);assert.equal((await req('/api/shares',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify(body)})).status,403);assert.equal((await req('/api/shares')).status,404);assert.equal((await req('/sitemap.xml')).status,404);}));
test('deletion ledger prevents resurrection after content restore',()=>{const {dir,store}=tempStore(),{body,secret}=fixture(),now=10000000;try{store.create(body,'ip',now,3);store.checkpoint();const snapshot=join(dir,'backup.sqlite');copyFileSync(join(dir,'content.sqlite'),snapshot);store.remove(body.shareId,secret,now+1);store.close();for(const suffix of ['-wal','-shm'])rmSync(join(dir,'content.sqlite'+suffix),{force:true});copyFileSync(snapshot,join(dir,'content.sqlite'));const restored=new ShareStore({path:join(dir,'content.sqlite'),ledgerPath:join(dir,'ledger.sqlite'),salt:'test'});assert.equal(restored.get(body.shareId,now+2),null);restored.close();}finally{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});}});
test('missing independent ledger causes fail closed on existing content DB',()=>{const {dir,store}=tempStore();store.create(fixture().body,'ip',10000,3);store.close();rmSync(join(dir,'ledger.sqlite'));assert.throws(()=>new ShareStore({path:join(dir,'content.sqlite'),ledgerPath:join(dir,'ledger.sqlite'),salt:'test'}),/ledger|台帳/);rmSync(dir,{recursive:true,force:true});});
test('per-IP rate and expiry cleanup',()=>{const {dir,store}=tempStore();try{for(let i=0;i<3;i++)store.create(fixture().body,'same-ip',10000,3);assert.throws(()=>store.create(fixture().body,'same-ip',10000,3),/回数/);store.cleanup(10000+8*86400000);assert.equal(store.db.prepare('SELECT count(*) AS n FROM shares').get().n,0);}finally{store.close();rmSync(dir,{recursive:true,force:true});}});

test('only explicitly trusted proxy peers can supply a single valid client address',async()=>{
  const {clientAddress}=await import('../server/app.js');
  const request={socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'192.0.2.7'}};
  assert.equal(clientAddress(request,[]),'127.0.0.1');
  assert.equal(clientAddress(request,['127.0.0.1']),'192.0.2.7');
  request.headers['x-real-ip']='192.0.2.7, 10.0.0.1';
  assert.equal(clientAddress(request,['127.0.0.1']),'127.0.0.1');
});

test('once expiration is observed, a backwards wall clock cannot revive the share',()=>{
  const {dir,store}=tempStore(),{body}=fixture(),start=10000;
  try{store.create(body,'ip',start,3);assert.equal(store.get(body.shareId,start+8*86400000),null);assert.equal(store.get(body.shareId,start+1),null);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('content and revocation stores cannot use the same database file',()=>{
 const dir=mkdtempSync(join(tmpdir(),'neurocurve-collision-')),path=join(dir,'both.sqlite');
 try{assert.throws(()=>new ShareStore({path,ledgerPath:path,salt:'test'}),/別|distinct|independent/);}finally{rmSync(dir,{recursive:true,force:true});}
});


test('deletion while shared HTML is loading cannot leak a stale 200 response',async()=>{
 let release,entered=false;
 const loader=async()=>{entered=true;await new Promise(r=>release=r);return '<html><head><title>NeuroCurve — 活性化関数ラボ</title><!-- SHARE_META --></head></html>';};
 await serve(async({req})=>{const {body,secret}=fixture();await post(req,body);const pending=req('/f/'+body.shareId);
  for(let i=0;i<30&&!entered;i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(entered,'shared HTML should use the injected asynchronous reader');
  try{const deleted=await req('/api/shares/'+body.shareId,{method:'DELETE',headers:{Authorization:'Bearer '+secret}});assert.equal(deleted.status,204);}finally{release();}
  assert.equal((await pending).status,404);
 },{readStatic:loader});
});

test('public landing page is discoverable while unlisted shared pages have noindex',()=>serve(async({req})=>{
 const root=await req('/'),home=await root.text();assert.equal(root.status,200);
 assert.ok(!/noindex/i.test(root.headers.get('x-robots-tag')??''));
 assert.ok(!/<meta name="robots" content="noindex/i.test(home));
 const {body}=fixture();await post(req,body);const share=await req('/f/'+body.shareId),html=await share.text();
 assert.match(share.headers.get('x-robots-tag')??'',/noindex/);
 assert.match(html,/name="robots" content="noindex/);
}));
