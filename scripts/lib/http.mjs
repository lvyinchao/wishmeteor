const DEFAULT_TIMEOUT = 15_000;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch with a hard timeout, bounded retries and Retry-After support.
 * Returns a Response; throws on network failure after the last attempt.
 */
export async function request(url, { timeout = DEFAULT_TIMEOUT, retries = 2, headers = {}, method = 'GET' } = {}) {
  const merged = { 'user-agent': 'WishMeteorBot/1.0 (+https://wishmeteor.net/about)', accept: '*/*', ...headers };
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      const backoff = 500 * 4 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(Math.max(backoff, lastError?.retryAfter ?? backoff));
    }
    try {
      const response = await fetch(url, { method, headers: merged, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
      if (response.ok || !RETRYABLE.has(response.status)) return response;
      const retryAfter = Number(response.headers.get('retry-after'));
      lastError = new Error(`HTTP ${response.status} from ${url}`);
      if (Number.isFinite(retryAfter) && retryAfter > 0) lastError.retryAfter = Math.min(retryAfter * 1000, 30_000);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`request failed: ${url}`);
}

export async function getJson(url, options = {}) {
  const response = await request(url, { ...options, headers: { accept: 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

export async function getText(url, options = {}) {
  const response = await request(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

/**
 * Conditional GET for feeds: re-sends the stored ETag/Last-Modified and reports
 * whether anything changed, so a polling run costs nothing when it finds nothing.
 */
export async function getConditional(url, validator = {}, options = {}) {
  const headers = { ...(validator.etag ? { 'if-none-match': validator.etag } : {}), ...(validator.lastModified ? { 'if-modified-since': validator.lastModified } : {}) };
  try {
    const response = await request(url, { ...options, headers: { ...headers, ...options.headers } });
    if (response.status === 304) return { changed: false, text: '', validator };
    return {
      changed: true,
      text: await response.text(),
      validator: { etag: response.headers.get('etag') ?? undefined, lastModified: response.headers.get('last-modified') ?? undefined },
    };
  } catch (error) {
    return { changed: false, error: error.message, validator };
  }
}
