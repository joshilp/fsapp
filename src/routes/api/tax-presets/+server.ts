import { json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { taxPresets } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json([], { status: 401 });

	// Optional ?propertyId= filter; without it, return all active presets
	const propertyId = url.searchParams.get('propertyId');

	const rows = await db.query.taxPresets.findMany({
		where: propertyId
			? and(eq(taxPresets.propertyId, propertyId), eq(taxPresets.isActive, true))
			: eq(taxPresets.isActive, true),
		columns: { id: true, label: true, ratePercent: true },
		orderBy: (t, { asc }) => [asc(t.label)]
	});

	return json(rows);
};
