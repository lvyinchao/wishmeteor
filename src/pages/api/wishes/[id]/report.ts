import type { APIRoute } from 'astro';
export const POST: APIRoute = async ({ request }) => { const { reason } = await request.json(); if (!reason) return Response.json({ error: 'A reason is required.' }, { status: 400 }); return Response.json({ ok: true, message: 'Thanks — our team will review this wish.' }); };
