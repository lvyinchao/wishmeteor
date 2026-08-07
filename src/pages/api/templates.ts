import type { APIRoute } from 'astro';
export const GET: APIRoute = () => Response.json({ templates: [{ id: 'meteor', name: 'Meteor trail', layouts: ['classic', 'centered'] }, { id: 'aurora', name: 'Aurora paper', layouts: ['classic'] }, { id: 'dawn', name: 'First light', layouts: ['centered'] }] });
