export const PER_PAGE = 24;

export interface PageSlice<T> {
  page: number;
  items: T[];
  total: number;
  lastPage: number;
}

/** Split a list into numbered pages for Astro's `[...page]` routes (page 1 lives at the base path). */
export function slicePages<T>(items: T[], perPage = PER_PAGE): PageSlice<T>[] {
  const lastPage = Math.max(1, Math.ceil(items.length / perPage));
  return Array.from({ length: lastPage }, (_, index) => ({
    page: index + 1,
    items: items.slice(index * perPage, (index + 1) * perPage),
    total: items.length,
    lastPage,
  }));
}

/** Canonical path for a page slice; page 1 is the base path itself. */
export function pagePath(base: string, page: number): string {
  return page <= 1 ? base : `${base}/${page}`;
}
