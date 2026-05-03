import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rateSeasons, rateTiers, roomTypes } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const year = parseInt(url.searchParams.get('year') ?? '') || new Date().getFullYear();

	const [propertiesList, roomTypesList, seasonsList] = await Promise.all([
		db.query.properties.findMany({ orderBy: (p, { asc }) => [asc(p.name)] }),
		db.query.roomTypes.findMany({
			with: { property: { columns: { name: true } } },
			orderBy: (rt, { asc }) => [asc(rt.propertyId), asc(rt.sortOrder)]
		}),
		db.query.rateSeasons.findMany({
			with: {
				tiers: {
					with: { roomType: { columns: { name: true, category: true } } }
				}
			},
			orderBy: (s, { asc }) => [asc(s.startDate)]
		})
	]);

	return { year, propertiesList, roomTypesList, seasonsList };
};

export const actions: Actions = {
	upsertSeason: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		const propertyId = g('propertyId');
		const name = g('name');
		const colour = g('colour') ?? '#cccccc';
		const startDate = g('startDate');
		const endDate = g('endDate');
		const minNights = parseInt(g('minNights') ?? '1') || 1;
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;
		if (!propertyId || !name || !startDate || !endDate)
			return fail(400, { error: 'Missing fields' });
		if (startDate > endDate) return fail(400, { error: 'Start must be before end' });
		if (id) {
			await db
				.update(rateSeasons)
				.set({ name, colour, startDate, endDate, minNights, sortOrder })
				.where(eq(rateSeasons.id, id));
		} else {
			await db.insert(rateSeasons).values({
				id: crypto.randomUUID(),
				propertyId,
				name,
				colour,
				startDate,
				endDate,
				minNights,
				sortOrder
			});
		}
		return { success: true };
	},

	deleteSeason: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const id = ((await request.formData()).get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.delete(rateSeasons).where(eq(rateSeasons.id, id));
		return { success: true };
	},

	upsertRateTier: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const seasonId = g('seasonId');
		const roomTypeId = g('roomTypeId');
		const rateStr = g('nightlyRate');
		if (!seasonId || !roomTypeId || !rateStr) return fail(400, { error: 'Missing fields' });
		const nightlyRate = Math.round(parseFloat(rateStr) * 100);
		if (isNaN(nightlyRate) || nightlyRate < 0) return fail(400, { error: 'Invalid rate' });
		const existing = await db.query.rateTiers.findFirst({
			where: and(eq(rateTiers.seasonId, seasonId), eq(rateTiers.roomTypeId, roomTypeId))
		});
		if (existing) {
			await db.update(rateTiers).set({ nightlyRate }).where(eq(rateTiers.id, existing.id));
		} else {
			await db.insert(rateTiers).values({
				id: crypto.randomUUID(),
				seasonId,
				roomTypeId,
				nightlyRate
			});
		}
		return { success: true };
	}
};
