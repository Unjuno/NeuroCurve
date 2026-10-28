import http from 'node:http';import {isIP} from 'node:net';import {readFile} from 'node:fs/promises';import {join,resolve,extname} from 'node:path';
import {HttpError,ID} from './store.js';import {graphPNG} from './png.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function bodyJSON(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')||req.headers['content-encoding'])throw new HttpError(415,'application/jsonのみ受け付けます。');
  if(Number(req.headers['content-length'])>65536){req.resume();throw new HttpError(413,'投稿は64 KiB以内にしてください。');}
  const bytes=await new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',b=>{size+=b.length;if(size<=65536)chunks.push(b);});req.on('end',()=>size>65536?reject(new HttpError(413,'投稿は64 KiB以内にしてください。')):resolve(Buffer.concat(chunks)));req.on('error',reject);});
  try{return JSON.parse(bytes.toString('utf8'));}catch{throw new HttpError(400,'JSONを読み取れません。');}
}
export function clientAddress(req,trustedProxyIPs=[]){const peer=req.socket.remoteAddress??'unknown';const value=req.headers['x-real-ip'];return trustedProxyIPs.includes(peer)&&typeof value==='string'&&isIP(value)?value:peer;}
export function createApp({store,now=Date.now,publicOrigin,publicDir,rateLimit=3,adminToken=null,sharingEnabled=true,trustedProxyIPs=[],readStatic=readFile}){
  const handler=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(publicOrigin.startsWith('https:'))res.setHeader('Strict-Transport-Security','max-age=31536000');
    const unavailable=()=>json(res,404,{error:'存在しないか、公開が終了しています。'});
    try{
      const path=new URL(req.url,'http://localhost').pathname,ip=clientAddress(req,trustedProxyIPs);
      if(path.startsWith('/f/')||path.startsWith('/api/'))res.setHeader('X-Robots-Tag','noindex, nofollow');
      if(['POST','DELETE'].includes(req.method)&&req.headers.origin!==publicOrigin)throw new HttpError(403,'同じサイトの画面から操作してください。');
      if(req.method==='GET'&&path==='/api/config')return json(res,200,{version:'0.9.0',engine:'neurocurve-1',sharingEnabled,backend:'runtime-selectable',backends:['webgpu-compute','native-js-cpu'],gpu:'browser-probe-required',origin:publicOrigin,termsVersion:'2026-10-v1'});
      if(req.method==='GET'&&path==='/healthz')return json(res,200,{status:'ok'});
      if(path.startsWith('/api/')||path.startsWith('/f/'))store.takeRate('read:'+store.ipKey(ip),240,60000,now());
      if(req.method==='POST'&&path==='/api/shares'){
        if(!sharingEnabled)throw new HttpError(503,'この配信環境では共有サーバーが設定されていません。');
        const value=store.create(await bodyJSON(req),ip,now(),rateLimit);return json(res,value.reused?200:201,{shareId:value.shareId,url:publicOrigin+'/f/'+value.shareId,createdAt:value.createdAt,expiresAt:value.expiresAt,contentHash:value.contentHash});
      }
      const api=/^\/api\/shares\/([a-f0-9]{32})$/.exec(path);
      if(api&&req.method==='GET'){const value=store.get(api[1],now());return value?json(res,200,value):unavailable();}
      if(api&&req.method==='DELETE'){
        store.takeRate('delete:'+store.ipKey(ip),12,600000,now());const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization??'');
        if(!match||!store.remove(api[1],match[1],now()))return unavailable();res.writeHead(204);return res.end();
      }
      if(req.method==='POST'&&path==='/api/reports'){const b=await bodyJSON(req);store.report(b.shareId,b.reason,ip,now());return json(res,202,{received:true,message:'通報を受け付けました。削除の実施を保証するものではありません。'});}
      if(req.method==='GET'&&path==='/api/maintenance'){
        if(!adminToken||req.headers.authorization!==`Bearer ${adminToken}`)return unavailable();return json(res,200,{purged:store.cleanup(now())});
      }
      const shared=/^\/f\/([a-f0-9]{32})(\/og\.png)?$/.exec(path);
      if(shared&&['GET','HEAD'].includes(req.method)){
        const value=store.get(shared[1],now());if(!value)return unavailable();
        if(shared[2]){const png=req.method==='HEAD'?undefined:graphPNG(value.definition);if(!store.get(shared[1],now()))return unavailable();res.writeHead(200,{'Content-Type':'image/png'});return res.end(png);}
        let html=await readStatic(join(publicDir,'index.html'),'utf8');if(!store.get(shared[1],now()))return unavailable();const title=escape(value.title||'Shared activation'),description=escape(value.description||'NeuroCurveで活性化関数を解析・ローカル評価。'),url=publicOrigin+path;
        html=html.replace('<title>NeuroCurve — 活性化関数ラボ</title>',`<title>${title} — NeuroCurve</title>`).replace('<!-- SHARE_META -->',`<meta name="robots" content="noindex,nofollow"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(url)}"><meta property="og:image" content="${escape(url)}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`);
        res.writeHead(200,{'Content-Type':MIME['.html']});return res.end(req.method==='HEAD'?undefined:html);
      }
      if(req.method==='GET'&&path==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /api/\n');}
      if(['GET','HEAD'].includes(req.method)){
        const rel=path==='/'?'index.html':decodeURIComponent(path).slice(1),file=resolve(publicDir,rel);
        if(!file.startsWith(resolve(publicDir)+'/')||rel.split('/').some(s=>s.startsWith('.'))||!MIME[extname(file)])return unavailable();
        let data;try{data=await readFile(file);}catch{return unavailable();}
        res.writeHead(200,{'Content-Type':MIME[extname(file)]});return res.end(req.method==='HEAD'?undefined:data);
      }
      return unavailable();
    }catch(e){if(res.headersSent){res.end();return;}if(e.status===429)res.setHeader('Retry-After','3600');return json(res,e.status??503,{error:e.status?e.message:'処理できませんでした。公開データは配信していません。'});}
  };
  const server=http.createServer(handler);server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=64;server.maxRequestsPerSocket=1000;return server;
}
