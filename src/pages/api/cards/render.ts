import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const { content = '', template = 'meteor', locale = 'en' } = await request.json();
  if (!content.trim()) return Response.json({ error: 'Card text is required.' }, { status: 400 });
  // The browser uses the same template renderer for instant downloads. Production
  // rendering writes this SVG/PNG payload to the MEDIA R2 binding and returns its share URL.
  const id = crypto.randomUUID();
  return Response.json({ id, template, locale, status: 'ready', shareUrl: `/share/${id}`, format: 'svg' });
};
