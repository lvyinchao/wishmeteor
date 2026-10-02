import { createHash } from 'node:crypto';
import { canonicalProductUrl,validateTool,isPublicTool } from '../../src/lib/tool-schema.ts';
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const literal=value=>value==null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
const timestamp=value=>{const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error('invalid-legacy-timestamp');return new Date(parsed).toISOString();};
export function buildBackfillPlan(rows,submissions,{target='local',observedAt=new Date().toISOString()}={}) {
 const keys=new Map(),submissionTargets=new Map(),tools=[],pending=[];
 for(const row of submissions){const target=canonicalProductUrl(row.url);if(!target)throw new Error('unsafe-submission-url:'+row.id);submissionTargets.set(row.id,target);}
 for(const row of rows) {
  const content=JSON.parse(row.content_json),target=canonicalProductUrl(content.url);if(!target)throw new Error('unsafe-catalog-url:'+row.slug);
  if(keys.has(target.projectKey))throw new Error('catalog-project-conflict:'+keys.get(target.projectKey)+','+row.slug);keys.set(target.projectKey,row.slug);
  const match=submissions.filter(s=>s.verdict==='approved'&&submissionTargets.get(s.id).projectKey===target.projectKey).sort((a,b)=>String(b.verdict_at??b.created_at).localeCompare(String(a.verdict_at??a.created_at)))[0];
  const value={...content,slug:row.slug,publishedAt:content.publishedAt??timestamp(match?.verdict_at??row.created_at),approvedAt:content.approvedAt??timestamp(match?.verdict_at??row.created_at),updatedAt:content.updatedAt??timestamp(row.updated_at),contentVersion:content.contentVersion??digest(row.content_json+row.updated_at).slice(0,16)};
  if(match)value.submittedAt=content.submittedAt??timestamp(match.created_at);
  if(value.wish) {value.wish={...value.wish,blessingApproved:value.wish.blessingApproved??(value.approved===true&&value.wish.blessingShort?.length>0&&value.wish.blessingLong?.length>=120)};}
  const {errors}=validateTool(value,row.slug);if(errors.length)throw new Error('legacy-content-needs-review:'+row.slug+':'+errors.join(';'));
  tools.push({slug:row.slug,expectedJson:row.content_json,expectedUpdatedAt:row.updated_at,value,json:JSON.stringify(value),rootDomain:target.domain,projectKey:target.projectKey,approvedSubmissionId:match?.id??null,public:isPublicTool(value)});
 }
 const pendingKeys=new Map();
 for(const row of submissions.filter(s=>s.verdict==='pending')){const target=submissionTargets.get(row.id);if(keys.has(target.projectKey)||pendingKeys.has(target.projectKey))throw new Error('pending-project-conflict:'+row.id);pendingKeys.set(target.projectKey,row.id);pending.push({id:row.id,expectedUrl:row.url,rootDomain:target.domain,projectKey:target.projectKey});}
 const body={version:1,target,observedAt,tools,pending};return {...body,sha256:digest(body)};
}
export function validatePlan(plan) {const {sha256,...body}=plan;if(plan.version!==1||digest(body)!==sha256||!Array.isArray(plan.tools)||!Array.isArray(plan.pending))throw new Error('invalid-backfill-plan');return plan;}
export function toolUpdateSql(items) {
 const rows=items.map(item=>({slug:item.slug,old:item.expectedJson,updated:item.expectedUpdatedAt,new:item.json,root:item.rootDomain,key:item.projectKey}));
 return `WITH input AS MATERIALIZED (SELECT json_extract(value,'$.slug') AS slug,json_extract(value,'$.old') AS old_json,json_extract(value,'$.updated') AS expected_updated,json_extract(value,'$.new') AS new_json,json_extract(value,'$.root') AS root_domain,json_extract(value,'$.key') AS dedupe_key FROM json_each(${literal(JSON.stringify(rows))})), eligible AS MATERIALIZED (SELECT i.* FROM input i JOIN managed_tools t ON t.slug=i.slug WHERE t.content_json=i.old_json AND t.updated_at=i.expected_updated), guard AS MATERIALIZED (SELECT COUNT(*) AS count FROM eligible) UPDATE managed_tools SET content_json=(SELECT new_json FROM eligible e WHERE e.slug=managed_tools.slug),root_domain=(SELECT root_domain FROM eligible e WHERE e.slug=managed_tools.slug),dedupe_key=(SELECT dedupe_key FROM eligible e WHERE e.slug=managed_tools.slug) WHERE slug IN (SELECT slug FROM eligible) AND (SELECT count FROM guard)=${items.length}`;
}
