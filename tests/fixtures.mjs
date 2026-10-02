import worker from '../worker/index.ts';
import { request } from './harness.mjs';
import { canonicalProductUrl } from '../src/lib/tool-schema.ts';
export function tool(slug='isolated-project',extra={}) {
 const now=new Date().toISOString(),today=now.slice(0,10);
 return {slug,name:'Isolated '+slug,url:'https://'+slug+'.com',category:'ai-coding',summary:'An isolated project used to exercise the complete directory workflow.',description:'This isolated product helps people explore a practical idea and understand its purpose. The listing includes sufficient context for a reader to decide whether to visit the official homepage. Its description is intentionally complete, with clear words describing the workflow, intended audience, and the evidence recorded for this example. It makes no claims about pricing beyond the selected label.',tags:['coding'],pricing:'freemium',status:'active',origin:'curated',sources:[{type:'official-site',url:'https://'+slug+'.com',observedAt:today}],firstSeenAt:today,lastSeenAt:today,lastVerifiedAt:null,checksFailed:0,approved:true,submittedAt:now,approvedAt:now,publishedAt:now,updatedAt:now,contentVersion:'fixture-'+slug,...extra};
}
export function store(env,value) {
 const target=canonicalProductUrl(value.url);env.DB.sqlite.prepare('INSERT INTO managed_tools(slug,content_json,root_domain,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(value.slug,JSON.stringify(value),target.domain,target.projectKey,value.publishedAt,value.updatedAt);
}
export async function call(env,path,payload,options={}) {
 const work=[],response=await worker.fetch(request(path,payload,options),env,{waitUntil(promise){work.push(promise);},passThroughOnException(){}});await Promise.all(work);return response;
}
export function admin(env,path,payload,options={}) {return call(env,path,payload,{...options,headers:{authorization:'Bearer '+env.ADMIN_API_TOKEN,...options.headers}});}
export function pending(env,n=1) {
 const now=new Date().toISOString();const result=env.DB.sqlite.prepare("INSERT INTO submissions(name,url,domain,root_domain,dedupe_key,email,category,notes,ip_hash,created_at,verdict) VALUES(?,?,?,?,?,?,?,'a real project description','isolated-ip',?,'pending')").run('Project '+n,'https://project-'+n+'.com','project-'+n+'.com','project-'+n+'.com','project-'+n+'.com','maker-'+n+'@example.com','ai-coding',now);return Number(result.lastInsertRowid);
}
export function approvedContent(n=1){return tool('project-'+n,{origin:'submitted',wish:{submittedAt:new Date().toISOString().slice(0,10),blessingShort:'May your next chapter shine.',blessingLong:'May this thoughtful project find people who need it, and may each careful improvement make the next step clearer. We hope the work brings you useful feedback, patient collaborators, and a little more confidence in the idea you are bringing to life.',blessingApproved:true,notifiedAt:null}});}
