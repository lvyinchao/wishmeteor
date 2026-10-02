import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handleAuth } from '../worker/auth.ts';
import { HttpError,json } from '../worker/http.ts';

export const root=fileURLToPath(new URL('../',import.meta.url));
export function database({beforeMigration}={}) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(root+'migrations').filter(n=>n.endsWith('.sql')).sort()) {
    if(beforeMigration)beforeMigration(sqlite,name);
    sqlite.exec(readFileSync(root+'migrations/'+name,'utf8'));
  }
  const queries=[];
  const DB={queries,sqlite,beforeBatch:null,prepare(sql){
    const make=(values=[])=>({sql,values,bind(...args){return make(args);},execute(){
      queries.push({sql,values});
      const stmt=sqlite.prepare(sql),returnsRows=stmt.columns().length>0;
      if(returnsRows) {
        const results=stmt.all(...values);
        const changes=/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?Number(sqlite.prepare('SELECT changes() AS n').get().n):0;
        return {results,meta:{changes,last_row_id:0},success:true};
      }
      const result=stmt.run(...values);return {results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)},success:true};
    },async run(){return this.execute();},async all(){return this.execute();},async first(column){const row=this.execute().results[0] ?? null;return column?row?.[column] ?? null:row;}});
    return make();
  },async batch(statements){
    if(DB.beforeBatch)await DB.beforeBatch(statements);
    sqlite.exec('BEGIN IMMEDIATE');
    try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  return DB;
}
export function environment(options={}) {
  const DB=database(options),mail=[];
  return {DB,mail,APP_ORIGIN:'https://wishmeteor.net',GOOGLE_CLIENT_ID:'isolated-test-client',ADMIN_API_TOKEN:'isolated-token-'.padEnd(64,'x'),
    ASSETS:{async fetch(){return new Response('<!doctype html><html><head></head><body>Static asset</body></html>',{status:404});}},
    EMAIL:{async send(message){mail.push(message);return {messageId:'isolated-message-'+mail.length};}}};
}
export function request(path,payload,{cookie,ip='192.0.2.10',method,headers={}}={}) {
  return new Request('https://wishmeteor.net'+path,{method:method ?? (payload===undefined?'GET':'POST'),headers:{origin:'https://wishmeteor.net','cf-connecting-ip':ip,...(payload===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
}
export async function auth(env,path,payload,options) {
  try{return await handleAuth(request(path,payload,options),env);}catch(error){if(error instanceof HttpError)return json({error:error.code},error.status);throw error;}
}
export function verificationToken(env,email,purpose='verify') {
  const row=env.DB.sqlite.prepare(`SELECT n.payload_json FROM notification_outbox n JOIN email_verifications v ON json_extract(n.payload_json,'$.tokenHash')=v.token_hash JOIN accounts a ON a.id=v.account_id WHERE a.email=? AND v.purpose=?`).get(email,purpose);
  const payload=JSON.parse(row.payload_json);return payload.text.match(/(?:token=|reset=)([a-f0-9]{64})/)[1];
}
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
export async function googleRequest(env,email,extra={},password) {
  const config=await auth(env,'/api/auth/config');const {nonce}=await config.json();
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const signed=`${encode({alg:'RS256',kid:'isolated-test-key'})}.${encode({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:email+'-isolated-sub',email,email_verified:true,nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,...extra})}`;
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(signed));
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{if(String(url)!=='https://www.googleapis.com/oauth2/v3/certs')throw Error('Unexpected network request');return Response.json({keys:[{...publicKey,kid:'isolated-test-key',alg:'RS256'}]});};
  try{return await auth(env,'/api/auth/google',{credential:signed+'.'+Buffer.from(signature).toString('base64url'),...(password?{password}:{})},{cookie:`__Host-wm_google_nonce=${nonce}`});}
  finally{globalThis.fetch=originalFetch;}
}
