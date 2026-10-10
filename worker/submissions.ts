import { automaticSubmissionAccount } from './submission-policy.ts';
import { SCREENSHOT_MAX,validateScreenshot,screenshotPath } from './screenshots.ts';
import { cardStatement,eventStatement } from './publication.ts';
import { canonicalProductUrl,CATEGORY_NAMES,validateTool,blessingErrors } from '../src/lib/tool-schema.ts';
import { escapeHtml } from '../src/lib/html.ts';
import { CatalogRepository } from './catalog.ts';
import { getSessionAccount } from './auth.ts';
import { getApiCredentialAccount,submissionAccount } from './api-credentials.ts';
import { boundedBody,boundedBytes,HttpError,json,jsonBody,requireOrigin,stringField } from './http.ts';
import { consumeLimits,requestIp,sha256 } from './security.ts';
import { approvalMail,enqueueStatement,type MailPayload } from './outbox.ts';
import type { Env } from './env.ts';

const BLOCKED=['trendylinkz','backlinks4u','seo-linkz','dofollow-directory'];
interface SubmissionInput {name:string;url:string;email:string;category:string;notes:string;makeAWish:string}
function validateSubmission(input:Record<string,unknown>,requireOwnership=true):SubmissionInput {
  if(requireOwnership&&input.own!=='yes')throw new HttpError('ownership-required');
  const name=stringField(input,'name',80,true),url=stringField(input,'url',2048,true),email=stringField(input,'email',254,true).toLowerCase();
  const category=stringField(input,'category',40) || 'uncategorized';
  if(!Object.hasOwn(CATEGORY_NAMES,category)||!/^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email))throw new HttpError('invalid-input');
  const target=canonicalProductUrl(url);if(!target||BLOCKED.some(b=>target.domain.includes(b)))throw new HttpError('invalid-link');
  return {name,url:target.url,email,category,notes:stringField(input,'notes',600),makeAWish:stringField(input,'makeAWish',320)};
}
async function formOrJson(request:Request):Promise<Record<string,unknown>> {
  if((request.headers.get('content-type') ?? '').includes('application/json'))return jsonBody(request,12_000);
  const type=request.headers.get('content-type') ?? '';
  if(type.startsWith('application/x-www-form-urlencoded'))return Object.fromEntries(new URLSearchParams(await boundedBody(request,12_000)));
  if(type.startsWith('multipart/form-data')) {
    const bytes=await boundedBytes(request,SCREENSHOT_MAX+16_000);
    let form:FormData;try{form=await new Response(bytes,{headers:{'content-type':type}}).formData();}catch{throw new HttpError('invalid-input');}
    const result:Record<string,unknown>=Object.create(null);for(const [key,value] of form) {if(Object.hasOwn(result,key)||(key!=='screenshot'&&typeof value!=='string'))throw new HttpError('invalid-input');result[key]=value;}return result;
  }
  throw new HttpError('unsupported-form',415);
}
function responseForSubmission(request:Request,status:string,id?:number,slug?:string):Response {
  if(request.headers.has('authorization')||(request.headers.get('content-type') ?? '').includes('application/json')||(request.headers.get('accept') ?? '').includes('application/json')) {
    const codes:Record<string,number>={queued:201,published:201,'screenshot-too-large':413,duplicate:409,throttled:429,rejected:400};
    return json(['queued','published'].includes(status)?{ok:true,status,id,...(slug?{slug}:{})}:{error:status},codes[status] ?? 400);
  }
  const target=new URL('/submit',new URL(request.url).origin);target.searchParams.set('status',status);if(slug)target.searchParams.set('slug',slug);
  return new Response(null,{status:303,headers:{location:target.href,'cache-control':'no-store'}});
}

function submissionMail(submission:SubmissionInput,target:{url:string},origin:string,account:unknown):{support:MailPayload;receipt:MailPayload} {
  const support:MailPayload={subject:'New product submission for WishMeteor',replyTo:submission.email,
    text:`${submission.name}\n${target.url}\n${submission.email}\nCategory: ${submission.category}\n\n${submission.notes}\n\nMaker wish: ${submission.makeAWish}\n\nReview at ${origin}/admin`,
    html:`<p>A new project is waiting for review.</p><dl><dt>Product</dt><dd>${escapeHtml(submission.name)}</dd><dt>Homepage</dt><dd><a href="${escapeHtml(target.url)}">${escapeHtml(target.url)}</a></dd><dt>Submitter</dt><dd>${escapeHtml(submission.email)}</dd><dt>Category</dt><dd>${escapeHtml(submission.category)}</dd></dl><h2>What it does</h2><p>${escapeHtml(submission.notes)}</p><h2>Maker wish</h2><p>${escapeHtml(submission.makeAWish)}</p><p><a href="${origin}/admin">Review submissions</a></p>`};
  const receipt:MailPayload={subject:`We received ${submission.name} for WishMeteor`,text:`Your project ${submission.name} is pending review. We will email you when the review changes its status.${account?' Check progress at '+origin+'/account':''}`,
    html:`<p>Your project <strong>${escapeHtml(submission.name)}</strong> is pending review.</p><p>We will email you when the review changes its status.</p>${account?`<p><a href="${origin}/account">Check progress</a></p>`:''}`};
  return {support,receipt};
}

export async function handleSubmit(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')return json({error:'method-not-allowed'},405);
  const apiAccount=await getApiCredentialAccount(request,env);
  if(!apiAccount)requireOrigin(request);
  const input=await formOrJson(request);
  if(stringField(input,'hp',200))return responseForSubmission(request,'queued');
  let submission:SubmissionInput;
  try{submission=validateSubmission(input);}catch(error){if(error instanceof HttpError)return responseForSubmission(request,'rejected');throw error;}
  if(apiAccount&&submission.email!==apiAccount.email.toLowerCase())throw new HttpError('email-account-mismatch',403);
  const target=canonicalProductUrl(submission.url)!;
  let screenshot;try{screenshot=await validateScreenshot(input.screenshot);}catch(error){if(error instanceof HttpError)return responseForSubmission(request,error.code);throw error;}
  const account=apiAccount ?? await getSessionAccount(request,env),automatic=automaticSubmissionAccount(account);
  if(!automatic&&!await consumeLimits(env.DB,'submit',[{key:'ip:'+requestIp(request),maximum:5},{key:'email:'+submission.email,maximum:5}]))return responseForSubmission(request,'throttled');
  const catalog=new CatalogRepository(env.DB);
  if(await catalog.duplicate(target.projectKey))return responseForSubmission(request,'duplicate');
  const pending=await env.DB.prepare("SELECT id FROM submissions WHERE verdict='pending' AND dedupe_key=? LIMIT 1").bind(target.projectKey).first();
  if(pending)return responseForSubmission(request,'duplicate');
  // Automatic listings use the maker's real text instead of invented product claims.
  if(automatic&&submission.notes.length<300)return responseForSubmission(request,'description-required');
  const now=new Date().toISOString(),origin=(env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/$/,'');
  const ipHash=await sha256('wishmeteor-submission:'+requestIp(request));
  const {support,receipt}=submissionMail(submission,target,origin,account);
  const screenshotKey=crypto.randomUUID()+'.'+screenshot.extension;
  await env.PRODUCT_SCREENSHOTS.put(screenshotKey,screenshot.bytes,{httpMetadata:{contentType:screenshot.type}});
  try {
    if(automatic)return await publishAutomatic(request,env,submission,account!.id,target,screenshotKey,ipHash,now,origin);
    const results=await env.DB.batch([
      env.DB.prepare(`INSERT INTO submissions(name,url,domain,root_domain,dedupe_key,email,category,notes,make_a_wish,ip_hash,created_at,verdict,account_id,screenshot_key)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)`).bind(submission.name,target.url,target.domain,target.domain,target.projectKey,submission.email,submission.category,submission.notes,submission.makeAWish,ipHash,now,account?.id ?? null,screenshotKey),
      env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at)
        SELECT 'support:'||last_insert_rowid(),'support',?,?,last_insert_rowid(),?,?`).bind('support@wishmeteor.net',JSON.stringify(support),now,now),
      env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at)
        SELECT 'receipt:'||submission_id,'receipt',?,?,submission_id,?,? FROM notification_outbox WHERE id='support:'||(SELECT MAX(id) FROM submissions WHERE ip_hash=? AND created_at=?)`)
        .bind(submission.email,JSON.stringify(receipt),now,now,ipHash,now),
    ]);
    return responseForSubmission(request,'queued',Number(results[0].meta.last_row_id));
  } catch(error) {
    // Never remove a cover when the transaction committed but its response was lost.
    try{const stored=await env.DB.prepare('SELECT id FROM submissions WHERE screenshot_key=?').bind(screenshotKey).first();if(!stored)await env.PRODUCT_SCREENSHOTS.delete(screenshotKey);}catch{/* Keep bytes if the commit outcome cannot be checked. */}
    if(String(error).includes('dedupe_key')||String(error).includes('duplicate-product'))return responseForSubmission(request,'duplicate');
    throw error;
  }
}

async function publishAutomatic(request:Request,env:Env,submission:SubmissionInput,accountId:string,target:NonNullable<ReturnType<typeof canonicalProductUrl>>,screenshotKey:string,ipHash:string,now:string,origin:string):Promise<Response> {
  const base=(submission.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70).replace(/-$/,'')||'product');
  const slug=base+'-'+crypto.randomUUID().slice(0,8);
  const day=now.slice(0,10),operation=crypto.randomUUID();
  const {value,errors}=validateTool({name:submission.name,url:target.url,category:submission.category,
    summary:submission.notes.replace(/\s+/g,' ').slice(0,160),description:submission.notes,tags:[submission.category],pricing:'unknown',status:'active',origin:'submitted',approved:true,
    coverImage:screenshotPath(screenshotKey),linkPolicy:'dofollow',sources:[{type:'submitter',url:target.url,observedAt:day}],firstSeenAt:day,
    wish:{submittedAt:day,makerWish:submission.makeAWish,blessingApproved:true,blessingShort:'May your next chapter shine.',
      blessingLong:`May ${submission.name} find the people who need it. May thoughtful feedback, patient collaborators, and each small improvement help your idea grow. We wish you clarity for the next step and a welcoming community as you bring this project into the world.`}},slug);
  if(errors.length||blessingErrors(value).length)throw new HttpError('invalid-content');
  Object.assign(value,{submittedAt:now,approvedAt:now,publishedAt:now,updatedAt:now,contentVersion:crypto.randomUUID().slice(0,16)});
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO submissions(name,url,domain,root_domain,dedupe_key,email,category,notes,make_a_wish,ip_hash,created_at,verdict,account_id,screenshot_key,verdict_at,approved_slug,publication_operation)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,?,?)`).bind(submission.name,target.url,target.domain,target.domain,target.projectKey,submission.email,submission.category,submission.notes,submission.makeAWish,ipHash,now,accountId,screenshotKey,now,slug,operation),
    env.DB.prepare('INSERT INTO managed_tools(slug,content_json,root_domain,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(slug,JSON.stringify(value),target.domain,target.projectKey,now,now),
    cardStatement(env,value,now),eventStatement(env,value,'published',now),
    env.DB.prepare('INSERT INTO publication_days(day,used,exception_used) VALUES(?,0,1) ON CONFLICT(day) DO UPDATE SET exception_used=exception_used+1').bind(day),
    env.DB.prepare(`INSERT INTO publication_exceptions(submission_id,batch_key,day,publication_operation,created_at) SELECT id,?,?,?,? FROM submissions WHERE publication_operation=?`).bind('trusted-account:'+accountId,day,operation,now,operation),
    env.DB.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at) SELECT 'approved:'||id,'approved',?,?,id,?,? FROM submissions WHERE publication_operation=?`).bind(submission.email,JSON.stringify(approvalMail(value,origin)),now,now,operation),
  ]);
  return responseForSubmission(request,'published',Number(results[0].meta.last_row_id),slug);
}

export async function handleMySubmissions(request:Request,env:Env):Promise<Response> {
  if(request.method!=='GET')return json({error:'method-not-allowed'},405);
  const account=await submissionAccount(request,env);if(!account)return json({error:'not-signed-in'},401);
  const result=await env.DB.prepare(`SELECT s.id,s.name,s.url,s.email,s.category,s.notes,s.make_a_wish,s.created_at,s.verdict,s.verdict_at,s.screenshot_key,
    CASE WHEN t.approved=1 AND t.status!='archived' THEN t.slug ELSE NULL END AS slug,
    (SELECT n.state FROM notification_outbox n WHERE n.submission_id=s.id AND n.kind IN ('receipt','approved','rejected') ORDER BY n.created_at DESC,n.id DESC LIMIT 1) AS notification_state
    FROM submissions s LEFT JOIN managed_tools t ON t.slug=s.approved_slug WHERE s.account_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 100`)
    .bind(account.id).all();return json({submissions:result.results ?? []});
}

export async function mutateSubmission(request:Request,env:Env,id:number):Promise<Response> {
  requireOrigin(request);const account=await getSessionAccount(request,env);if(!account)return json({error:'not-signed-in'},401);
  const owned=await env.DB.prepare('SELECT verdict,screenshot_key FROM submissions WHERE id=? AND account_id=?').bind(id,account.id).first<{verdict:string;screenshot_key:string|null}>();
  if(!owned)return json({error:'submission-not-found'},404);if(owned.verdict!=='pending')return json({error:'submission-locked'},409);
  if(request.method==='DELETE') {
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE submission_id=? AND state IN ('queued','processing')
        AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND account_id=? AND verdict='pending')`).bind(id,id,account.id),
      env.DB.prepare("DELETE FROM submissions WHERE id=? AND account_id=? AND verdict='pending'").bind(id,account.id),
    ]);if(results[1].meta.changes&&owned.screenshot_key)await env.PRODUCT_SCREENSHOTS.delete(owned.screenshot_key);return results[1].meta.changes?json({ok:true}):json({error:'submission-locked'},409);
  }
  if(request.method!=='PATCH')return json({error:'method-not-allowed'},405);
  if(!await consumeLimits(env.DB,'submission-edit',[{key:'account:'+account.id,maximum:30},{key:'ip:'+requestIp(request),maximum:60}]))return json({error:'try-later'},429);
  const input=await jsonBody(request,12_000),submission=validateSubmission(input,false),target=canonicalProductUrl(submission.url)!;
  if(await new CatalogRepository(env.DB).duplicate(target.projectKey))return json({error:'duplicate'},409);
  const duplicate=await env.DB.prepare("SELECT id FROM submissions WHERE verdict='pending' AND id!=? AND dedupe_key=? LIMIT 1").bind(id,target.projectKey).first();
  if(duplicate)return json({error:'duplicate'},409);
  try {
    const {support,receipt}=submissionMail(submission,target,(env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/$/,''),account);
    const updates=await env.DB.batch([
      env.DB.prepare(`UPDATE submissions SET name=?,url=?,domain=?,root_domain=?,dedupe_key=?,email=?,category=?,notes=?,make_a_wish=?
        WHERE id=? AND account_id=? AND verdict='pending' AND NOT EXISTS(SELECT 1 FROM notification_outbox WHERE submission_id=? AND state='processing')`)
        .bind(submission.name,target.url,target.domain,target.domain,target.projectKey,submission.email,submission.category,submission.notes,submission.makeAWish,id,account.id,id),
      ...(['support','receipt'] as const).map(kind=>env.DB.prepare(`UPDATE notification_outbox SET recipient=?,payload_json=? WHERE submission_id=? AND kind=? AND state='queued'
        AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND account_id=? AND verdict='pending' AND email=? AND url=? AND name=?) AND NOT EXISTS(SELECT 1 FROM notification_outbox busy WHERE busy.submission_id=? AND busy.state='processing')`)
        .bind(kind==='support'?'support@wishmeteor.net':submission.email,JSON.stringify(kind==='support'?support:receipt),id,kind,id,account.id,submission.email,target.url,submission.name,id)),
    ]);
    return updates[0].meta.changes?json({ok:true}):json({error:'submission-busy-or-locked'},409);
  } catch(error) {if((String(error).includes('dedupe_key')||String(error).includes('duplicate-product')))return json({error:'duplicate'},409);throw error;}
}

export async function requestCorrection(request:Request,env:Env,slug:string):Promise<Response> {
  if(request.method!=='POST')return json({error:'method-not-allowed'},405);
  requireOrigin(request);const account=await getSessionAccount(request,env);if(!account)return json({error:'sign-in-required'},401);
  const tool=await new CatalogRepository(env.DB).get(slug);if(!tool)return json({error:'product-not-found'},404);
  const input=await jsonBody(request),message=stringField(input,'message',2000,true);
  if(message.length<10)return json({error:'correction-too-short'},400);
  if(!await consumeLimits(env.DB,'correction',[{key:'account:'+account.id,maximum:3},{key:'ip:'+requestIp(request),maximum:10}]))return json({error:'try-later'},429);
  const now=new Date().toISOString();
  const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO correction_requests(account_id,slug,message,created_at) VALUES(?,?,?,?)').bind(account.id,slug,message,now),
    enqueueStatement(env.DB,'correction:'+crypto.randomUUID(),'correction','support@wishmeteor.net',{subject:'A WishMeteor listing needs a correction',replyTo:account.email,text:`${tool.name}\n${message}\nReview in the moderation workbench.`,html:`<p>${escapeHtml(tool.name)}</p><p>${escapeHtml(message)}</p><p>Review in the moderation workbench.</p>`},null,now),
  ]);
  return json({ok:true,id:results[0].meta.last_row_id},201);
}
