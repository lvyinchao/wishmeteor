export function canonicalVerificationUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(url.hostname)
    || /\.(localhost|local|internal|test|invalid|example|onion)$/.test(url.hostname)
    || url.hostname === 'wishmeteor.net' || url.hostname.endsWith('.wishmeteor.net')) throw new Error('unsafe-verification-url');
  url.hash = '';
  return url.href.replace(/\/$/, '');
}

export function verificationMessage(p) {
  return JSON.stringify([2, 'https://wishmeteor.net', p.slug, p.url, p.state, p.httpStatus, p.checkedAt, p.expiresAt, p.nonce]);
}
