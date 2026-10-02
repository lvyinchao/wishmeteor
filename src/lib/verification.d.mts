export function canonicalVerificationUrl(raw: string): string;
export function verificationMessage(p: { slug: string; url: string; checkedAt: number; expiresAt: number; state: string; httpStatus: number; nonce: string }): string;
