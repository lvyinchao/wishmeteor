#!/usr/bin/env node
/**
 * The submission queue, from the terminal.
 *
 *   pnpm moderate                       list pending wishes
 *   pnpm moderate -- --show=12          one submission in full
 *   pnpm moderate -- --reject=12        throw it away
 *   pnpm moderate -- --local            use the local dev database instead of prod
 */
import { makeD1 } from './lib/d1.mjs';
import { parseArgs } from './lib/cli.mjs';
import { loadEnv } from './lib/env.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SITE } from '../src/lib/site.ts';

const args = parseArgs();
const db = makeD1({ local: Boolean(args.local) });

function readCredential() {
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN;
  const file = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  if (!existsSync(file)) return null;
  return /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(file, 'utf8'))?.[1] ?? null;
}

async function sendRejectionEmail(row) {
  loadEnv();
  const token = readCredential();
  if (!token || !row.email) return false;
  const account = process.env.CF_ACCOUNT_ID ?? '3c772e18744e927e0eda39ca57aac390';
  const accountUrl = `${SITE.url}/account`;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: SITE.sender,
      to: [row.email],
      subject: `An update on ${row.name} from WishMeteor`,
      text: `Thank you for sharing ${row.name} with WishMeteor. We reviewed it, but cannot add it to the directory at this time. You can see its status in your account at ${accountUrl}.`,
      html: `<p>Thank you for sharing ${String(row.name).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])} with WishMeteor.</p><p>We reviewed it, but cannot add it to the directory at this time. You can see its status in your <a href="${accountUrl}">account</a>.</p>`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false || result.result?.permanent_bounces?.length || result.result?.suppressed_recipients?.length) {
    throw new Error(`Cloudflare Email returned HTTP ${response.status}`);
  }
  return true;
}

if (args.reject) {
  for (const id of String(args.reject).split(',')) {
    const row = db.get(id.trim());
    if (!row) { console.error(`#${id.trim()} not found`); continue; }
    if (row.verdict !== 'pending') { console.error(`#${id.trim()} is already ${row.verdict}`); continue; }
    db.setVerdict(id.trim(), 'rejected');
    try {
      if (await sendRejectionEmail(row)) {
        db.run(`UPDATE submissions SET verdict_email_sent_at = datetime('now') WHERE id = ${Number(id.trim())}`);
        console.log(`#${id.trim()} → rejected, email sent`);
      } else {
        console.log(`#${id.trim()} → rejected; email not sent (no recipient or Cloudflare credential)`);
      }
    } catch (error) {
      console.error(`#${id.trim()} → rejected; status email failed: ${error.message}`);
    }
  }
  process.exit(0);
}

if (args.show) {
  const row = db.get(args.show);
  if (!row) {
    console.error(`no submission #${args.show}`);
    process.exit(1);
  }
  console.log(JSON.stringify(row, null, 2));
  process.exit(0);
}

const pending = db.pending();
if (!pending.length) {
  console.log('No pending wishes.');
  process.exit(0);
}
console.log(`${pending.length} pending:\n`);
for (const row of pending) {
  console.log(`#${String(row.id).padEnd(4)} ${row.name}`);
  console.log(`     ${row.url}`);
  console.log(`     category=${row.category || '—'}  by=${row.email}  at=${row.created_at}`);
  if (row.notes) console.log(`     notes: ${row.notes.replace(/\s+/g, ' ').slice(0, 200)}`);
  console.log('');
}
console.log('Next: draft a blessing into data/drafts/blessings/<id>.json, then pnpm approve -- --submission=<id>');
