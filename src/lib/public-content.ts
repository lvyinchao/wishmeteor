import { getCollection } from 'astro:content';
import { loadCatalog } from './catalog.mjs';

// Keep the reviewed catalog files in place while temporarily publishing empty lists.
export const PUBLIC_LISTS_EMPTY = true;

export function loadPublicCatalog() {
  const catalog = loadCatalog();
  return PUBLIC_LISTS_EMPTY
    ? { ...catalog, tools: [], categories: [] }
    : catalog;
}

export async function getPublicPosts() {
  const posts = await getCollection('posts');
  return PUBLIC_LISTS_EMPTY ? [] : posts;
}
