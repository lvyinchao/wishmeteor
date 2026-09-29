import { SITE } from './site.ts';

/** Absolute URL for the current request path, honouring `site` in astro.config. */
export function canonicalUrl(pathname: string): string {
  if (!pathname) return SITE.url;
  if (/^https?:\/\//.test(pathname)) return pathname.replace(/\/$/, '');
  const path = pathname === '/' ? '' : pathname.replace(/\/$/, '');
  return `${SITE.url}${path}`;
}

const org = {
  '@type': 'Organization',
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/badge/wishmeteor-listed.svg`,
};

/** @param {any} entry loaded catalog entry */
export function softwareApplication(entry: any, path: string, imageUrl?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: entry.name,
    url: canonicalPath(entry.url),
    description: entry.summary,
    applicationCategory: categorySchema(entry.category),
    operatingSystem: 'Web',
    ...(entry.pricing === 'free' || entry.pricing === 'open-source'
      ? { offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
      : {}),
    ...(imageUrl ? { image: `${SITE.url}${imageUrl}` } : {}),
    dateModified: entry.lastVerifiedAt,
    creator: { '@type': 'Organization', name: entry.name, url: canonicalPath(entry.url) },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(path) },
    citation: entry.sources.map((source: any) => source.url),
    publisher: org,
  };
}

/** @param {any[]} entries @param {string} path */
export function itemList(entries: any[], path: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: canonicalUrl(path),
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: canonicalUrl(`/tool/${entry.slug}`),
      name: entry.name,
    })),
  };
}

export function blogPosting(post: any, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.data.title,
    description: post.data.description,
    datePublished: iso(post.data.pubDate),
    dateModified: iso(post.data.updatedDate ?? post.data.pubDate),
    inLanguage: 'en',
    author: org,
    publisher: org,
    url: canonicalUrl(path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(path) },
    citation: (post.data.sources ?? []).map((source: any) => source.url),
    keywords: (post.data.tags ?? []).join(', '),
  };
}

export function breadcrumbs(trail: { name: string; path?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(crumb.path ? { item: canonicalUrl(crumb.path) } : {}),
    })),
  };
}

export function website(path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: org,
    inLanguage: 'en',
  };
}

function canonicalPath(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

const CATEGORY_SCHEMA: Record<string, string> = {
  'ai-coding': 'DeveloperApplication',
  'ai-chat': 'CommunicationApplication',
  'image-video': 'MultimediaApplication',
  'audio-voice': 'MultimediaApplication',
  'agents-automation': 'BusinessApplication',
  'data-retrieval': 'DataManagementApplication',
  'model-platforms': 'DeveloperApplication',
  'evals-observability': 'DeveloperApplication',
  'open-source-models': 'DeveloperApplication',
  productivity: 'ProductivityApplication',
};

function categorySchema(id: string): string {
  return CATEGORY_SCHEMA[id] ?? 'MultimediaApplication';
}
