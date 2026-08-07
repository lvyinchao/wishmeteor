import type { Locale } from './i18n';

export type GenerationInput = { occasion: string; recipient?: string; name?: string; tone: string; length: string; note?: string; locale: Locale };
export type AiEnv = { QWEN_API_KEY?: string; QWEN_BASE_URL?: string; QWEN_MODEL?: string; QWEN_IMAGE_BASE_URL?: string; QWEN_IMAGE_MODEL?: string };
export type CardImageInput = { kind: 'blessing' | 'wish'; occasion: string; theme: 'meteor' | 'petal' | 'aurora' };
const blocked = /(kill myself|suicide|bomb|hate\s+\w+|credit card|password)/i;
export function moderate(text: string) { return blocked.test(text) ? { verdict: 'blocked', reason: 'This content needs care before it can be shared publicly.' } : { verdict: 'published', reason: null }; }
const languageNames: Record<Locale, string> = { en: 'English', 'zh-CN': 'Simplified Chinese', ja: 'Japanese', fr: 'French', ru: 'Russian', es: 'Spanish', hi: 'Hindi', pt: 'Portuguese', ms: 'Malay' };
const wishOccasionContexts: Record<string, string> = {
  'personal-growth': 'personal growth and courage',
  'love-connection': 'love and meaningful connection',
  wellbeing: 'wellbeing, peace, and health',
  'future-dream': 'a dream they want to pursue',
  journey: 'a journey or path ahead',
  'quiet-hope': 'a quiet personal hope',
};
const cardOccasionContexts: Record<string, string> = {
  birthday: 'a birthday celebration', anniversary: 'a meaningful anniversary', holiday: 'a joyful seasonal holiday', wedding: 'a wedding celebration', thanks: 'an expression of gratitude', 'new-beginning': 'a bright new beginning', ...wishOccasionContexts,
};
const cardThemeDirections: Record<CardImageInput['theme'], string> = {
  meteor: 'deep indigo evening sky, one elegant golden meteor trail, subtle stardust, refined navy and warm gold palette',
  petal: 'soft ivory handmade paper, delicate rose and blush petals drifting at the edges, quiet romantic light, warm tactile texture',
  aurora: 'misty lilac, pearl, and midnight-blue aurora ribbons, luminous but calm, airy celestial glow',
};
const defaultImageEndpoint = 'https://llm-hkywi0m4u8k0u4ss.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
function text(value: unknown) { return typeof value === 'string' ? value : ''; }
function parseVariants(content: string) {
  const match = content.match(/\[[\s\S]*\]/);
  if (match) { try { const parsed = JSON.parse(match[0]); if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed.slice(0, 3); } catch { /* fall through */ } }
  return content.split(/\n+/).map((item) => item.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3);
}
export async function generateWithQwen(input: GenerationInput, kind: 'blessing' | 'wish', env: AiEnv) {
  if (!env.QWEN_API_KEY) throw new Error('AI generation is not configured. Add QWEN_API_KEY as a Worker secret.');
  const target = kind === 'blessing' ? `Recipient: ${input.recipient || 'not specified'}; name: ${input.name || 'not specified'}; occasion: ${input.occasion}.` : `This is a private wish about ${wishOccasionContexts[input.occasion] || 'a quiet personal hope'}, never a promise or prediction.`;
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
export async function generateCardImage(input: CardImageInput, env: AiEnv) {
  if (!env.QWEN_API_KEY) throw new Error('AI image generation is not configured.');
  const occasion = cardOccasionContexts[input.occasion] || 'a gentle personal moment';
  const prompt = `Create a premium vertical 2:3 greeting-card background for ${input.kind === 'wish' ? 'a private wish' : 'a heartfelt blessing'} about ${occasion}. ${cardThemeDirections[input.theme]}. Leave generous calm negative space through the center for a later multilingual message overlay. Background artwork only: absolutely no text, letters, numbers, logos, signatures, watermarks, frames, or readable symbols. Elegant editorial paper-and-light aesthetic, high detail, no people.`;
  const response = await fetch(env.QWEN_IMAGE_BASE_URL || defaultImageEndpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.QWEN_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.QWEN_IMAGE_MODEL || 'qwen-image-3.0-pro',
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { prompt_extend: true, prompt_extend_mode: 'agent', n: 1, size: '1024*1536', watermark: false, negative_prompt: 'text, lettering, words, numbers, logo, watermark, signature, border, frame, people' },
    }),
  });
  if (!response.ok) throw new Error(`Qwen image request failed (${response.status}).`);
  const payload = await response.json() as { output?: { choices?: Array<{ message?: { content?: Array<{ image?: unknown }> } }> } };
  const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => typeof item.image === 'string')?.image;
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) throw new Error('Qwen did not return a card image.');
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error('Generated card image could not be saved.');
  return { bytes: await image.arrayBuffer(), contentType: image.headers.get('content-type') || 'image/png' };
}
export async function translateWish(content: string, sourceLocale: Locale, targetLocale: Locale, env: AiEnv) {
  if (sourceLocale === targetLocale) return content;
  if (!env.QWEN_API_KEY) throw new Error('AI translation is not configured.');
  const response = await fetch(`${(env.QWEN_BASE_URL || 'https://llm-hkywi0m4u8k0u4ss.cn-beijing.maas.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.QWEN_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.QWEN_MODEL || 'qwen3.8-max', temperature: 0.2, max_tokens: 500, messages: [
      { role: 'system', content: `Translate public wish text from ${languageNames[sourceLocale]} into ${languageNames[targetLocale]}. Preserve the first-person voice, meaning, and warmth. Return only the translation with no label, markdown, or quotation marks.` },
      { role: 'user', content },
    ] }),
  });
  if (!response.ok) throw new Error(`Qwen translation failed (${response.status}).`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const translation = text(payload.choices?.[0]?.message?.content).trim();
  if (!translation) throw new Error('Qwen returned an empty translation.');
  return translation;
}
