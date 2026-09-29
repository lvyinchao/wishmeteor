import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().min(80).max(220),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    /** Slugs of /tool/* pages this article links to. Rendered as an inline box. */
    toolRefs: z.array(z.string()).min(3),
    /** External evidence for claims made in the article. */
    sources: z.array(z.object({ url: z.string().url(), title: z.string(), observedAt: z.string() })).default([]),
  }),
});

export const collections = { posts };
