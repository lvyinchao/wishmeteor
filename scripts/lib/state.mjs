import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PATHS } from '../../src/lib/catalog.mjs';

const STATE_FILE = join(PATHS.root, 'data/state.json');
const VALIDATOR_FILE = join(PATHS.root, 'data/cache/etags.json');

/** Watermarks for the collection jobs, kept in git so a fresh clone resumes correctly. */
export function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sources: {} };
  }
}

export function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/** Last observed timestamp for a source, or a lookback window on first run. */
export function since(state, source, lookbackHours = 24) {
  return state.sources?.[source]?.since ?? new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
}

export function mark(state, source, sinceValue, extra = {}) {
  state.sources ??= {};
  state.sources[source] = { ...(state.sources[source] ?? {}), since: sinceValue, lastRunAt: new Date().toISOString(), ...extra };
  return state;
}

/** Read/write HTTP validators (ETag, Last-Modified) per polled URL. */
export function loadValidators() {
  try {
    return JSON.parse(readFileSync(VALIDATOR_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function saveValidators(validators) {
  mkdirSync(dirname(VALIDATOR_FILE), { recursive: true });
  writeFileSync(VALIDATOR_FILE, `${JSON.stringify(validators, null, 2)}\n`, 'utf8');
}

/** Append-only landing file for one source's findings. */
export function inboxFile(source, date = new Date()) {
  return join(PATHS.root, 'data/inbox', `${source}-${date.toISOString().slice(0, 10)}.jsonl`);
}

/** @param {{key: string}[]} rows */
export function writeInbox(file, rows) {
  if (!rows.length) return { file, written: 0 };
  mkdirSync(dirname(file), { recursive: true });
  const existing = new Set();
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        existing.add(JSON.parse(line).key);
      } catch {
        /* a torn line from an interrupted run */
      }
    }
  } catch {
    /* first run for this source */
  }
  const fresh = rows.filter((row) => !existing.has(row.key));
  if (fresh.length) writeFileSync(file, `${fresh.map((row) => JSON.stringify(row)).join('\n')}\n`, { flag: 'a' });
  return { file, written: fresh.length };
}
