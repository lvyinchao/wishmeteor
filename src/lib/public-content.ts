import { getCollection } from 'astro:content';
import { loadCatalog } from './catalog.mjs';
// Files are drafts only. D1 serves every public product route through the Worker.
export function loadPublicCatalog() { const catalog=loadCatalog(); catalog.tools=[];catalog.categories=[];return catalog; }
export async function getPublicPosts() { return (await getCollection('posts')).filter(post=>post.data.approved); }
