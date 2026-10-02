import { validateTool,blessingErrors,canonicalProductUrl,SLUG_RE,type Tool } from '../src/lib/tool-schema.ts';
import { escapeHtml } from '../src/lib/html.ts';
import { CatalogRepository } from './catalog.ts';
import { HttpError,json,jsonBody,requireOrigin,stringField } from './http.ts';
import { authLimit,constantTimeEqual,randomToken,readCookie,secureCookie,sha256 } from './security.ts';
import { approvalMail,enqueueStatement,dispatchOutbox,type MailPayload } from './outbox.ts';
import { validateProof,type VerificationProof } from './signed-verification.ts';
import type { Env } from './env.ts';

const ADMIN_COOKIE='__Host-wm_admin';
interface SubmissionRow {id:number;name:string;url:string;email:string|null;category:string;make_a_wish:string;verdict:string;created_at:string}

async function authorized(request:Request,env:Env):Promise<boolean> {
  if(!env.ADMIN_API_TOKEN)return false;
  const match=/^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(request.headers.get('authorization') ?? '');
  if(match&&constantTimeEqual(match[1],env.ADMIN_API_TOKEN))return true;
  const token=readCookie(request,ADMIN_COOKIE);if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
  const session=await env.DB.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND credential_hash=? AND expires_at>?')
    .bind(await sha256(token),await sha256(env.ADMIN_API_TOKEN),new Date().toISOString()).first();
  if(session&&!['GET','HEAD'].includes(request.method))requireOrigin(request);
  return !!session;
}
function version(tool:Tool):string {return tool.contentVersion ?? tool.updatedAt ?? '';}
function eventStatement(env:Env,tool:Tool,kind:string,now:string):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO tool_events(slug,kind,name,summary,category,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
    .bind(tool.slug,kind,tool.name,tool.summary,tool.category,now,tool.slug,tool.contentVersion!);
}
function cardStatement(env:Env,tool:Tool,now:string):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO tool_cards(slug,version,card_json,created_at)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
    .bind(tool.slug,tool.contentVersion!,JSON.stringify(tool),now,tool.slug,tool.contentVersion!);
}
function proofStatement(env:Env,proof:VerificationProof,tool:Tool):D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO link_verification_nonces(nonce,expires_at)
    SELECT ?,? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
    .bind(proof.nonce,proof.expiresAt,tool.slug,tool.contentVersion!);
}
async function proofFor(input:unknown,tool:Tool,env:Env):Promise<VerificationProof|null> {
  const proof=await validateProof(input,tool.slug,tool.url,env.LINK_VERIFIER_PUBLIC_KEY);
  if(input!==undefined&&!proof)throw new HttpError('invalid-verification');return proof;
}
function applyVerification(tool:Tool,proof:VerificationProof):void {
 tool.lastCheckedAt=new Date(proof.checkedAt).toISOString();tool.lastCheckState=proof.state;
 if(proof.state==='live'){tool.lastVerifiedAt=tool.lastCheckedAt;tool.checksFailed=0;}
 else {tool.checksFailed=(tool.checksFailed ?? 0)+1;if(proof.state==='dead'&&tool.checksFailed>=3&&tool.status==='active')tool.status='stale';}
}
function factualFields(tool:Tool):string {return JSON.stringify([tool.name,tool.url,tool.category,tool.summary,tool.description,tool.tags,tool.pricing,tool.status,tool.approved,tool.sources,tool.wish?.blessingShort,tool.wish?.blessingLong,tool.wish?.makerWish,tool.wish?.blessingApproved]);}

export async function adminMetrics(env:Env):Promise<Record<string,unknown>> {
  const now=new Date(),day=now.toISOString().slice(0,10),activeSince=new Date(now.getTime()-86_400_000).toISOString();
  const metrics=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM managed_tools WHERE approved=1 AND status!='archived') AS public_products,
    (SELECT COUNT(*) FROM submissions WHERE verdict='pending') AS pending_submissions,
    (SELECT COALESCE(used,0)+COALESCE(exception_used,0) FROM publication_days WHERE day=?) AS published_today,
    (SELECT COUNT(*) FROM accounts) AS registered_accounts,
    (SELECT COUNT(*) FROM accounts WHERE email_verified_at IS NOT NULL) AS verified_accounts,
    (SELECT COUNT(*) FROM accounts WHERE email_verified_at IS NOT NULL AND last_seen_at>=?) AS active_accounts_24h,
    (SELECT COUNT(*) FROM wish_stars) AS anonymous_browser_stars,
    (SELECT COUNT(*) FROM managed_tools WHERE approved=1 AND status!='archived' AND (json_extract(content_json,'$.lastVerifiedAt') IS NULL OR json_extract(content_json,'$.lastVerifiedAt')<?)) AS verification_due,
    (SELECT COUNT(*) FROM managed_tools WHERE origin='submitted' AND approved=1 AND status!='archived' AND COALESCE(json_extract(content_json,'$.wish.blessingLong'),'')='') AS blessings_missing,
    (SELECT COUNT(*) FROM correction_requests WHERE state='pending') AS corrections_pending,
    (SELECT AVG((julianday(verdict_at)-julianday(created_at))*24) FROM submissions WHERE verdict!='pending' AND verdict_at IS NOT NULL) AS average_review_hours,
    (SELECT version FROM catalog_meta WHERE id=1) AS catalog_version`)
    .bind(day,activeSince,new Date(now.getTime()-45*86_400_000).toISOString()).first<Record<string,unknown>>();
  const [outbox,sources,releases]=await env.DB.batch([
    env.DB.prepare('SELECT state,COUNT(*) AS count FROM notification_outbox GROUP BY state'),
    env.DB.prepare('SELECT source,state,candidates,detail,observed_at FROM source_runs ORDER BY observed_at DESC LIMIT 12'),
    env.DB.prepare('SELECT id,revision,states_json,created_at FROM release_runs ORDER BY created_at DESC LIMIT 5'),
  ]);
  return {...metrics,published_today:metrics?.published_today ?? 0,day,timeZone:'UTC',outbox:outbox.results,sources:sources.results,releases:releases.results};
}

async function putContent(request:Request,env:Env,slug:string):Promise<Response> {
  const input=await jsonBody(request,64_000),catalog=new CatalogRepository(env.DB),existing=await catalog.get(slug,true);
  if(existing&&input.expectedVersion!==version(existing))return json({error:'content-version-required',expectedVersion:version(existing)},428);
  const {value,errors}=validateTool(input,slug);if(errors.length)return json({error:'invalid-content',details:errors},400);
  if(existing && input.origin===undefined)value.origin=existing.origin;
  if(existing && value.origin!==existing.origin)return json({error:'origin-is-immutable'},400);
  if(!existing && value.origin==='submitted')return json({error:'submission-approval-required'},400);
  const proof=await proofFor(input.verification,value,env),now=new Date().toISOString(),target=canonicalProductUrl(value.url)!;
  if(await catalog.duplicate(target.projectKey,slug))return json({error:'duplicate-product'},409);
  if(value.origin==='submitted'&&value.approved&&value.status!=='archived') {
    const errors=blessingErrors(value);if(errors.length)return json({error:'blessing-required',details:errors},400);
  }
  const sameUrl=existing?.url===value.url;
  value.lastVerifiedAt=sameUrl?existing!.lastVerifiedAt:null;value.checksFailed=sameUrl?existing!.checksFailed:0;
  if(sameUrl){value.lastCheckState=existing!.lastCheckState;value.lastCheckedAt=existing!.lastCheckedAt;}if(proof)applyVerification(value,proof);
  value.publishedAt=existing?.publishedAt ?? now;value.approvedAt=existing?.approvedAt ?? now;value.updatedAt=now;value.contentVersion=randomToken().slice(0,16);
  const changed=!existing||factualFields(existing)!==factualFields(value);
  if(existing&&!changed&&!proof)return json({ok:true,tool:existing,unchanged:true});
  const record=JSON.stringify(value);
  const write=existing?
    env.DB.prepare("UPDATE managed_tools SET content_json=?,root_domain=?,dedupe_key=?,updated_at=? WHERE slug=? AND updated_at=? AND COALESCE(json_extract(content_json,'$.contentVersion'),updated_at)=?").bind(record,target.domain,target.projectKey,now,slug,existing.updatedAt!,version(existing)):
    env.DB.prepare('INSERT INTO managed_tools(slug,content_json,root_domain,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(slug,record,target.domain,target.projectKey,now,now);
  const statements=[write,cardStatement(env,value,now),eventStatement(env,value,value.status==='archived'?'archived':!existing?'published':changed?'updated':'verified',now)];
  if(existing&&canonicalProductUrl(existing.url)?.projectKey!==target.projectKey) {
    const previous=canonicalProductUrl(existing.url)!;
    statements.push(env.DB.prepare(`INSERT INTO product_identity_aliases(alias_key,slug,source_url,reason,created_at)
      SELECT ?,?,?,'Prior reviewed homepage retained after listing URL edit',? WHERE EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)
      ON CONFLICT(alias_key) DO UPDATE SET reason=excluded.reason WHERE product_identity_aliases.slug=excluded.slug`)
      .bind(previous.projectKey,slug,previous.url,now,slug,value.contentVersion));
  }
  if(proof)statements.push(proofStatement(env,proof,value));
  if(existing&&changed&&value.status!=='archived'&&value.approved) {
    const page=`${(env.APP_ORIGIN ?? 'https://wishmeteor.net').replace(/\/$/,'')}/tool/${slug}`;
    const payload:MailPayload={slug,subject:`${value.name} was updated on WishMeteor`,text:`A listing you follow was updated: ${page}\n\n${value.summary}\n\nManage followed projects from your account.`,html:`<p>A project you follow was updated.</p><p><a href="${escapeHtml(page)}">${escapeHtml(value.name)}</a></p><p>${escapeHtml(value.summary)}</p><p>Manage followed projects from your account.</p>`};
    statements.push(env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,next_attempt_at,created_at)
      SELECT 'update:'||?||':'||?||':'||a.id,'product-update',a.email,json_set(?,'$.accountId',a.id),?,?
      FROM account_projects p JOIN accounts a ON a.id=p.account_id WHERE p.slug=? AND p.following=1 AND a.email_verified_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM managed_tools WHERE slug=? AND json_extract(content_json,'$.contentVersion')=?)`)
      .bind(slug,value.contentVersion,JSON.stringify(payload),now,now,slug,slug,value.contentVersion));
  }
  try {
    const result=await env.DB.batch(statements);if(!result[0].meta.changes)return json({error:'content-changed'},409);
    return json({ok:true,tool:value});
  } catch(error) {
    if(String(error).includes('link_verification_nonces.nonce'))return json({error:'verification-replayed'},409);
    if(String(error).includes('managed_tools.slug'))return json({error:'slug-conflict'},409);if(String(error).includes('dedupe_key')||String(error).includes('duplicate-product'))return json({error:'duplicate-product'},409);throw error;
    
  }
}

async function approveSubmission(request:Request,env:Env,id:number,action:string):Promise<Response> {
  const row=await env.DB.prepare('SELECT id,name,url,email,category,make_a_wish,verdict,created_at FROM submissions WHERE id=?').bind(id).first<SubmissionRow>();
  if(!row)return json({error:'submission-not-found'},404);if(row.verdict!=='pending')return json({error:'submission-not-pending'},409);
  const now=new Date().toISOString(),origin=(env.APP_ORIGIN ?? 'https://wishmeteor.net').replace(/\/$/,'');
  if(action==='reject') {
    const statements=[env.DB.prepare("UPDATE submissions SET verdict='rejected',verdict_at=? WHERE id=? AND verdict='pending'").bind(now,id)];
    if(row.email)statements.push(env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at)
      SELECT ?,'rejected',?,?,?,?,? WHERE changes()=1 ON CONFLICT(id) DO NOTHING`).bind('rejected:'+id,row.email,JSON.stringify({subject:`An update on ${row.name} from WishMeteor`,text:`Thank you for sharing ${row.name}. We cannot add it at this time. Check its status at ${origin}/account.`,html:`<p>Thank you for sharing ${escapeHtml(row.name)}.</p><p>We cannot add it at this time. <a href="${origin}/account">Check its status</a>.</p>`}),id,now,now));
    const results=await env.DB.batch(statements);return results[0].meta.changes?json({ok:true,id,verdict:'rejected'}):json({error:'submission-not-pending'},409);
  }
  const input=await jsonBody(request,64_000),slug=stringField(input,'slug',100,true);
  const {value,errors}=validateTool(input.content,slug);value.origin=row.email?'submitted':'curated';
  if(canonicalProductUrl(row.url)?.url!==value.url)errors.push('Published URL must match the reviewed submission');
  if(!value.approved||value.status==='archived')errors.push('A new approval must publish a visible product');
  value.wish={submittedAt:row.created_at.slice(0,10),blessingShort:value.wish?.blessingShort ?? '',blessingLong:value.wish?.blessingLong ?? '',blessingApproved:value.wish?.blessingApproved===true,notifiedAt:null,...(row.make_a_wish?{makerWish:row.make_a_wish}:{})};
  errors.push(...blessingErrors(value));if(errors.length)return json({error:'invalid-content',details:errors},400);
  const catalog=new CatalogRepository(env.DB);if(await catalog.get(slug,true))return json({error:'slug-conflict'},409);
  const target=canonicalProductUrl(value.url)!;if(await catalog.duplicate(target.projectKey))return json({error:'duplicate-product'},409);
  const proof=await proofFor(input.verification,value,env);
  value.lastVerifiedAt=null;value.checksFailed=0;if(proof)applyVerification(value,proof);value.submittedAt=row.created_at;value.approvedAt=now;value.publishedAt=now;value.updatedAt=now;value.contentVersion=randomToken().slice(0,16);
  const day=now.slice(0,10),operation=crypto.randomUUID();
  // A temporary deployment allowance is restricted to the explicitly reviewed IDs
  // and UTC day. Every publication still increments the normal daily counter.
  let batchException=false;
  if(input.approvalBatch&&env.APPROVAL_BATCH) {
    try {
      const batch=JSON.parse(env.APPROVAL_BATCH);
      batchException=typeof batch.key==='string'&&input.approvalBatch===batch.key&&batch.day===day&&Array.isArray(batch.ids)&&batch.ids.includes(id);
    } catch { /* Invalid or expired deployment allowances use the normal cap. */ }
  }
  const statements=[
    env.DB.prepare('INSERT INTO publication_days(day,used) VALUES(?,0) ON CONFLICT(day) DO NOTHING').bind(day),
    env.DB.prepare(`UPDATE publication_days SET used=used+CASE WHEN used<9 THEN 1 ELSE 0 END,
      exception_used=exception_used+CASE WHEN used>=9 THEN 1 ELSE 0 END WHERE day=? AND (used<9 OR ?=1)
      AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND verdict='pending')
      AND NOT EXISTS(SELECT 1 FROM managed_tools WHERE slug=? OR dedupe_key=?)`).bind(day,batchException?1:0,id,slug,target.projectKey),
    env.DB.prepare(`UPDATE submissions SET verdict='approved',verdict_at=?,approved_slug=?,publication_operation=? WHERE id=? AND verdict='pending' AND changes()=1`).bind(now,slug,operation,id),
    env.DB.prepare(`INSERT INTO managed_tools(slug,content_json,root_domain,dedupe_key,created_at,updated_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND publication_operation=?)`).bind(slug,JSON.stringify(value),target.domain,target.projectKey,now,now,id,operation),
    cardStatement(env,value,now),eventStatement(env,value,'published',now),
  ];
  if(batchException)statements.push(env.DB.prepare(`INSERT INTO publication_exceptions(submission_id,batch_key,day,publication_operation,created_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND publication_operation=?)`)
    .bind(id,String(input.approvalBatch),day,operation,now,id,operation));
  if(proof)statements.push(proofStatement(env,proof,value));
  if(row.email)statements.push(env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at)
    SELECT ?,'approved',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions WHERE id=? AND publication_operation=?) ON CONFLICT(id) DO NOTHING`)
    .bind('approved:'+id,row.email,JSON.stringify(approvalMail(value,origin)),id,now,now,id,operation));
  try {
    const results=await env.DB.batch(statements);
    if(!results[2].meta.changes) {
      const current=await env.DB.prepare('SELECT verdict FROM submissions WHERE id=?').bind(id).first<{verdict:string}>();
      if(current?.verdict!=='pending')return json({error:'submission-not-pending'},409);
      if(await catalog.get(slug,true))return json({error:'slug-conflict'},409);
      if(await catalog.duplicate(target.projectKey))return json({error:'duplicate-product'},409);
      return json({error:'daily-cap-reached',limit:9,day,timeZone:'UTC'},409);
    }
    return json({ok:true,id,verdict:'approved',tool:value});
  } catch(error) {if(String(error).includes('link_verification_nonces.nonce'))return json({error:'verification-replayed'},409);if(String(error).includes('managed_tools.slug'))return json({error:'slug-conflict'},409);if(String(error).includes('dedupe_key')||String(error).includes('duplicate-product'))return json({error:'duplicate-product'},409);throw error;}
}

async function verificationResult(request:Request,env:Env,slug:string):Promise<Response> {
  const tool=await new CatalogRepository(env.DB).get(slug,true);if(!tool)return json({error:'product-not-found'},404);
  const input=await jsonBody(request),proof=await proofFor(input.verification,tool,env);if(!proof)return json({error:'verification-required'},400);
  const now=new Date().toISOString(),previous=tool.updatedAt!,expectedVersion=version(tool);applyVerification(tool,proof);if(proof.state==='live')tool.lastSeenAt=now.slice(0,10);tool.contentVersion=randomToken().slice(0,16);tool.updatedAt=now;
  try {const result=await env.DB.batch([
    env.DB.prepare("UPDATE managed_tools SET content_json=?,updated_at=? WHERE slug=? AND updated_at=? AND COALESCE(json_extract(content_json,'$.contentVersion'),updated_at)=?").bind(JSON.stringify(tool),now,slug,previous,expectedVersion),
    proofStatement(env,proof,tool),cardStatement(env,tool,now),eventStatement(env,tool,'verified',now),
  ]);return result[0].meta.changes?json({ok:true,tool}):json({error:'content-changed'},409);
  }catch(error){if(String(error).includes('link_verification_nonces.nonce'))return json({error:'verification-replayed'},409);throw error;}
}

export async function handleAdmin(request:Request,env:Env):Promise<Response> {
  const path=new URL(request.url).pathname;
  if(path==='/api/admin/session'&&request.method==='POST') {
    requireOrigin(request);const input=await jsonBody(request),token=typeof input.token==='string'?input.token:'';
    if(!await authLimit(request,env.DB,'admin-login','admin',20,10))return json({error:'try-later'},429);
    if(!env.ADMIN_API_TOKEN||!constantTimeEqual(token,env.ADMIN_API_TOKEN))return json({error:'unauthorized'},401);
    const session=randomToken(),now=new Date();await env.DB.prepare('INSERT INTO admin_sessions(token_hash,credential_hash,created_at,expires_at) VALUES(?,?,?,?)')
      .bind(await sha256(session),await sha256(env.ADMIN_API_TOKEN),now.toISOString(),new Date(now.getTime()+3_600_000).toISOString()).run();
    return json({ok:true},200,{'set-cookie':secureCookie(ADMIN_COOKIE,session,3600)});
  }
  if(!await authorized(request,env))return json({error:'unauthorized'},401);
  if(path==='/api/admin/logout'&&request.method==='POST') {
    const token=readCookie(request,ADMIN_COOKIE);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return json({ok:true},200,{'set-cookie':secureCookie(ADMIN_COOKIE,'',0)});
  }
  if(path==='/api/admin/metrics'&&request.method==='GET')return json(await adminMetrics(env));
  if(path==='/api/admin/submissions'&&request.method==='GET') {
    const result=await env.DB.prepare("SELECT id,name,url,email,category,notes,make_a_wish,created_at,verdict FROM submissions WHERE verdict='pending' ORDER BY created_at,id LIMIT 100").all();return json({submissions:result.results ?? []});
  }
  if(path==='/api/admin/content'&&request.method==='GET') {
    const params=new URL(request.url).searchParams;return json(await new CatalogRepository(env.DB).adminPage(Number(params.get('limit') ?? 50),params.get('cursor') ?? ''));
  }
  const content=/^\/api\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  const aliases=/^\/api\/admin\/content\/([a-z0-9-]+)\/aliases$/.exec(path);
  if(aliases) {
    const tool=await new CatalogRepository(env.DB).get(aliases[1],true);if(!tool)return json({error:'product-not-found'},404);
    if(request.method==='GET'){const rows=await env.DB.prepare('SELECT alias_key,source_url,reason,created_at FROM product_identity_aliases WHERE slug=? ORDER BY created_at').bind(aliases[1]).all();return json({aliases:rows.results ?? []});}
    if(request.method!=='POST')return json({error:'method-not-allowed'},405);
    const input=await jsonBody(request),target=canonicalProductUrl(stringField(input,'url',2048,true)),reason=stringField(input,'reason',1000,true);if(!target||reason.length<20)throw new HttpError('alias-needs-public-url-and-review-reason');
    if(await new CatalogRepository(env.DB).duplicate(target.projectKey,aliases[1]))return json({error:'duplicate-product'},409);
    try{await env.DB.prepare('INSERT INTO product_identity_aliases(alias_key,slug,source_url,reason,created_at) VALUES(?,?,?,?,?)').bind(target.projectKey,aliases[1],target.url,reason,new Date().toISOString()).run();return json({ok:true},201);}
    catch(error){if(String(error).includes('duplicate-product')||String(error).includes('alias_key'))return json({error:'duplicate-product'},409);throw error;}
  }
  if(content&&request.method==='GET') {const tool=await new CatalogRepository(env.DB).get(content[1],true);return tool?json({tool}):json({error:'product-not-found'},404);}
  if(content&&request.method==='PUT')return putContent(request,env,content[1]);
  const approval=/^\/api\/admin\/submissions\/(\d+)\/(approve|reject)$/.exec(path);
  if(approval&&request.method==='POST')return approveSubmission(request,env,Number(approval[1]),approval[2]);
  const verification=/^\/api\/admin\/content\/([a-z0-9]+(?:-[a-z0-9]+)*)\/verification$/.exec(path);
  if(verification&&request.method==='POST')return verificationResult(request,env,verification[1]);
  if(path==='/api/admin/outbox'&&request.method==='GET') {
    const result=await env.DB.prepare('SELECT id,kind,recipient,submission_id,state,attempts,next_attempt_at,created_at,accepted_at,message_id,last_error FROM notification_outbox ORDER BY created_at DESC LIMIT 100').all();return json({notifications:result.results ?? []});
  }
  if(path==='/api/admin/outbox/retry'&&request.method==='POST') {
    const input=await jsonBody(request),id=stringField(input,'id',256,true);
    const result=await env.DB.prepare("UPDATE notification_outbox SET state='queued',attempts=0,next_attempt_at=?,lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=? AND state='failed'").bind(new Date().toISOString(),id).run();
    return result.meta.changes?json({ok:true}):json({error:'notification-not-retryable'},409);
  }
  if(path==='/api/admin/outbox/dispatch'&&request.method==='POST')return json(await dispatchOutbox(env));
  if(path==='/api/admin/corrections'&&request.method==='GET') {
    const result=await env.DB.prepare("SELECT c.id,c.slug,c.message,c.state,c.created_at,a.email FROM correction_requests c JOIN accounts a ON a.id=c.account_id WHERE c.state='pending' ORDER BY c.created_at LIMIT 100").all();return json({corrections:result.results ?? []});
  }
  const correction=/^\/api\/admin\/corrections\/(\d+)$/.exec(path);
  if(correction&&request.method==='PATCH') {
    const input=await jsonBody(request);if(!['resolved','rejected'].includes(String(input.state)))throw new HttpError('invalid-state');
    const note=stringField(input,'note',1000),now=new Date().toISOString();
    const result=await env.DB.prepare("UPDATE correction_requests SET state=?,admin_note=?,decided_at=? WHERE id=? AND state='pending'").bind(String(input.state),note,now,Number(correction[1])).run();
    return result.meta.changes?json({ok:true}):json({error:'correction-not-pending'},409);
  }
  if(path==='/api/admin/collections'&&request.method==='GET') {const rows=await env.DB.prepare('SELECT * FROM collections ORDER BY updated_at DESC LIMIT 100').all();return json({collections:rows.results ?? []});}
  const collection=/^\/api\/admin\/collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  if(collection&&request.method==='PUT') {
    const input=await jsonBody(request),title=stringField(input,'title',100,true),description=stringField(input,'description',600,true);
    if(!Array.isArray(input.slugs)||input.slugs.length<1||input.slugs.length>24||input.slugs.some(s=>typeof s!=='string'||!SLUG_RE.test(s)))throw new HttpError('invalid-slugs');
    const slugs=[...new Set(input.slugs as string[])];if((await new CatalogRepository(env.DB).bySlugs(slugs)).length!==slugs.length)throw new HttpError('collection-products-must-be-public');
    if(typeof input.approved!=='boolean')throw new HttpError('approval-required');const now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO collections(slug,title,description,tool_slugs_json,approved,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description,tool_slugs_json=excluded.tool_slugs_json,approved=excluded.approved,updated_at=excluded.updated_at`)
        .bind(collection[1],title,description,JSON.stringify(slugs),input.approved?1:0,now,now),
      env.DB.prepare('UPDATE catalog_meta SET version=version+1 WHERE id=1'),
    ]);return json({ok:true});
  }
  if(path==='/api/admin/source-runs'&&request.method==='POST') {
    const input=await jsonBody(request),source=stringField(input,'source',80,true),detail=stringField(input,'detail',1000);
    if(!['succeeded','failed','partial'].includes(String(input.state))||!Number.isSafeInteger(input.candidates)||Number(input.candidates)<0)throw new HttpError('invalid-input');
    await env.DB.prepare('INSERT INTO source_runs(id,source,state,candidates,detail,observed_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),source,String(input.state),Number(input.candidates),detail,new Date().toISOString()).run();return json({ok:true},201);
  }
  if(path==='/api/admin/releases'&&request.method==='POST') {
    const input=await jsonBody(request),revision=stringField(input,'revision',64,true);
    if(!/^[a-f0-9]{7,64}$/.test(revision)||!input.states||typeof input.states!=='object'||Array.isArray(input.states))throw new HttpError('invalid-input');
    await env.DB.prepare('INSERT INTO release_runs(id,revision,states_json,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(),revision,JSON.stringify(input.states),new Date().toISOString()).run();return json({ok:true},201);
  }
  return json({error:'not-found'},404);
}
