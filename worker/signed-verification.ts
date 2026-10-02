import { canonicalVerificationUrl, verificationMessage } from '../src/lib/verification.mjs';

export interface VerificationProof {
  slug: string; url: string; checkedAt: number; expiresAt: number; nonce: string; signature: string; state:'live'|'dead'|'blocked'; httpStatus:number;
}

export async function validateProof(raw: unknown, slug: string, url: string, publicKey: string | undefined,
  now = Date.now()): Promise<VerificationProof | null> {
  try {
    if (!raw || typeof raw !== 'object' || !publicKey) return null;
    const p = raw as VerificationProof;
    if (!['live','dead','blocked'].includes(p.state) || !Number.isInteger(p.httpStatus) || p.httpStatus<0 || p.httpStatus>599 || (p.state==='live' && (p.httpStatus<200 || p.httpStatus>=300)) || p.slug !== slug || p.url !== canonicalVerificationUrl(url) || p.url !== canonicalVerificationUrl(p.url)
      || !Number.isSafeInteger(p.checkedAt) || !Number.isSafeInteger(p.expiresAt)
      || p.checkedAt > now || p.checkedAt < now - 10 * 60_000 || p.expiresAt <= now
      || p.expiresAt <= p.checkedAt || p.expiresAt - p.checkedAt > 10 * 60_000
      || !/^[0-9a-f]{64}$/.test(p.nonce) || !/^[A-Za-z0-9_-]{86}$/.test(p.signature)) return null;
    const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(publicKey), (c) => c.charCodeAt(0)),
      { name: 'Ed25519' }, false, ['verify']);
    const signature = Uint8Array.from(atob(p.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode(verificationMessage(p))) ? p : null;
  } catch { return null; }
}

export function consumeProof(db: D1Database, proof: VerificationProof): D1PreparedStatement {
  return db.prepare('INSERT INTO link_verification_nonces (nonce, expires_at) VALUES (?, ?)')
    .bind(proof.nonce, proof.expiresAt);
}
