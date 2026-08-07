import type { APIRoute } from 'astro';
export const GET: APIRoute = () => Response.json({ remaining: 5, plan: 'Free', reset: 'monthly' });
