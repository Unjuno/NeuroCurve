import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,chmodSync} from 'node:fs';import {dirname,resolve} from 'node:path';
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {validateDefinition} from '../public/core/activation.js';
export const sha=s=>createHash('sha256').update(s).digest('hex');
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function canonical(o){if(Array.isArray(o))return '['+o.map(canonical).join(',')+']';if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(k=>JSON.stringify(k)+':'+canonical(o[k])).join(',')+'}';return JSON.stringify(o);}
export const ID=/^[a-f0-9]{32}$/;const HASH=/^[a-f0-9]{64}$/;
export function validatePost(body){
  if(!body||typeof body!=='object'||body.consent!==true||body.termsVersion!=='2026-10-v1'||body.reuse!=='local-only')throw new HttpError(400,'公開内容と利用条件への同意が必要です。');
  if(!ID.test(body.shareId)||!ID.test(body.requestId)||!HASH.test(body.deleteHash))throw new HttpError(400,'共有識別子または削除認証情報の形式が不正です。');
  if(![7,30,365,null].includes(body.days))throw new HttpError(400,'公開期限を選択してください。');
  if(typeof body.title!=='string'||body.title.length>80||typeof body.description!=='string'||body.description.length>500)throw new HttpError(400,'名前は80文字、説明は500文字以内です。');
  let definition;try{definition=validateDefinition(body.definition);}catch(e){throw new HttpError(400,e.message);}
  return {shareId:body.shareId,requestId:body.requestId,deleteHash:body.deleteHash,definition,title:body.title.trim(),description:body.description.trim(),days:body.days,consent:true,termsVersion:body.termsVersion,reuse:body.reuse};
}
/** Content and revocation stores must have independent backup/restore lifecycles. */
export class ShareStore{
  constructor({path,ledgerPath,salt}){
    if(resolve(path)===resolve(ledgerPath))throw new Error('contentと失効台帳は別の独立したファイルにしてください。');
    const had=existsSync(path),ledgerHad=existsSync(ledgerPath);if(had&&!ledgerHad)throw new Error('削除台帳 ledger がありません。復旧前に配信を停止します。');
    mkdirSync(dirname(path),{recursive:true,mode:0o700});mkdirSync(dirname(ledgerPath),{recursive:true,mode:0o700});
    this.salt=salt;this.db=new DatabaseSync(path,{timeout:3000});this.ledger=new DatabaseSync(ledgerPath,{timeout:3000});
    chmodSync(path,0o600);chmodSync(ledgerPath,0o600);
    this.db.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA synchronous=FULL;');this.ledger.exec('PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,delete_hash TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER);
      CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,n INTEGER NOT NULL,until_ms INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,share_id TEXT NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS share_expiry ON shares(expires);`);
    this.ledger.exec('CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS revocations(id_hash TEXT PRIMARY KEY,revoked INTEGER NOT NULL);');
    let ledgerId=this.ledger.prepare("SELECT value FROM metadata WHERE key='instance'").get()?.value;if(!ledgerId){ledgerId=randomBytes(16).toString('hex');this.ledger.prepare("INSERT INTO metadata VALUES ('instance',?)").run(ledgerId);}
    const expected=this.db.prepare("SELECT value FROM metadata WHERE key='ledger'").get()?.value;if(expected&&expected!==ledgerId){this.close();throw new Error('削除台帳 ledger の識別子が一致しません。');}if(!expected)this.db.prepare("INSERT INTO metadata VALUES ('ledger',?)").run(ledgerId);
  }
  retired(id){return !!this.ledger.prepare('SELECT 1 FROM revocations WHERE id_hash=?').get(sha(id));}
  ipKey(ip){return createHmac('sha256',this.salt).update(ip).digest('hex');}
  takeRate(key,limit,windowMs,now){
    const old=this.db.prepare('SELECT n,until_ms FROM limits WHERE key=?').get(key);
    if(old&&old.until_ms>now&&old.n>=limit)throw new HttpError(429,'利用回数の上限です。時間をおいて再試行してください。');
    if(old&&old.until_ms>now)this.db.prepare('UPDATE limits SET n=n+1 WHERE key=?').run(key);
    else this.db.prepare('INSERT INTO limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET n=excluded.n,until_ms=excluded.until_ms').run(key,1,now+windowMs);
  }
  create(input,ip,now,rateLimit=3){
    const body=validatePost(input),requestHash=sha(canonical(body));
    if(this.retired(body.shareId))throw new HttpError(409,'この共有IDは公開終了しています。新しい投稿を作成してください。');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const old=this.db.prepare('SELECT * FROM shares WHERE request_id=? OR id=?').get(body.requestId,body.shareId);
      if(old){if(old.request_hash!==requestHash||old.expires!==null&&old.expires<=now)throw new HttpError(409,'同じ投稿IDに異なる内容または終了済みの内容があります。');this.db.exec('COMMIT');return {...JSON.parse(old.payload),reused:true};}
      this.takeRate('post:'+this.ipKey(ip),rateLimit,3600000,now);this.takeRate('post:global',500,86400000,now);
      if(this.db.prepare('SELECT count(*) AS n FROM shares').get().n>=10000)throw new HttpError(503,'公開データの上限に達しました。');
      const payload={shareId:body.shareId,title:body.title,description:body.description,definition:body.definition,createdAt:new Date(now).toISOString(),expiresAt:body.days===null?null:new Date(now+body.days*86400000).toISOString(),contentHash:sha(canonical(body.definition)),termsVersion:body.termsVersion,reuse:body.reuse};
      this.db.prepare('INSERT INTO shares VALUES (?,?,?,?,?,?,?)').run(body.shareId,body.requestId,requestHash,body.deleteHash,JSON.stringify(payload),now,body.days===null?null:now+body.days*86400000);this.db.exec('COMMIT');return {...payload,reused:false};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  get(id,now){if(!ID.test(id)||this.retired(id))return null;const row=this.db.prepare('SELECT payload,expires FROM shares WHERE id=?').get(id);if(!row)return null;if(row.expires!==null&&row.expires<=now){this.revoke(id,now);return null;}return JSON.parse(row.payload);}
  remove(id,secret,now){
    if(!ID.test(id)||!HASH.test(secret))return false;const row=this.db.prepare('SELECT delete_hash FROM shares WHERE id=?').get(id);const actual=Buffer.from(sha(secret),'hex'),expected=Buffer.from(row?.delete_hash??'0'.repeat(64),'hex');
    if(!timingSafeEqual(actual,expected)||!row)return false;
    this.revoke(id,now);return true;
  }
  revoke(id,now){
    // Revocation commits first. A later content-delete failure cannot expose the row.
    this.ledger.prepare('INSERT OR IGNORE INTO revocations VALUES (?,?)').run(sha(id),now);
    this.db.prepare('DELETE FROM shares WHERE id=?').run(id);
  }
  cleanup(now){const rows=this.db.prepare('SELECT id FROM shares WHERE expires IS NOT NULL AND expires<=?').all(now);for(const r of rows)this.revoke(r.id,now);this.db.prepare('DELETE FROM limits WHERE until_ms<=?').run(now);this.db.prepare('DELETE FROM reports WHERE created<?').run(now-7*86400000);this.checkpoint();return rows.length;}
  report(id,reason,ip,now){if(!ID.test(id)||typeof reason!=='string'||reason.length<5||reason.length>1000)throw new HttpError(400,'通報理由は5〜1000文字にしてください。');this.takeRate('report:'+this.ipKey(ip),5,3600000,now);this.db.prepare('INSERT INTO reports VALUES (?,?,?,?)').run(randomBytes(16).toString('hex'),id,reason,now);}
  checkpoint(){this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');this.ledger.exec('PRAGMA wal_checkpoint(TRUNCATE)');}
  close(){if(this.closed)return;this.closed=true;this.db?.close();this.ledger?.close();}
}
