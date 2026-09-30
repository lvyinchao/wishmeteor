#!/usr/bin/env node
/**
 * Sends the blessing email for every published wish that is waiting on one.
 *
 * Runs strictly AFTER a successful deploy: the email embeds the card image and the entry
 * URL, both of which are served by this site.
 *
 *   pnpm notify -- --dry    show what would be sent, send nothing
 *   pnpm notify -- --local  read verdicts from the local database
 *
 * Transport is Cloudflare Email Service (Email Sending) over its REST endpoint:
 * POST /accounts/{id}/email/sending/send. The credential is either CF_API_TOKEN or the
 * OAuth token that wrangler keeps in its own config — `pnpm ship` runs `wrangler deploy`
 * immediately before this script, so that token is fresh by the time we need it, and no
 * long-lived secret has to be pasted anywhere. The token is never printed.
 * Exits 3 when a blessing is waiting but no credential is available — it never marks
 * anything as notified on a send it did not perform.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from './lib/cli.mjs';
import { loadCatalog, PATHS } from '../src/lib/catalog.mjs';
import { loadEnv } from './lib/env.mjs';
import { makeD1 } from './lib/d1.mjs';
import { SITE } from '../src/lib/site.ts';
import { OG } from '../src/lib/og.mjs';

const args = parseArgs();
const DRY = Boolean(args.dry);
const today = new Date().toISOString().slice(0, 10);
loadEnv();

const ACCOUNT = process.env.CF_ACCOUNT_ID ?? '3c772e18744e927e0eda39ca57aac390';

/** Prefer an explicit API token; fall back to wrangler's own (short-lived) OAuth token. */
function readCredential() {
  if (process.env.CF_API_TOKEN) return { token: process.env.CF_API_TOKEN, source: 'CF_API_TOKEN' };
  const file = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  if (!existsSync(file)) return null;
  const oauth = /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(file, 'utf8'))?.[1];
  return oauth ? { token: oauth, source: 'wrangler oauth' } : null;
}

const credential = readCredential();
const fromAddress = /<([^>]+)>/.exec(process.env.EMAIL_FROM ?? SITE.sender)?.[1] ?? SITE.email;

const { tools, errors } = loadCatalog();
if (errors.length) {
  console.error(`content invalid, refusing to send:\n${errors.join('\n')}`);
  process.exit(1);
}

const waiting = tools.filter((entry) => entry.origin === 'submitted' && entry.wish && !entry.wish.notifiedAt);
if (!waiting.length) {
  console.log('No published wishes are waiting for a blessing email.');
  process.exit(0);
}
if (!credential && !DRY) {
  console.error(`No Cloudflare credential available, and ${waiting.length} blessing(s) are waiting.\nRun any wrangler command to refresh its token, or set CF_API_TOKEN in .env.\nNothing was sent and nothing is marked notified.`);
  process.exit(3);
}

/** The message body: a plain-text version for deliverability, an HTML version for humans. */
function message(entry) {
  const page = `${SITE.url}/tool/${entry.slug}`;
  const card = `${SITE.url}${OG.tool(entry.slug)}`;
  const text = [
    'Hello,',
    '',
    `Your wish lit up. ${entry.name} is live on ${SITE.name} at ${page}`,
    '',
    'The blessing we wrote for it:',
    `"${entry.wish.blessingLong}"`,
    '',
    `The card is at ${card} if you want to share it, and this is the only link we ever ask for:`,
    `[${entry.name} — launched on ${SITE.name}](${page})`,
    '',
    'Your link is dofollow and stays that way while the page resolves. If it ever breaks we re-check and email you before it loses anything. Want it changed or taken down? Reply to this email; no reason needed.',
    '',
    `— ${SITE.name}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5fa;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2033">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e5f0">
  <div style="padding:22px 26px;background:#0b1226;color:#e9edfa;font-size:15px;letter-spacing:.12em;text-transform:uppercase">Your wish is live</div>
  <div style="padding:26px">
    <p style="margin:0 0 14px">Hello,</p>
    <p style="margin:0 0 18px"><strong>${entry.name}</strong> is live on ${SITE.name} — with a dofollow link, and a blessing written for it.</p>
    <p style="margin:0 0 18px"><a href="${page}" style="background:#ffd166;color:#241a04;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:600;display:inline-block">See the entry →</a></p>
    <blockquote style="margin:0 0 20px;padding:16px 18px;border-left:3px solid #ffd166;background:#fbf7ec;border-radius:0 10px 10px 0;font-style:italic">"${entry.wish.blessingLong}"</blockquote>
    <img src="${card}" alt="Blessing card for ${entry.name}" width="508" style="width:100%;border-radius:12px;display:block;margin:0 0 22px" />
    <p style="margin:0 0 8px;font-size:14px;color:#5a6482">Point at it from your own site if you like — the badge is optional and never required:</p>
    <pre style="margin:0 0 20px;padding:12px;background:#f4f5fa;border-radius:10px;font-size:12px;white-space:pre-wrap">[${entry.name} — launched on ${SITE.name}](${page})</pre>
    <p style="margin:0;font-size:13px;color:#5a6482">The link stays dofollow while your page resolves; we re-check periodically and email you before anything changes. Reply to take it down or correct it — no reason needed.</p>
  </div>
  <div style="padding:16px 26px;background:#f4f5fa;font-size:12px;color:#5a6482">${SITE.name} · ${SITE.url} · ${SITE.tagline}</div>
</div></body></html>`;

  return { text, html };
}

async function send(entry, to, subject) {
  const body = { from: `${SITE.name} <${fromAddress}>`, to: [to], subject, ...message(entry) };
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/email/sending/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      return { ok: false, detail: `HTTP ${response.status} ${(result.errors ?? []).map((e) => `${e.code}:${e.message}`).join(' | ').slice(0, 200)}` };
    }
    const receipt = result.result ?? {};
    if ((receipt.permanent_bounces?.length ?? 0) || (receipt.suppressed_recipients?.length ?? 0)) {
      return { ok: false, detail: `bounced/suppressed: ${JSON.stringify({ bounces: receipt.permanent_bounces, suppressed: receipt.suppressed_recipients }).slice(0, 180)}` };
    }
    return { ok: true, detail: receipt.message_id ?? 'queued' };
  } catch (error) {
    return { ok: false, detail: error.message.slice(0, 160) };
  }
}

const db = existsSync(join(PATHS.root, 'wrangler.jsonc')) ? makeD1({ local: Boolean(args.local) }) : null;
let sent = 0;
const failures = [];

for (const entry of waiting) {
  const submission = db?.query('SELECT id, email FROM submissions WHERE domain = ? AND verdict = ? ORDER BY id DESC LIMIT 1', entry.domain, 'approved')[0];

  if (DRY) {
    console.log(`would send: ${entry.name} → ${submission?.email ?? '(no address on file)'}  subject: ${entry.name} is live on ${SITE.name} — with a blessing`);
    continue;
  }
  if (!submission?.email) {
    const file = join(PATHS.tools, `${entry.slug}.json`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.wish.notifiedAt = 'no-email';
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    console.log(`no address on file for ${entry.slug}; marked notified-at=no-email`);
    continue;
  }

  const outcome = await send(entry, submission.email, `${entry.name} is live on ${SITE.name} — with a blessing`);
  if (!outcome.ok) {
    failures.push(`${entry.slug}: ${outcome.detail}`);
    continue;
  }
  const file = join(PATHS.tools, `${entry.slug}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.wish.notifiedAt = today;
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  db.markNotified(submission.id);
  console.log(`sent blessing → ${entry.name} <${submission.email}>`);
  sent += 1;
}

console.log(`\n${sent} blessing email(s) sent, ${failures.length} failed.`);
for (const failure of failures) console.error(`  ${failure}`);
process.exit(failures.length ? 2 : 0);

