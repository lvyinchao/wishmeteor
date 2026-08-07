import type { Locale } from './i18n';

export type GenerationInput = { occasion: string; recipient?: string; name?: string; tone: string; length: string; note?: string; locale: Locale };
export type AiEnv = { QWEN_API_KEY?: string; QWEN_BASE_URL?: string; QWEN_MODEL?: string };
const blocked = /(kill myself|suicide|bomb|hate\s+\w+|credit card|password)/i;
export function moderate(text: string) { return blocked.test(text) ? { verdict: 'blocked', reason: 'This content needs care before it can be shared publicly.' } : { verdict: 'published', reason: null }; }
const languageNames: Record<Locale, string> = { en: 'English', 'zh-CN': 'Simplified Chinese', ja: 'Japanese', fr: 'French', ru: 'Russian', es: 'Spanish', hi: 'Hindi', pt: 'Portuguese', ms: 'Malay' };
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function parseVariants(content: string) {
  const match = content.match(/\[[\s\S]*\]/);
  if (match) { try { const parsed = JSON.parse(match[0]); if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed.slice(0, 3); } catch { /* fall through */ } }
  return content.split(/\n+/).map((item) => item.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
}
export async function generateWithQwen(input: GenerationInput, kind: 'blessing' | 'wish', env: AiEnv) {
  if (!env.QWEN_API_KEY) throw new Error('AI generation is not configured. Add QWEN_API_KEY as a Worker secret.');
  const target = kind === 'blessing' ? `Recipient: ${input.recipient || 'not specified'}; name: ${input.name || 'not specified'}; occasion: ${input.occasion}.` : 'This is a private wish, never a promise or prediction.';
  const instruction = kind === 'blessing'
    ? 'Write exactly 3 distinct, ready-to-send blessings.'
    : 'Write exactly 1 gentle, first-person wish.';
  const response = await fetch(`${(env.QWEN_BASE_URL || 'https://llm-hkywi0m4u8k0u4ss.cn-beijing.maas.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.QWEN_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.QWEN_MODEL || 'qwen3.8-max', temperature: 0.85, max_tokens: 700, messages: [
      { role: 'system', content: `You are WishMeteor's caring writing assistant. Reply only in ${languageNames[input.locale]}. Do not add explanations. Avoid claims, medical advice, harassment, or sexual content.` },
      { role: 'user', content: `${instruction} Tone: ${input.tone || 'warm and sincere'}. Desired length: ${input.length || 'medium'}. ${target} Detail from the sender: ${input.note || 'none'}. Return a strict JSON array of strings, with no markdown.` },
    ] }),
  });
  if (!response.ok) throw new Error(`Qwen request failed (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const variants = parseVariants(text(payload.choices?.[0]?.message?.content));
  if (variants.length < (kind === 'blessing' ? 3 : 1)) throw new Error('Qwen returned an unusable response.');
  return kind === 'blessing' ? { variants } : { content: variants[0] };
}
