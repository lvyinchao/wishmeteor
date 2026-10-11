import { canonicalProductUrl,CATEGORY_NAMES } from '../../src/lib/tool-schema.ts';
import { CatalogRepository } from '../catalog.ts';
import { HttpError } from '../http.ts';
import { automaticSubmissionAccount } from '../submission-policy.ts';
import { SCREENSHOT_MAX } from '../screenshots.ts';
import { sha256 } from '../security.ts';
import { submitForAccount } from '../submissions.ts';
import { handlePublic } from '../public.ts';
import { issuer,principal,type Principal } from './oauth.ts';
import { downloadScreenshot,type OpenAIFile } from './files.ts';
import type { Env } from '../env.ts';
export const normalizeName=(name:string)=>name.trim().toLowerCase();
interface DuplicateInput {official_url:string;name:string;aliases?:string[]}
export async function checkDuplicate(env:Env,auth:Principal,input:DuplicateInput) {
 const target=canonicalProductUrl(input.official_url);if(!target)throw new HttpError('invalid-link');
 const names=[...new Set([input.name,...(input.aliases ?? [])].map(normalizeName))];
 const aliases=(input.aliases ?? []).flatMap(a=>{const t=canonicalProductUrl(a);return t?[t.projectKey]:[];}),keys=[...new Set([target.projectKey,...aliases])];
 const rows=await env.DB.prepare(`SELECT t.slug,t.content_json,t.dedupe_key FROM managed_tools t WHERE t.approved=1 AND t.status!='archived' AND (
 t.dedupe_key IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM product_identity_aliases a WHERE a.slug=t.slug AND a.alias_key IN (SELECT value FROM json_each(?)))
 OR lower(trim(json_extract(t.content_json,'$.name'))) IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(t.content_json,'$.aliases') a WHERE lower(trim(a.value)) IN (SELECT value FROM json_each(?)))
 ) ORDER BY t.slug LIMIT 50`).bind(JSON.stringify(keys),JSON.stringify(keys),JSON.stringify(names),JSON.stringify(names)).all<{slug:string;content_json:string;dedupe_key:string}>();
 const matches:(Record<string,unknown>)[]=[];
 for(const row of rows.results ?? []) {
  const t=JSON.parse(row.content_json),urlMatch=keys.includes(row.dedupe_key)||await env.DB.prepare('SELECT slug FROM product_identity_aliases WHERE slug=? AND alias_key IN (SELECT value FROM json_each(?)) LIMIT 1').bind(row.slug,JSON.stringify(keys)).first();
  const reasons=[...(urlMatch?['normalized_official_url_or_url_alias']:[]),...([t.name,...(t.aliases ?? [])].some(n=>names.includes(normalizeName(n)))?['product_name_or_alias']:[])];
  matches.push({record_id:row.slug,status:'published',name:t.name,official_url:t.url,public_url:issuer(env)+'/tool/'+row.slug,reasons});
 }
 const pending=await env.DB.prepare(`SELECT id,name,url,dedupe_key,name_keys FROM submissions s WHERE account_id=? AND verdict='pending' AND (dedupe_key IN (SELECT value FROM json_each(?)) OR lower(trim(name)) IN (SELECT value FROM json_each(?)) OR EXISTS(SELECT 1 FROM json_each(name_keys) a WHERE a.value IN (SELECT value FROM json_each(?)))) ORDER BY id LIMIT 50`).bind(auth.account.id,JSON.stringify(keys),JSON.stringify(names),JSON.stringify(names)).all<{id:number;name:string;url:string;dedupe_key:string;name_keys:string}>();
 for(const s of pending.results ?? [])matches.push({record_id:s.id,status:'pending_review',name:s.name,official_url:s.url,public_url:null,reasons:[...(keys.includes(s.dedupe_key)?['normalized_official_url_or_url_alias']:[]),...([s.name,...JSON.parse(s.name_keys)].some(n=>names.includes(normalizeName(n)))?['product_name_or_alias']:[])]});
 return {normalized_official_url:target.url,project_key:target.projectKey,duplicate:matches.length>0,matches};
}
export async function getAccount(env:Env,auth:Principal) {
 const automatic=automaticSubmissionAccount(auth.account),count=await env.DB.prepare("SELECT COUNT(*) n FROM submissions WHERE account_id=? AND created_at>?").bind(auth.account.id,new Date(Date.now()-3600_000).toISOString()).first<{n:number}>();
 return {account:{id:auth.account.id,email:auth.account.email,name:auth.account.display_name},authorized_scopes:auth.scopes,submission_policy:{automatic_publication:automatic,ordinary_limit_per_hour:automatic?null:5,account_submissions_last_hour:count?.n ?? 0,additional_ip_limits_apply:!automatic},requirements:{name_max_characters:80,description_min_characters:300,description_max_characters:600,description:'Original, factual description; do not claim third-party domain ownership.',listing_identities:['owner','authorized_independent'],source_links_required:true,real_screenshot_required:true,screenshot_mime_types:['image/png','image/jpeg','image/webp'],screenshot_max_bytes:SCREENSHOT_MAX,categories:CATEGORY_NAMES},disconnect_url:issuer(env)+'/oauth/connections'};
}
interface SubmissionRow {id:number;name:string;url:string;category:string;notes:string;verdict:string;created_at:string;verdict_at:string|null;approved_slug:string|null;screenshot_key:string|null;screenshot_hash:string|null;listing_identity:string|null;source_links:string;mcp_payload_hash:string|null;visible_slug:string|null}
export async function submissionRow(env:Env,auth:Principal,id?:number,key?:string) {
 return env.DB.prepare(`SELECT s.*,CASE WHEN t.approved=1 AND t.status!='archived' THEN t.slug ELSE NULL END AS visible_slug FROM submissions s LEFT JOIN managed_tools t ON t.slug=s.approved_slug WHERE s.account_id=? AND ${id?'s.id=?':'s.mcp_idempotency_key=?'}`).bind(auth.account.id,id ?? key ?? '').first<SubmissionRow>();
}
export async function getSubmission(env:Env,auth:Principal,input:{submission_id?:number;idempotency_key?:string}) {
 const row=await submissionRow(env,auth,input.submission_id,input.idempotency_key);if(!row)throw new HttpError('submission-not-found',404);
 const image=row.screenshot_key?await env.PRODUCT_SCREENSHOTS.get(row.screenshot_key):null;
 return {submission_id:row.id,status:row.verdict==='pending'?'pending_review':row.verdict==='rejected'?'rejected':row.visible_slug?'published':'approved_not_public',public_url:row.visible_slug?issuer(env)+'/tool/'+row.visible_slug:null,name:row.name,official_url:row.url,category:row.category,description:row.notes,listing_identity:row.listing_identity,source_links:JSON.parse(row.source_links),created_at:row.created_at,reviewed_at:row.verdict_at,screenshot:{state:image?'stored':'missing',sha256:row.screenshot_hash,public_url:image&&row.visible_slug?issuer(env)+'/api/product-screenshots/'+row.screenshot_key:null}};
}
export interface SubmitInput extends DuplicateInput {category:string;description:string;source_links:string[];listing_identity:'owner'|'authorized_independent';screenshot:OpenAIFile;idempotency_key:string}
export async function submitListing(request:Request,env:Env,auth:Principal,input:SubmitInput) {
 const target=canonicalProductUrl(input.official_url);if(!target||input.source_links.some(s=>!canonicalProductUrl(s)))throw new HttpError('invalid-link');
 const sources=input.source_links.map(s=>canonicalProductUrl(s)!.url),names=[...new Set([input.name,...(input.aliases ?? [])].map(normalizeName))];
 const hash=await sha256(JSON.stringify({name:input.name.trim(),url:target.url,category:input.category,description:input.description.trim(),sources,identity:input.listing_identity,names,file_id:input.screenshot.file_id}));
 const prior=await submissionRow(env,auth,undefined,input.idempotency_key);
 if(prior){if(prior.mcp_payload_hash!==hash)throw new HttpError('idempotency-key-conflict',409);return {...await getSubmission(env,auth,{idempotency_key:input.idempotency_key}),idempotent_replay:true};}
 if((await checkDuplicate(env,auth,input)).duplicate)throw new HttpError('duplicate',409);
 const screenshot=await downloadScreenshot(input.screenshot),screenshotHash=await sha256Bytes(screenshot);
 const fresh=await principal(request,env);if(!fresh||fresh.account.id!==auth.account.id)throw new HttpError('authentication-expired',401);if(!fresh.scopes.includes('submissions:write'))throw new HttpError('insufficient-scope',403);
 // Recheck after downloading, then rely on durable D1 constraints for the race.
 if((await checkDuplicate(env,fresh,input)).duplicate){const retry=await submissionRow(env,fresh,undefined,input.idempotency_key);if(retry?.mcp_payload_hash===hash)return {...await getSubmission(env,fresh,{idempotency_key:input.idempotency_key}),idempotent_replay:true};throw new HttpError('duplicate',409);}
 try {
  const response=await submitForAccount(request,env,fresh.account,{name:input.name,url:target.url,category:input.category,notes:input.description,screenshot},{key:input.idempotency_key,hash,identity:input.listing_identity,sources,names,grantId:fresh.grantId,screenshotHash});
  if(!response.ok){const data=await response.json() as {error:string};throw new HttpError(data.error,response.status);}
 }catch(error){
  const retry=await submissionRow(env,fresh,undefined,input.idempotency_key);if(retry){if(retry.mcp_payload_hash!==hash)throw new HttpError('idempotency-key-conflict',409);return {...await getSubmission(env,fresh,{idempotency_key:input.idempotency_key}),idempotent_replay:true};}
  const message=String(error);if(message.includes('mcp-duplicate-name'))throw new HttpError('duplicate',409);if(message.includes('mcp-authorization-revoked'))throw new HttpError('authentication-expired',401);throw error;
 }
 return {...await getSubmission(env,fresh,{idempotency_key:input.idempotency_key}),idempotent_replay:false};
}
async function sha256Bytes(file:File){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function checkSitemap(env:Env,input:{public_url:string}) {
 const url=new URL(input.public_url);if(url.origin!==issuer(env)||url.search||url.hash||!/^\/tool\/[a-z0-9-]{1,100}$/.test(url.pathname))throw new HttpError('invalid-public-url');
 const slug=url.pathname.slice(6),repo=new CatalogRepository(env.DB),tool=await repo.get(slug);
 if(!tool)return {public_url:url.href,public_link_status:404,in_sitemap:false,google_indexed:'not_checked',note:'Sitemap inclusion is not proof of Google indexing.'};
 const rank=await env.DB.prepare("SELECT COUNT(*) n FROM managed_tools WHERE approved=1 AND status!='archived' AND slug<?").bind(slug).first<{n:number}>();
 const group=Math.floor((rank?.n ?? 0)/10000)+1,path='/sitemap-tools'+(group===1?'':'-'+group)+'.xml';
 const response=await handlePublic(new Request(issuer(env)+path),env),xml=response?await response.text():'';
 const publicResponse=await handlePublic(new Request(url),env);
 return {public_url:url.href,public_link_status:publicResponse?.status ?? 404,sitemap_url:issuer(env)+path,in_sitemap:response?.status===200&&xml.includes('<loc>'+url.href+'</loc>'),catalog_version:(await repo.version()).version,google_indexed:'not_checked',note:'Sitemap inclusion is not proof of Google indexing.'};
}
