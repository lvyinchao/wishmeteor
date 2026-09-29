import { createHash } from 'node:crypto';
import { SITE } from './site.ts';

/**
 * @typedef {Object} LinkFields
 * @property {boolean} [approved]
 * @property {string} [status]
 * @property {string} [url]
 * @property {string} [description]
 * @property {string} [lastVerifiedAt]
 * @property {number} [checksFailed]
 */

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref$|ref_)/i;

/**
 * Reduce a submitted/collected URL to the form we store and dedupe on:
 * https, no fragment, no www, no tracking params, no trailing slash.
 * Returns null for anything that is not a plain http(s) website URL.
 * @param {string} raw
 * @returns {{ url: string, host: string, domain: string } | null}
 */
export function canonicalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  parsed.protocol = 'https:';
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
  }
  if (!parsed.searchParams.size) parsed.search = '';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (parsed.pathname === '/' && parsed.search) parsed.pathname = '';
  let out = parsed.toString();
  if (out.endsWith('/')) out = out.slice(0, -1);
  return { url: out, host: parsed.hostname, domain: registrableDomain(parsed.hostname) };
}

/**
 * Best-effort registrable domain without a public-suffix dependency:
 * keep the last two labels, except for a handful of two-part country TLDs.
 * @param {string} hostname
 */
export function registrableDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  const penultimate = parts[parts.length - 2];
  const twoLevelSuffixes = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu']);
  if (parts.length >= 3 && twoLevelSuffixes.has(penultimate) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/** Stable, short, non-reversible key for dedupe tables. @param {string} domain */
export function domainKey(domain) {
  return createHash('sha1').update(domain.toLowerCase()).digest('hex').slice(0, 12);
}

/**
 * URL-safe entry id. Kept deliberately conservative so a submitted product name
 * and a scraped repository title both land on a stable, readable slug.
 * @param {string} value
 */
export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** @param {string} slug @returns {string} a slug that is not taken */
export function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) return slug;
  for (let n = 2; n < 100; n += 1) {
    if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
  return `${slug}-${domainKey(slug)}`;
}

/** @param {LinkFields} entry @param {Date} [now] */
export function isDofollow(entry, now = new Date()) {
  if (!entry.approved || entry.status === 'archived' || entry.status === 'stale') return false;
  if ((entry.description ?? '').length < SITE.minDescriptionChars) return false;
  if ((entry.checksFailed ?? 0) > 0) return false;
  const verified = entry.lastVerifiedAt ? Date.parse(entry.lastVerifiedAt) : NaN;
  if (Number.isNaN(verified)) return false;
  return now.getTime() - verified < SITE.staleAfterDays * 86_400_000;
}

/** rel value for an outbound link: only approved, live, substantive entries stay dofollow. */
export function outboundRel(entry, now = new Date()) {
  return isDofollow(entry, now) ? 'noopener' : 'noopener nofollow ugc';
}

/** Entries excluded from sitemaps because their outbound link is not dofollow. */
export function isListable(entry, now = new Date()) {
  return entry.approved === true && entry.status !== 'archived' && isDofollow(entry, now);
}

/** ISO date (YYYY-MM-DD) in UTC. @param {Date} [date] */
export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** @param {{ wish?: { submittedAt?: string } }[]} entries @param {Date} [now] */
export function launchedOn(entries, now = new Date()) {
  const day = isoDay(now);
  return entries.filter((entry) => entry.wish?.submittedAt?.slice(0, 10) === day);
}

/** How many more wishes may be launched right now without breaking the public cap. */
export function remainingQuota(entries, now = new Date()) {
  return SITE.dailyLaunchCap - launchedOn(entries, now).length;
}
