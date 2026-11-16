import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { LAUNCH_WEEKLY_CATEGORY } from './lib/site';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    approved: z.boolean().default(false),
    title: z.string().max(70),
    description: z.string().min(80).max(220),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    /** Slugs of /tool/* pages this article links to. Rendered as an inline box. */
    toolRefs: z.array(z.string()),
    /** External evidence for claims made in the article. */
    sources: z.array(z.object({ url: z.string().url(), title: z.string(), observedAt: z.string() })).default([]),
  }).refine(post => post.category === LAUNCH_WEEKLY_CATEGORY || post.toolRefs.length >= 3, {
    path: ['toolRefs'], message: 'Add at least three project references.',
  }),
});

export const collections = { posts };
