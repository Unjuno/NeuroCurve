/**
 * NeuroCurve ChatGPT Sites compatibility candidate.
 * Cloudflare-style Web Worker API: D1 (DB), independent R2 tombstones
 * (REVOCATIONS), static assets (ASSETS). All ML stays on the visitor's device.
 * Exact Site build shape/binding names must be checked by Work before publishing.
 */
import {validateDefinition} from '../public/core/activation.js';

const ID=/^[a-f0-9]{32}$/, HASH=/^[a-f0-9]{64}$/;
const TE=new TextEncoder();
const DELETE_HEADER=/^Bearer ([a-f0-9]{64})$/;
const DATA_LIMIT=65536;
const LIFETIMES=[7,30,365,null];
const MIME='application/json; charset=utf-8';
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const json=(status,value)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':MIME}});
const unavailable=()=>json(404,{error:'存在しないか、公開が終了しています。'});
const textSafe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canonical=o=>Array.isArray(o)?'['+o.map(canonical).join(',')+']':o&&typeof o==='object'?'{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}':JSON.stringify(o);
async function sha(value){const b=await crypto.subtle.digest('SHA-256',TE.encode(value));return Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');}
function sameHex(a,b){if(typeof a!=='string'||typeof b!=='string')return false;let mismatch=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return mismatch===0;}
function assertStore(env){if(!env?.DB||!env.REVOCATIONS||typeof env.REVOCATIONS.get!=='function'||typeof env.REVOCATIONS.put!=='function')throw new HttpError(503,'共有ストレージを利用できません。');}
async function ipHash(req,env){const ip=req.headers.get('CF-Connecting-IP')||'unknown';if(typeof env.RATE_SALT!=='string'||env.RATE_SALT.length<32)throw new HttpError(503,'共有サービスの設定が不足しています。');const key=await crypto.subtle.importKey('raw',TE.encode(env.RATE_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign']);const h=await crypto.subtle.sign('HMAC',key,TE.encode(ip));return Array.from(new Uint8Array(h),n=>n.toString(16).padStart(2,'0')).join('');}
async function takeRate(env,key,max,windowMs,now){
 // Atomic per-key rate update. This limit is not an identity/security guarantee.
 const row=await env.DB.prepare('INSERT INTO limits (key,n,until_ms) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN until_ms<=? THEN 1 ELSE n+1 END, until_ms=CASE WHEN until_ms<=? THEN ? ELSE until_ms END RETURNING n').bind(key,1,now+windowMs,now,now,now+windowMs).first();
 if(row.n>max)throw new HttpError(429,'利用回数の上限です。時間をおいて再試行してください。');
}
async function bodyJSON(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||'')||req.headers.get('content-encoding'))throw new HttpError(415,'application/jsonのみ受け付けます。');
 const len=Number(req.headers.get('content-length'));
 if(len>DATA_LIMIT)throw new HttpError(413,'投稿は64 KiB以内にしてください。');
 let size=0;const parts=[];const stream=req.body?.getReader();if(!stream)throw new HttpError(400,'JSONを読み取れません。');
 try{while(true){const {done,value}=await stream.read();if(done)break;size+=value.length;if(size>DATA_LIMIT){await stream.cancel().catch(()=>{});throw new HttpError(413,'投稿は64 KiB以内にしてください。');}parts.push(value);}}
 finally{stream.releaseLock();}
 const out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));}catch{throw new HttpError(400,'JSONを読み取れません。');}
}
function validatePost(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.consent!==true||input.termsVersion!=='2026-10-v1'||input.reuse!=='local-only')throw new HttpError(400,'公開内容と利用条件への同意が必要です。');
 if(!ID.test(input.shareId)||!ID.test(input.requestId)||!HASH.test(input.deleteHash))throw new HttpError(400,'共有識別子または削除認証情報の形式が不正です。');
 if(!LIFETIMES.includes(input.days))throw new HttpError(400,'公開期限を選択してください。');
 if(typeof input.title!=='string'||input.title.length>80||typeof input.description!=='string'||input.description.length>500)throw new HttpError(400,'名前は80文字、説明は500文字以内です。');
 let definition;try{definition=validateDefinition(input.definition);}catch(e){throw new HttpError(400,e.message);}
 return {shareId:input.shareId,requestId:input.requestId,deleteHash:input.deleteHash,definition,title:input.title.trim(),description:input.description.trim(),days:input.days,consent:true,termsVersion:input.termsVersion,reuse:input.reuse};
}
class SiteShareStore {
 constructor(env, clock){assertStore(env);this.env=env;this.clock=clock;}
 get now(){return this.clock();}
 async retired(id){return !!await this.env.REVOCATIONS.get('revoked/'+await sha(id));}
 async revoke(id){
  // R2 first, then D1 deletion. If a previous D1 backup is restored, R2 wins.
  await this.env.REVOCATIONS.put('revoked/'+await sha(id),JSON.stringify({revokedAt:new Date(this.now).toISOString()}),{httpMetadata:{contentType:'application/json'}});
  await this.env.DB.prepare('DELETE FROM shares WHERE id=?').bind(id).run();
 }
 async get(id){
  if(!ID.test(id))return null;
  if(await this.retired(id))return null;
  const row=await this.env.DB.prepare('SELECT payload,expires FROM shares WHERE id=?').bind(id).first();
  if(!row)return null;
  if(row.expires!==null&&row.expires<=this.now){await this.revoke(id);return null;}
  return JSON.parse(row.payload);
 }
 async findOriginal(body){return await this.env.DB.prepare('SELECT id,request_hash,expires,payload FROM shares WHERE id=? OR request_id=?').bind(body.shareId,body.requestId).first();}
 async create(raw,ip){
  const body=validatePost(raw),requestHash=await sha(canonical(body));
  if(await this.retired(body.shareId))throw new HttpError(409,'この共有IDは公開終了しています。新しい投稿を作成してください。');
  const existing=await this.findOriginal(body);
  if(existing){if(existing.id!==body.shareId||existing.request_hash!==requestHash||existing.expires!==null&&existing.expires<=this.now)throw new HttpError(409,'同じ投稿IDに異なる内容または終了済みの内容があります。');return {...JSON.parse(existing.payload),reused:true};}
  await takeRate(this.env,'post:'+ip,3,3600000,this.now);
  await takeRate(this.env,'post:global',500,86400000,this.now);
  const count=await this.env.DB.prepare('SELECT count(*) AS n FROM shares').first();
  if(count.n>=10000)throw new HttpError(503,'公開データの上限に達しました。');
  const data={shareId:body.shareId,title:body.title,description:body.description,definition:body.definition,createdAt:new Date(this.now).toISOString(),expiresAt:body.days===null?null:new Date(this.now+body.days*86400000).toISOString(),contentHash:await sha(canonical(body.definition)),termsVersion:body.termsVersion,reuse:body.reuse};
  try{await this.env.DB.prepare('INSERT INTO shares (id,request_id,request_hash,delete_hash,payload,created,expires) VALUES (?,?,?,?,?,?,?)').bind(body.shareId,body.requestId,requestHash,body.deleteHash,JSON.stringify(data),this.now,body.days===null?null:this.now+body.days*86400000).run();return {...data,reused:false};}
  catch(e){const other=await this.findOriginal(body);if(other&&other.id===body.shareId&&other.request_hash===requestHash&&(!other.expires||other.expires>this.now))return {...JSON.parse(other.payload),reused:true};if(other)throw new HttpError(409,'同じ投稿IDに異なる内容が存在します。');throw e;}
 }
 async remove(id,secret){
  if(!ID.test(id)||!HASH.test(secret))return false;
  const row=await this.env.DB.prepare('SELECT delete_hash,expires FROM shares WHERE id=?').bind(id).first();
  const digest=await sha(secret);
  const match=sameHex(digest,row?.delete_hash??'0'.repeat(64));
  if(!match||!row)return false;
  if(row.expires!==null&&row.expires<=this.now){await this.revoke(id);return false;}
  await this.revoke(id);return true;
 }
 async report(id,reason,ip){
  if(!ID.test(id)||typeof reason!=='string'||reason.length<5||reason.length>1000)throw new HttpError(400,'通報理由は5〜1000文字にしてください。');
  await takeRate(this.env,'report:'+ip,5,3600000,this.now);
  const rand=crypto.getRandomValues(new Uint8Array(16)),reportId=Array.from(rand,b=>b.toString(16).padStart(2,'0')).join('');
  await this.env.DB.prepare('INSERT INTO reports (id,share_id,reason,created) VALUES (?,?,?,?)').bind(reportId,id,reason,this.now).run();
 }
 async cleanup(){
  const expired=await this.env.DB.prepare('SELECT id FROM shares WHERE expires IS NOT NULL AND expires<=? ORDER BY expires LIMIT 100').bind(this.now).all();
  for(const row of expired.results||[])await this.revoke(row.id);
  await this.env.DB.prepare('DELETE FROM limits WHERE until_ms<=?').bind(this.now).run();
  await this.env.DB.prepare('DELETE FROM reports WHERE created<?').bind(this.now-7*86400000).run();
  return (expired.results||[]).length;
 }
}
function securityHeaders(response,req){
 const h=new Headers(response.headers),url=new URL(req.url);
 h.set('Cache-Control','no-store');h.set('Referrer-Policy','no-referrer');h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');
 h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(url.protocol==='https:')h.set('Strict-Transport-Security','max-age=31536000');
 if(/^\/(api\/|f\/)/.test(url.pathname))h.set('X-Robots-Tag','noindex, nofollow');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
function decorate(html,share,uri,origin){
 const title=textSafe(share.title||'Shared activation'),desc=textSafe(share.description||'NeuroCurveで活性化関数を解析・ローカル評価。'),full=origin+uri;
 return html.replace('<title>NeuroCurve — 活性化関数ラボ</title>',`<title>${title} — NeuroCurve</title>`).replace('<!-- SHARE_META -->',`<meta name="robots" content="noindex,nofollow"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website"><meta property="og:url" content="${textSafe(full)}"><meta property="og:image" content="${textSafe(full)}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`);
}
async function asset(env,request,path){
 if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')throw new HttpError(503,'配信の静的アセット設定がありません。');
 const u=new URL(path,new URL(request.url).origin);
 return await env.ASSETS.fetch(new Request(u,{method:'GET'}));
}
/** Browser-agnostic module entry for Sites. No Node, sockets or eval. */
export async function handleSitesRequest(req,env,{now=Date.now}={}){
 let response;
 try{
  const url=new URL(req.url),path=url.pathname,t=now();
  if(req.method==='GET'&&path==='/healthz')response=json(env?.DB&&env?.REVOCATIONS&&env?.ASSETS?200:503,{status:env?.DB&&env?.REVOCATIONS&&env?.ASSETS?'ok':'unavailable'});
  else if(req.method==='GET'&&path==='/api/config')response=json(200,{version:'0.9.0-sites',engine:'neurocurve-1',sharingEnabled:!!(env?.DB&&env?.REVOCATIONS&&env?.RATE_SALT&&env?.ASSETS),backend:'runtime-selectable',backends:['webgpu-compute','native-js-cpu'],gpu:'browser-probe-required',origin:url.origin,termsVersion:'2026-10-v1'});
  else if(path.startsWith('/api/')||path.startsWith('/f/')){
   assertStore(env);
   if(['POST','DELETE'].includes(req.method)&&req.headers.get('Origin')!==url.origin)throw new HttpError(403,'同じサイトの画面から操作してください。');
   const store=new SiteShareStore(env,now),ip=await ipHash(req,env);
   await takeRate(env,'read:'+ip,240,60000,t);
   if(req.method==='POST'&&path==='/api/shares'){
    const data=await store.create(await bodyJSON(req),ip);
    response=json(data.reused?200:201,{shareId:data.shareId,url:url.origin+'/f/'+data.shareId,createdAt:data.createdAt,expiresAt:data.expiresAt,contentHash:data.contentHash});
   }
   else if(req.method==='POST'&&path==='/api/reports'){
    const input=await bodyJSON(req);await store.report(input.shareId,input.reason,ip);
    response=json(202,{received:true,message:'通報を受け付けました。削除の実施を保証するものではありません。'});
   }
   else if(req.method==='POST'&&path==='/api/maintenance'){
    // Only for an explicitly configured scheduled task; not publicly discoverable.
    if(!env.ADMIN_TOKEN||!sameHex(req.headers.get('Authorization')??'',`Bearer ${env.ADMIN_TOKEN}`))response=unavailable();
    else response=json(200,{purged:await store.cleanup()});
   }
   else{
    const api=/^\/api\/shares\/([a-f0-9]{32})$/.exec(path);
    const shared=/^\/f\/([a-f0-9]{32})(\/og\.png)?$/.exec(path);
    if(api&&req.method==='GET'){const found=await store.get(api[1]);response=found?json(200,found):unavailable();}
    else if(api&&req.method==='DELETE'){
     await takeRate(env,'delete:'+ip,12,600000,t);
     const token=DELETE_HEADER.exec(req.headers.get('Authorization')??'');
     response=token&&await store.remove(api[1],token[1])?new Response(null,{status:204}):unavailable();
    }
    else if(shared&&(req.method==='GET'||req.method==='HEAD')){
     const item=await store.get(shared[1]);
     if(!item)response=unavailable();
     else if(shared[2]){
      const image=await asset(env,req,'/og-default.png');
      response=await store.get(shared[1])?new Response(req.method==='HEAD'?null:image.body,{status:image.status,headers:{'Content-Type':'image/png'}}):unavailable();
     }else{
      const template=await asset(env,req,'/index.html');
      if(!template.ok)throw new HttpError(503,'共有ページのテンプレートを取得できません。');
      const html=decorate(await template.text(),item,path,url.origin);
      response=await store.get(shared[1])?new Response(req.method==='HEAD'?null:html,{headers:{'Content-Type':'text/html; charset=utf-8'}}):unavailable();
     }
    }
    else response=unavailable();
   }
  }else if(req.method==='GET'&&path==='/robots.txt')response=new Response('User-agent: *\nDisallow: /api/\n',{headers:{'Content-Type':'text/plain'}});
  else if((req.method==='GET'||req.method==='HEAD')&&!path.startsWith('/.')){
   const file=path==='/'?'/index.html':path;
   if(file.split('/').some(p=>p.startsWith('.')))response=unavailable();
   else {const r=await asset(env,req,file);response=req.method==='HEAD'?new Response(null,{status:r.status,headers:r.headers}):r;}
  }else response=unavailable();
 }catch(e){
  response=e instanceof HttpError?json(e.status,{error:e.message}):json(503,{error:'処理できませんでした。公開データは配信していません。'});
 }
 return securityHeaders(response,req);
}
export default {fetch:(request,env)=>handleSitesRequest(request,env)};
