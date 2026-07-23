/**
 * POST /api/ari/sync-all
 * Triggers a full ARI re-sync for all room types in a property for the next
 * 365 days. Called from Settings → Channex when the operator wants to force
 * Channex back in sync (e.g. after initial setup or after a connectivity gap).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncAllARIForProperty } from '$lib/server/ari-sync';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let propertyId: string;
	try {
		({ propertyId } = await request.json());
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	if (!propertyId) return json({ error: 'Missing propertyId' }, { status: 400 });

	const result = await syncAllARIForProperty(propertyId);
	return json({ ok: true, ...result });
};
