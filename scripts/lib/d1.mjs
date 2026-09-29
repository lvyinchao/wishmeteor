import { spawnSync } from 'node:child_process';

/**
 * Talk to the submissions table through wrangler: no admin endpoint, no admin token,
 * and every read is the same CLI an operator would type by hand.
 * @param {{ local?: boolean }} [options]
 */
export function makeD1({ local = false } = {}) {
  const target = local ? '--local' : '--remote';

  function run(statement) {
    const result = spawnSync('npx', ['--yes', 'wrangler', 'd1', 'execute', 'wishmeteor', target, '--json', '--command', statement], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').split('\n').filter(Boolean).pop() ?? 'unknown error';
      throw new Error(`d1 execute failed: ${detail}`);
    }
    const stdout = result.stdout.trim();
    const start = stdout.indexOf('[');
    if (start === -1) return [];
    try {
      const parsed = JSON.parse(stdout.slice(start));
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      return first?.results ?? parsed;
    } catch {
      return [];
    }
  }

  const query = (sql, ...params) => run(interpolate(sql, params));
  const quote = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);

  /** Values are bound by escaping into a literal, because wrangler takes one SQL string. */
  function interpolate(sql, params) {
    if (!params.length) return sql;
    let index = 0;
    return sql.replace(/\?/g, () => {
      const value = params[index++];
      return typeof value === 'number' ? String(value) : quote(value);
    });
  }

  return {
    run,
    query,
    pending: (limit = 50) =>
      query(`SELECT id, name, url, domain, email, category, notes, created_at FROM submissions WHERE verdict = 'pending' ORDER BY created_at ASC LIMIT ${Number(limit)}`),
    get: (id) => query('SELECT * FROM submissions WHERE id = ?', Number(id))[0],
    setVerdict: (id, verdict) =>
      run(`UPDATE submissions SET verdict = '${verdict}', verdict_at = datetime('now') WHERE id = ${Number(id)}`),
    markNotified: (id) =>
      run(`UPDATE submissions SET notified_at = datetime('now'), email = NULL WHERE id = ${Number(id)}`),
  };
}
