/** Shared CLI flag parsing for the pipeline scripts: `--key=value` and bare `--flag`. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, ...rest] = entry.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }
  return args;
}

export const flag = (args, name) => args[name] === true || args[name] === 'true';
