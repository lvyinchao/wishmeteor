/** Cheap, deliberately over-inclusive AI relevance filter for collected candidates. */
const TERMS = [
  'ai', 'ais', 'llm', 'llms', 'gpt', 'chatgpt', 'claude', 'gemini', 'mistral', 'llama', 'qwen', 'deepseek',
  'transformer', 'diffusion', 'embedding', 'inference', 'fine-tun', 'finetun', 'rag', 'agent', 'agents',
  'prompt', 'vector', 'ml', 'machine-learning', 'neural', 'multimodal', 'copilot', 'genai', 'text-to-',
  'speech-to-', 'image-to-', 'whisper', 'stable-diffusion', 'pytorch', 'tensorflow', 'huggingface',
];

const EXCLUDE = ['roadmap', 'hiring', 'about-us', 'terms-of-service'];

/** @param {string[]} parts */
export function isAiRelated(...parts) {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return false;
  if (EXCLUDE.some((term) => haystack.includes(term))) return false;
  const words = new Set(haystack.split(/[^a-z0-9]+/).filter(Boolean));
  if (words.has('ai') || words.has('llm') || words.has('ml')) return true;
  return TERMS.some((term) => haystack.includes(term));
}

/** Rough quality signal so the drafting job can rank a 500-item inbox quickly. */
export function score({ stars, points, downloads, likes, mentions }) {
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  return Math.round(Math.log10(1 + number(stars) * 2 + number(points) * 3 + number(downloads) / 100 + number(likes) + number(mentions) * 5) * 10);
}
