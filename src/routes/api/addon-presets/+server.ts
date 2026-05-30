import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { addonPresets } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const propertyId = url.searchParams.get('propertyId');
	if (!propertyId) return json({ error: 'Missing propertyId' }, { status: 400 });

	const presets = await db.query.addonPresets.findMany({
		where: and(eq(addonPresets.propertyId, propertyId), eq(addonPresets.isActive, true)),
		columns: { id: true, name: true, defaultUnitCents: true, isTaxable: true, taxPresetIds: true, postingFactor: true, sortOrder: true },
		orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)]
	});

	return json(presets);
};
