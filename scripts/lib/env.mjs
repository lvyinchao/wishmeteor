import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../src/lib/catalog.mjs';

/**
 * Load KEY=value from .env or .dev.vars into process.env without overriding real
 * environment values. Local-only by design: the Worker never sees any of these.
 */
export function loadEnv() {
  for (const file of ['.env', '.dev.vars', '.env.local'].map((f) => join(PATHS.root, f))) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
  return process.env;
}
