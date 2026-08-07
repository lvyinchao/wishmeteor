import type { APIRoute } from 'astro';
export const POST: APIRoute = () => Response.json({ migrated: 0, message: 'Sign in integration is ready to connect.' });
