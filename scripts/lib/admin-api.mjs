import { readFileSync,statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from './env.mjs';
export function adminClient(args={},transport=fetch) {
 loadEnv();
 const base=String(args.base??(args.local?'http://127.0.0.1:8789':'https://wishmeteor.net'));
 const parsed=new URL(base);const loopback=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
 if(parsed.username||parsed.password||parsed.search||parsed.hash||(parsed.protocol!=='https:'&&!loopback)||(!loopback&&parsed.hostname!=='wishmeteor.net'))throw new Error('admin-base-not-allowed');
 let token=process.env.WISHMETEOR_ADMIN_TOKEN??process.env.ADMIN_API_TOKEN;
 if(!token&&!args.local) {
  const file=join(homedir(),'.config/wishmeteor/admin-token');
  try{const metadata=statSync(file);if(!metadata.isFile()||(metadata.mode&0o077)!==0||metadata.uid!==process.getuid())throw new Error('admin-token-permissions');token=readFileSync(file,'utf8').trim();}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(!token)throw new Error('admin-token-required');
 return {
  base:parsed.origin,
  async request(path,payload,method=payload===undefined?'GET':'POST') {
   if(!path.startsWith('/api/admin/'))throw new Error('admin-path-required');
   if(method!=='GET'&&!args.write)throw new Error('mutation-requires-write-flag');
   const response=await transport(new URL(path,base),{method,headers:{authorization:'Bearer '+token,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{body:JSON.stringify(payload)}),redirect:'error',signal:AbortSignal.timeout(30_000)});
   const result=await response.json().catch(()=>null);
   if(!response.ok||!result)throw Object.assign(new Error(result?.error??'admin-http-'+response.status),{status:response.status,details:result?.details});return result;
  },
  async catalog() {
   const tools=[];let cursor='';
   do{const page=await this.request('/api/admin/content?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));tools.push(...page.tools);cursor=page.nextCursor;}while(cursor);
   return tools;
  },
 };
}
