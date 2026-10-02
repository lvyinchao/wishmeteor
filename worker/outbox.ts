import { escapeHtml } from '../src/lib/html.ts';
import { isDofollow } from '../src/lib/link-policy.ts';
import { CatalogRepository } from './catalog.ts';
import { randomToken } from './security.ts';

export interface MailPayload {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  tokenHash?: string;
  accountId?: string;
  slug?: string;
  cardUrl?: string;
}
export interface OutboxEnv { DB: D1Database; EMAIL?: SendEmail; APP_ORIGIN?: string }
export interface OutboxRow {
  id: string; kind: string; recipient: string; payload_json: string;
  submission_id: number | null; attempts: number; lease_token: string;
}

export function enqueueStatement(db: D1Database,id: string,kind: string,recipient: string,payload: MailPayload,submissionId: number | null=null,now=new Date().toISOString()): D1PreparedStatement {
  return db.prepare(`INSERT INTO notification_outbox(id,kind,recipient,payload_json,submission_id,next_attempt_at,created_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(id,kind,recipient,JSON.stringify(payload),submissionId,now,now);
}

export function approvalMail(tool: {slug:string;name:string;url:string;description:string;approved:boolean;status:string;lastVerifiedAt:string|null;checksFailed:number;contentVersion?:string;wish?:{blessingLong?:string}},origin: string): MailPayload {
  const page=`${origin}/tool/${tool.slug}`;
  const card=`${page}/card.png${tool.contentVersion ? '?v='+encodeURIComponent(tool.contentVersion) : ''}`;
  const blessing=tool.wish?.blessingLong ?? '';
  const policy=isDofollow(tool) ? 'Your official-site link currently meets our verified-link policy.' : 'Your official-site link is marked nofollow until it passes our verification policy.';
  return {
    slug:tool.slug,cardUrl:card,subject:`${tool.name} is live on WishMeteor`,
    text:`Your project is live: ${page}\n\n${blessing}\n\nDownload your blessing card: ${card}\n${policy}\n\nYou can request a correction from your account.`,
    html:`<p>Your project <strong>${escapeHtml(tool.name)}</strong> is live on WishMeteor.</p><p><a href="${escapeHtml(page)}">Read the listing</a></p><blockquote>${escapeHtml(blessing)}</blockquote><p><a href="${escapeHtml(card)}">Download your blessing card</a></p><p>${escapeHtml(policy)}</p><p>You can request a correction from your account.</p>`,
  };
}

async function eligible(db: D1Database,row: OutboxRow,payload: MailPayload,now: string): Promise<boolean> {
  if (payload.tokenHash) {
    return !!await db.prepare('SELECT token_hash FROM email_verifications WHERE token_hash = ? AND expires_at > ?').bind(payload.tokenHash,now).first();
  }
  if (row.kind==='product-update' && payload.accountId && payload.slug) {
    return !!await db.prepare(`SELECT p.slug FROM account_projects p JOIN accounts a ON a.id=p.account_id JOIN managed_tools t ON t.slug=p.slug
      WHERE p.account_id=? AND p.slug=? AND p.following=1 AND a.email_verified_at IS NOT NULL AND t.approved=1 AND t.status!='archived'`)
      .bind(payload.accountId,payload.slug).first();
  }
  if (row.kind==='approved' && payload.slug) {
    return !!await db.prepare("SELECT slug FROM managed_tools WHERE slug=? AND approved=1 AND status!='archived'").bind(payload.slug).first();
  }
  return true;
}

export async function dispatchOutbox(env: OutboxEnv,limit=20,nowMs=Date.now()): Promise<{accepted:number;failed:number;cancelled:number}> {
  const counts={accepted:0,failed:0,cancelled:0};
  if (!env.EMAIL) return counts;
  const now=new Date(nowMs).toISOString();
  const rows=await env.DB.prepare(`SELECT id FROM notification_outbox WHERE attempts<6 AND
    ((state='queued' AND next_attempt_at<=?) OR (state='processing' AND lease_until<=?))
    ORDER BY next_attempt_at,id LIMIT ?`).bind(now,now,Math.max(1,Math.min(limit,50))).all<{id:string}>();
  for (const candidate of rows.results ?? []) {
    const lease=randomToken();
    const row=await env.DB.prepare(`UPDATE notification_outbox SET state='processing',attempts=attempts+1,lease_token=?,lease_until=?
      WHERE id=? AND attempts<6 AND ((state='queued' AND next_attempt_at<=?) OR (state='processing' AND lease_until<=?)) RETURNING *`)
      .bind(lease,new Date(nowMs+300_000).toISOString(),candidate.id,now,now).first<OutboxRow>();
    if (!row) continue;
    let payload: MailPayload;
    try {
      payload=JSON.parse(row.payload_json) as MailPayload;
      if (!await eligible(env.DB,row,payload,now)) {
        await env.DB.prepare("UPDATE notification_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?").bind(row.id,lease).run();
        counts.cancelled++;continue;
      }
      if(row.kind==='approved'&&payload.slug) {
        const current=await new CatalogRepository(env.DB).get(payload.slug);
        if(!current)throw Object.assign(new Error('notification-ineligible'),{code:'RECIPIENT_INVALID'});
        payload=approvalMail(current,(env.APP_ORIGIN ?? 'https://wishmeteor.net').replace(/\/$/,''));
        await env.DB.prepare('UPDATE notification_outbox SET payload_json=? WHERE id=? AND lease_token=?').bind(JSON.stringify(payload),row.id,lease).run();
      }
      const receipt=await env.EMAIL.send({to:row.recipient,from:'support@wishmeteor.net',subject:payload.subject,text:payload.text,html:payload.html,
        ...(payload.replyTo?{replyTo:payload.replyTo}:{}),headers:{'X-WishMeteor-Event':row.id}});
      const updates=[env.DB.prepare(`UPDATE notification_outbox SET state='accepted',accepted_at=?,message_id=?,last_error=NULL,lease_token=NULL,lease_until=NULL
        WHERE id=? AND lease_token=?`).bind(now,receipt.messageId ?? null,row.id,lease)];
      if (row.submission_id!==null && row.kind==='receipt') updates.push(env.DB.prepare('UPDATE submissions SET submission_email_sent_at=? WHERE id=?').bind(now,row.submission_id));
      if (row.submission_id!==null && ['approved','rejected'].includes(row.kind)) updates.push(env.DB.prepare('UPDATE submissions SET verdict_email_sent_at=?,notified_at=? WHERE id=?').bind(now,now,row.submission_id));
      await env.DB.batch(updates);counts.accepted++;
    } catch (error) {
      const code=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
      const permanent=/SUPPRESS|RECIPIENT_INVALID|RECIPIENT_NOT_VERIFIED|BOUNCE/.test(code);
      const failed=permanent || row.attempts>=6;
      // Do not persist message bodies, tokens, or recipient addresses in diagnostics.
      const detail=code ? code.slice(0,80) : 'temporary-send-failure';
      const delay=Math.min(21_600_000,60_000 * 2 ** row.attempts);
      await env.DB.prepare(`UPDATE notification_outbox SET state=?,next_attempt_at=?,last_error=?,lease_token=NULL,lease_until=NULL
        WHERE id=? AND lease_token=?`).bind(failed?'failed':'queued',new Date(nowMs+delay).toISOString(),detail,row.id,lease).run();
      counts.failed++;
    }
  }
  return counts;
}

export async function cleanupState(db: D1Database,now=new Date()): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now.toISOString()),
    db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now.toISOString()),
    db.prepare('DELETE FROM anonymous_voters WHERE expires_at<=?').bind(now.toISOString()),
    db.prepare('DELETE FROM email_verifications WHERE expires_at<=?').bind(now.toISOString()),
    db.prepare('DELETE FROM auth_rate_limits WHERE expires_at<? OR expires_at=0').bind(now.getTime()),
    db.prepare('DELETE FROM link_verification_nonces WHERE expires_at<?').bind(now.getTime()),
    db.prepare("UPDATE notification_outbox SET state='failed',last_error='lease-expired-after-final-attempt',lease_token=NULL,lease_until=NULL WHERE state='processing' AND lease_until<=? AND attempts>=6").bind(now.toISOString()),
  ]);
}
