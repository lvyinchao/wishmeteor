/** Public list paths only; /tool, API routes and other product flows are excluded. */
export function isDirectoryPath(path: string): boolean {
  return path === '/' || /^\/(?:tools|new)(?:\/\d+)?\/?$/.test(path) ||
    /^\/category\/[a-z0-9-]+(?:\/\d+)?\/?$/.test(path);
}

/** Page one lives at the base path. Canonicals retain only query state that changes the list. */
export function directoryPageUrl(url: URL, page: number): URL {
  const result = new URL(url);
  const category = /^\/category\/([a-z0-9-]+)(?:\/\d+)?\/?$/.exec(url.pathname);
  const base = category ? `/category/${category[1]}` : '/new';
  result.pathname = url.pathname === '/' && page === 1 ? '/' : base + (page > 1 ? `/${page}` : '');
  result.searchParams.delete('page');
  for (const key of [...result.searchParams.keys()]) {
    if (!['q', 'category', 'pricing', 'origin', 'sort', 'limit', 'cursor'].includes(key)) result.searchParams.delete(key);
  }
  if (category) result.searchParams.delete('category');
  for (const [key, neutral] of [['q', ''], ['category', 'all'], ['pricing', 'all'], ['origin', 'all'], ['sort', 'newest']]) {
    if (result.searchParams.has(key) && result.searchParams.getAll(key).every(value => !value || value === neutral)) result.searchParams.delete(key);
  }
  result.searchParams.sort();
  result.hash = '';
  return result;
}
