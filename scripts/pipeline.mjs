#!/usr/bin/env node
/**
 * Publish: validate → build → commit → deploy → send blessings, in that order and no
 * other order. A failed build never reaches git, a failed deploy never sends email.
 *
 *   pnpm ship                     full publish
 *   pnpm ship -- --no-deploy      build and commit only
 *   pnpm ship -- --skip-check     skip `astro check` (faster, less safe)
 *   pnpm ship -- --message "..."  override the commit message
 *
 * A lock directory keeps two overlapping cron runs from publishing at once.
 */
import { spawnSync } from 'node:child_process';
import { parseArgs } from './lib/cli.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../src/lib/catalog.mjs';
import { loadEnv } from './lib/env.mjs';

const args = parseArgs();
const LOCK = join(PATHS.root, 'data/.lock');

try {
  mkdirSync(LOCK);
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('another publish is already running (data/.lock exists); nothing to do.');
    process.exit(0);
  }
  throw error;
}

loadEnv();
const release = () => rmSync(LOCK, { recursive: true, force: true });
const step = (label, command, options = {}) => {
  console.log(`\n— ${label}`);
  const result = spawnSync(command, { shell: true, stdio: 'inherit', cwd: PATHS.root, ...options });
  if (result.status !== 0) {
    release();
    console.error(`${label} failed (exit ${result.status}); nothing was deployed.`);
    process.exit(result.status ?? 1);
  }
};

const git = (cmd) => spawnSync(`git ${cmd}`, { shell: true, encoding: 'utf8', cwd: PATHS.root });

if (!args['skip-check']) step('type and content check', 'npx astro check');
step('build', 'npx astro build');

git('add -A src/content data');
const clean = git('diff --cached --quiet').status === 0;
if (!clean) {
  const message = String(args.message ?? `content: index refresh ${new Date().toISOString().slice(0, 10)}`);
  step('commit', `git commit -m ${JSON.stringify(message)}`);
} else {
  console.log('\n— commit\nno content changes to commit');
}

if (args['no-deploy']) {
  console.log('\n— deploy\nskipped (--no-deploy)');
  release();
  process.exit(0);
}

step('deploy', 'npx wrangler deploy');
step('blessing emails', 'node scripts/notify.mjs');
release();
console.log('\nShipped.');
