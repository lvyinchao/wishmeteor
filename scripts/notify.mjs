#!/usr/bin/env node
/**
 * Sends the blessing email for every published wish that has not been notified yet.
 *
 * Runs strictly AFTER a successful deploy: the email embeds the card image and the
 * entry URL, both of which are served by this site.
 *
 *   pnpm notify -- --dry      show what would be sent, send nothing
 *   pnpm notify -- --local    read verdicts from the local database
 *
 * Needs RESEND_API_KEY and RESEND_FROM in the environment or in .env / .dev.vars.
 * It exists with code 3 when the key is missing rather than skipping silently.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from './lib/cli.mjs';
import { join } from 'node:path';
import { loadCatalog, PATHS } from '../src/lib/catalog.mjs';
import { loadEnv } from './lib/env.mjs';
import { makeD1 } from './lib/d1.mjs';
import { SITE } from '../src/lib/site.ts';
import { OG } from '../src/lib/og.mjs';

const args = parseArgs();
const DRY = Boolean(args.dry);
const today = new Date().toISOString().slice(0, 10);
loadEnv();

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

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM || SITE.sender;
if (!apiKey && !DRY) {
  console.error(`RESEND_API_KEY is not set, and ${waiting.length} blessing(s) are waiting.\nAdd it to .env or the environment, then re-run. Nothing was sent, so nothing is marked notified.`);
  process.exit(3);
}

const db = existsSync(join(PATHS.root, 'wrangler.jsonc')) ? makeD1({ local: Boolean(args.local) }) : null;

const paragraph = (text) => text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');

function email(entry) {
  const page = `${SITE.url}/tool/${entry.slug}`;
  const card = `${SITE.url}${OG.tool(entry.slug)}`;
  const text = [
    `Hello,`,
    ``,
    `Your wish lit up. ${entry.name} is live on ${SITE.name} at ${page}`,
    ``,
    `The blessing we wrote for it:`,
    `"${entry.wish.blessingLong}"`,
    ``,
    `The card is at ${card} if you want to share it, and this is the only link we ask for:`,
    `[${entry.name} — launched on ${SITE.name}](${page})`,
    ``,
    `Your link is dofollow and stays that way while the page resolves. If it ever breaks we re-check and email you before it loses anything. Want it changed or taken down? Reply to this email; no reason needed.`,
    ``,
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
    <p style="margin:0 0 8px;font-size:14px;color:#5a6482">If you want to point at it from your own site, the badge is optional and never required:</p>
    <pre style="margin:0 0 20px;padding:12px;background:#f4f5fa;border-radius:10px;font-size:12px;white-space:pre-wrap">[${entry.name} — launched on ${SITE.name}](${page})</pre>
    <p style="margin:0;font-size:13px;color:#5a6482">The link stays dofollow while your page resolves; we re-check periodically and email you before anything changes. Reply to take it down or correct it — no reason needed.</p>
  </div>
  <div style="padding:16px 26px;background:#f4f5fa;font-size:12px;color:#5a6482">${SITE.name} · ${SITE.url} · ${SITE.tagline}</div>
</div></body></html>`;

  return { text, html };
}

let sent = 0;
const failures = [];
for (const entry of waiting) {
  const page = `${SITE.url}/tool/${entry.slug}`;
  const subject = `${entry.name} is live on ${SITE.name} — with a blessing`;
  const body = email(entry);
  const submission = db?.query('SELECT id, email FROM submissions WHERE domain = ? AND verdict = ? ORDER BY id DESC LIMIT 1', entry.domain, 'approved')[0];

  if (DRY || !submission?.email) {
    console.log(`${DRY ? 'would send' : 'skip (no email on file)'}: ${entry.name} <${submission?.email ?? '—'}> ${page}`);
    if (!DRY && !submission?.email) {
      const file = join(PATHS.tools, `${entry.slug}.json`);
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      raw.wish.notifiedAt = 'no-email';
      writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    }
    continue;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [submission.email], subject, text: body.text, html: body.html }),
  });
  if (!response.ok) {
    failures.push(`${entry.slug}: HTTP ${response.status} ${(await response.text()).slice(0, 160)}`);
    continue;
  }
  const file = join(PATHS.tools, `${entry.slug}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.wish.notifiedAt = today;
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  db.markNotified(submission.id);
  console.log(`sent blessing → ${entry.name}`);
  sent += 1;
}

console.log(`\n${sent} blessing email(s) sent, ${failures.length} failed.`);
for (const failure of failures) console.error(`  ${failure}`);
process.exit(failures.length ? 2 : 0);
