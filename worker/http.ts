export class HttpError extends Error {
  code:string;
  status:number;
  constructor(code:string,status=400) { super(code);this.code=code;this.status=status; }
}

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export function json(value: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(JSON_HEADERS);
  new Headers(extra).forEach((v,k) => headers.append(k,v));
  return new Response(JSON.stringify(value), {status,headers});
}

export async function boundedBody(request: Request, maximum = 8192): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new HttpError('payload-too-large',413);
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let count = 0;
  let text = '';
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maximum) throw new HttpError('payload-too-large',413);
      text += decoder.decode(value,{stream:true});
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export async function jsonBody(request: Request, maximum = 8192): Promise<Record<string,unknown>> {
  if (!(request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase().endsWith('application/json')) throw new HttpError('json-required',415);
  let value: unknown;
  try { value = JSON.parse(await boundedBody(request,maximum)); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError('invalid-json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError('invalid-json');
  return value as Record<string,unknown>;
}

export function sameOrigin(request: Request): boolean { return request.headers.get('origin') === new URL(request.url).origin; }
export function requireOrigin(request: Request): void { if (!sameOrigin(request)) throw new HttpError('origin-not-allowed',403); }
export function stringField(input: Record<string,unknown>, key: string, maximum: number, required = false): string {
  if (input[key] === undefined && !required) return '';
  if (typeof input[key] !== 'string') throw new HttpError('invalid-input');
  const value = input[key].trim();
  if (value.length > maximum || (required && !value)) throw new HttpError('invalid-input');
  return value;
}
