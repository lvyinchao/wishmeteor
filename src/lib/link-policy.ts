import { SITE } from './site.ts';

export interface LinkFields {
  approved?: boolean;
  status?: string;
  description?: string;
  descriptionLength?: number;
  lastVerifiedAt?: string | null;
  checksFailed?: number;
  linkPolicy?: 'verified' | 'dofollow';
}

export function isDofollow(entry: LinkFields, now = new Date()): boolean {
  if (entry.approved === true && entry.status !== 'archived' && entry.linkPolicy === 'dofollow') return true;
  const verified = entry.lastVerifiedAt ? Date.parse(entry.lastVerifiedAt) : NaN;
  const age = now.getTime() - verified;
  return entry.approved === true && !['archived', 'stale'].includes(entry.status ?? '')
    && (entry.description?.length ?? entry.descriptionLength ?? 0) >= SITE.minDescriptionChars
    && entry.checksFailed === 0 && Number.isFinite(age) && age >= 0
    && age < SITE.staleAfterDays * 86_400_000;
}

export function linkPolicyMessage(entry: LinkFields): string {
  return isDofollow(entry)
    ? entry.linkPolicy === 'dofollow' ? 'Official link is approved as dofollow.' : 'Official link meets the verified-link policy.'
    : 'Official link is marked nofollow pending a current successful check.';
}

export function outboundRel(entry: LinkFields, now = new Date()): string {
  return isDofollow(entry, now) ? 'noopener' : 'noopener nofollow ugc';
}
