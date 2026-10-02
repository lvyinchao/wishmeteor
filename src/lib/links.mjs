import { createHash } from 'node:crypto';
import { SITE } from './site.ts';
import { canonicalProductUrl } from './tool-schema.ts';
import { getDomain } from 'tldts';
import { isDofollow as verifiedLinkPolicy } from './link-policy.ts';

/**
 * @typedef {Object} LinkFields
 * @property {boolean} [approved]
 * @property {string} [status]
 * @property {string} [url]
 * @property {string} [description]
 * @property {string} [lastVerifiedAt]
 * @property {number} [checksFailed]
 */

/** The same URL and public-suffix policy is used by imports and the Worker. */
export function canonicalizeUrl(raw) {
 const target=canonicalProductUrl(raw);return target?{...target,host:new URL(target.url).hostname}:null;
}
export function registrableDomain(hostname) { return getDomain(hostname,{allowPrivateDomains:true}) ?? hostname; }

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
  return verifiedLinkPolicy(entry, now);
}

/** rel value for an outbound link: only approved, live, substantive entries stay dofollow. */
export function outboundRel(entry, now = new Date()) {
  return isDofollow(entry, now) ? 'noopener' : 'noopener nofollow ugc';
}

/** Public canonical pages are indexable independently of their outbound rel. */
export function isListable(entry) {
  return entry.approved === true && entry.status !== 'archived';
}

/** ISO date (YYYY-MM-DD) in UTC. @param {Date} [date] */
export function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** @param {{ publishedAt?: string }[]} entries @param {Date} [now] */
export function launchedOn(entries, now = new Date()) {
  const day = isoDay(now);
  return entries.filter((entry) => entry.publishedAt?.slice(0, 10) === day);
}

/** How many more wishes may be launched right now without breaking the public cap. */
export function remainingQuota(entries, now = new Date()) {
  return SITE.dailyLaunchCap - launchedOn(entries, now).length;
}
