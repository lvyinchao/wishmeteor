/**
 * Deterministic social-card paths. Pages reference these while rendering and the
 * build:done hook in integrations/blessing-cards.mjs fills them in, so an og:image
 * URL never depends on render order.
 */
export const OG = {
  home: '/og-default.png',
  tool: (slug) => `/og/tool/${slug}.png`,
  category: (id) => `/og/category/${id}.png`,
  post: (id) => `/og/post/${id}.png`,
};
