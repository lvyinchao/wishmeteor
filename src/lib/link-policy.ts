import { SITE } from './site.ts';

export interface LinkFields {
  approved?: boolean;
  status?: string;
  description?: string;
  lastVerifiedAt?: string | null;
  checksFailed?: number;
}

export function isDofollow(entry: LinkFields, now = new Date()): boolean {
  const verified = entry.lastVerifiedAt ? Date.parse(entry.lastVerifiedAt) : NaN;
  const age = now.getTime() - verified;
  return entry.approved === true && !['archived', 'stale'].includes(entry.status ?? '')
    && (entry.description ?? '').length >= SITE.minDescriptionChars
    && entry.checksFailed === 0 && Number.isFinite(age) && age >= 0
    && age < SITE.staleAfterDays * 86_400_000;
}

export function outboundRel(entry: LinkFields, now = new Date()): string {
  return isDofollow(entry, now) ? 'noopener' : 'noopener nofollow ugc';
}
