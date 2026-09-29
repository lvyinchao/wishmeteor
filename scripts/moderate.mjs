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

const args = parseArgs();
const db = makeD1({ local: Boolean(args.local) });

if (args.reject) {
  for (const id of String(args.reject).split(',')) {
    db.setVerdict(id.trim(), 'rejected');
    console.log(`#${id.trim()} → rejected`);
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
