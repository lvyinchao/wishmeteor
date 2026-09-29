/**
 * Minimal frontmatter reader for the repository's own post files.
 * Supports the scalar and string-array forms used in src/content/posts, and nothing else —
 * it exists so build tooling can read titles without pulling in the Astro content layer.
 * @param {string} source
 * @returns {{ data: Record<string, string | string[]>, body: string }}
 */
export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    value = value.replace(/^(['"])(.*)\1$/, '$2');
    if (key && value) data[key] = value;
  }
  return { data, body: source.slice(match[0].length) };
}
