import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { defaultDefinition } from '../public/core/activation.js';
import { handleSitesRequest } from '../sites/worker.js';

const sha = s => createHash('sha256').update(s).digest('hex');
const createPost = () => {
  const secret = randomBytes(32).toString('hex');
  return { secret, body: {
    shareId: randomBytes(16).toString('hex'),
    requestId: randomBytes(16).toString('hex'),
    deleteHash: sha(secret), definition: defaultDefinition(), title: '<b>Valleys</b>',
    description: 'A non-monotonic curve', days: 7, consent: true,
    termsVersion: '2026-10-v1', reuse: 'local-only'
  }};
};
function mockD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../sites/schema.sql', import.meta.url), 'utf8'));
  return {
    db,
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...args) {
          return {
            first: async () => statement.get(...args) || null,
            run: async () => { const result = statement.run(...args); return { success: true, meta: {changes: result.changes} }; },
            all: async () => ({ results: statement.all(...args) })
          };
        },
        first: async () => statement.get() || null,
        run: async () => { const result = statement.run(); return {success:true,meta:{changes:result.changes}}; },
        all: async () => ({results: statement.all()})
      };
    }
  };
}
function mockR2() {
  const data = new Map();
  return {
    data, failReads: false, failWrites: false,
    async get(key) { if (this.failReads) throw new Error('R2 offline'); return data.has(key) ? {body: data.get(key)} : null; },
    async put(key, value) { if (this.failWrites) throw new Error('R2 unavailable'); data.set(key, value); }
  };
}
function harness() {
  const db = mockD1(), revocations = mockR2();
  let now = Date.UTC(2026, 9, 28);
  const env = {DB:db, REVOCATIONS:revocations, RATE_SALT:'test-hmac-secret-at-least-32-characters',
    ASSETS:{async fetch(request){const url=new URL(request.url);if(url.pathname==='/index.html')return new Response('<html><head><title>NeuroCurve — 活性化関数ラボ</title><!-- SHARE_META --></head><body>Hello</body></html>',{headers:{'Content-Type':'text/html'}}); if(url.pathname==='/og-default.png')return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}}); return new Response('static asset',{status:200});}}
  };
  const req=(path,options={})=>handleSitesRequest(new Request('https://neurocurve.example'+path,{
    ...options,headers:{origin:'https://neurocurve.example','Content-Type':'application/json',...(options.headers??{})}
  }),env,{now:()=>now});
  return {env,db,revocations,req,clock:t=>{now=t},now};
}
const post=(req,body)=>req('/api/shares',{method:'POST',body:JSON.stringify(body)});

test('operator can review reports and revoke only with the configured secret',async()=>{
  const {req,env,db}=harness(),{body}=createPost();
  env.ADMIN_TOKEN='test-admin-secret-with-at-least-32-characters';
  assert.equal((await post(req,body)).status,201);
  assert.equal((await req('/api/reports',{method:'POST',body:JSON.stringify({shareId:body.shareId,reason:'Test report'})})).status,202);
  const auth={Authorization:'Bearer '+env.ADMIN_TOKEN};
  assert.equal((await req('/api/admin/reports')).status,404);
  assert.equal((await req('/api/admin/revoke',{method:'POST',body:JSON.stringify({shareId:body.shareId})})).status,404);
  const result=await req('/api/admin/reports',{headers:auth});
  assert.equal(result.status,200);const reports=await result.json();assert.equal(reports.reports.length,1);assert.equal(reports.reports[0].share_id,body.shareId);
  const saved=db.db.prepare('SELECT * FROM shares WHERE id=?').get(body.shareId);
  assert.equal((await req('/api/admin/revoke',{method:'POST',headers:auth,body:JSON.stringify({shareId:body.shareId})})).status,204);
  assert.equal((await req('/api/shares/'+body.shareId)).status,404);
  db.db.prepare('INSERT INTO shares (id,request_id,request_hash,delete_hash,payload,created,expires) VALUES (?,?,?,?,?,?,?)').run(...Object.values(saved));
  assert.equal((await req('/api/shares/'+body.shareId)).status,404);
});

test('D1 + R2: consent and input validation prevent anonymous spam', async()=>{
  const {req}=harness(),{body}=createPost();
  assert.equal((await post(req,{...body,consent:false})).status,400);
  assert.equal((await post(req,{...body,days:14})).status,400);
  assert.equal((await post(req,{...body,definition:{kind:'script',engine:'neurocurve-1',schema:1,domain:[-1,1]}})).status,400);
  assert.equal((await req('/api/shares',{method:'GET'})).status,404);
});

test('anonymous share: idempotent create, stable URL, no key leak and XSS-safe SSR',async()=>{
  const {req}=harness(),{body,secret}=createPost();
  const r=await post(req,body);assert.equal(r.status,201);const data=await r.json();
  assert.equal(data.shareId,body.shareId);assert.equal(data.url,`https://neurocurve.example/f/${body.shareId}`);
  assert.equal((await post(req,body)).status,200);
  assert.equal((await post(req,{...body,title:'changed'})).status,409);
  const fetched=await req('/api/shares/'+body.shareId);const serialized=await fetched.text();
  assert.equal(fetched.status,200);assert.ok(!serialized.includes(secret));assert.ok(!serialized.includes(body.deleteHash));assert.ok(!serialized.includes(body.requestId));
  assert.equal(fetched.headers.get('cache-control'),'no-store');
  const html=await (await req('/f/'+body.shareId)).text();
  assert.ok(html.includes('&lt;b&gt;Valleys&lt;/b&gt;'));assert.ok(!html.includes('<b>Valleys</b>'));
  assert.equal((await req('/f/'+body.shareId+'/og.png')).status,200);
});

test('expiry invalidates HTML / JSON / image on boundary and retires id despite clock rollback',async()=>{
  const {req,now,clock,revocations}=harness(),{body}=createPost();
  assert.equal((await post(req,body)).status,201);
  clock(now+7*86400000-1);assert.equal((await req('/api/shares/'+body.shareId)).status,200);
  clock(now+7*86400000);
  for(const path of ['/api/shares/'+body.shareId,'/f/'+body.shareId,'/f/'+body.shareId+'/og.png']){
    const response=await req(path);assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal(revocations.data.size,1);
  clock(now+1000);assert.equal((await req('/api/shares/'+body.shareId)).status,404);
  assert.equal((await post(req,body)).status,409);
});

test('correct secret deletes; wrong secret rejected; deleting survives content restore',async()=>{
  const {req,db,revocations}=harness(),{body,secret}=createPost();
  await post(req,body);
  const savedRow=db.db.prepare('SELECT * FROM shares WHERE id=?').get(body.shareId);
  const path='/api/shares/'+body.shareId;
  assert.equal((await req(path,{method:'DELETE',headers:{Authorization:'Bearer '+randomBytes(32).toString('hex')}})).status,404);
  assert.equal((await req(path,{method:'DELETE',headers:{Authorization:'Bearer '+secret}})).status,204);
  assert.equal((await req(path)).status,404);
  db.db.prepare('INSERT INTO shares (id,request_id,request_hash,delete_hash,payload,created,expires) VALUES (?,?,?,?,?,?,?)').run(...Object.values(savedRow));
  assert.equal((await req(path)).status,404);
  revocations.failReads=true;
  assert.equal((await req(path)).status,503, 'R2 outage must never expose restored content');
});

test('origin mismatch, oversized body, missing revocations binding and read outage fail closed',async()=>{
  const {req,env,revocations}=harness(),{body}=createPost();
  const evil=await req('/api/shares',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify(body)});
  assert.equal(evil.status,403);
  assert.equal((await post(req,{...body,description:'X'.repeat(66_000)})).status,413);
  assert.equal((await post(req,body)).status,201);
  revocations.failReads=true;
  assert.equal((await req('/api/shares/'+body.shareId)).status,503);
  revocations.failReads=false;
  delete env.REVOCATIONS;
  assert.equal((await req('/api/shares/'+body.shareId)).status,503);
});

test('public home is indexable, shares not indexable, terms and backend metadata preserved',async()=>{
  const {req}=harness();
  assert.equal((await req('/')).status,200);
  const c=await (await req('/api/config')).json();
  assert.equal(c.sharingEnabled,true);assert.equal(c.termsVersion,'2026-10-v1');
  const {body}=createPost();await post(req,body);
  const s=await req('/f/'+body.shareId);
  assert.match(s.headers.get('x-robots-tag'),/noindex/);
  assert.match(s.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});

test('shared HTML cannot leak when its expiry occurs during a slow asset fetch',async()=>{
  const {req,env,clock,now}=harness(),{body}=createPost();
  await post(req,body);
  const original=env.ASSETS.fetch.bind(env.ASSETS);
  let resume,entered=false;
  env.ASSETS.fetch=async request=>{
    if(new URL(request.url).pathname==='/index.html'){
      entered=true;
      await new Promise(resolve=>{resume=resolve});
    }
    return original(request);
  };
  const pending=req('/f/'+body.shareId);
  for(let i=0;i<80&&!entered;i++)await new Promise(r=>setTimeout(r,1));
  assert.ok(entered,'asset request must be pending');
  clock(now+7*86400000);
  resume();
  assert.equal((await pending).status,404);
});
