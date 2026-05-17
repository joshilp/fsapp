import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gte, lte } from 'drizzle-orm';
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

	const activePropId = url.searchParams.get('prop') || propertiesList[0]?.id || '';

	return { year, activePropId, propertiesList, roomTypesList, seasonsList };
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
		const baseRateCentsRaw = g('baseRateCents');
		const baseRateCents = baseRateCentsRaw ? Math.round(parseFloat(baseRateCentsRaw) * 100) || null : null;
		if (!propertyId || !name || !startDate || !endDate)
			return fail(400, { error: 'Missing fields' });
		if (startDate > endDate) return fail(400, { error: 'Start must be before end' });
		if (id) {
			await db
				.update(rateSeasons)
				.set({ name, colour, startDate, endDate, minNights, sortOrder, baseRateCents })
				.where(eq(rateSeasons.id, id));
		} else {
			const newId = crypto.randomUUID();
			await db.insert(rateSeasons).values({
				id: newId, propertyId, name, colour, startDate, endDate, minNights, sortOrder, baseRateCents
			});
			// Auto-create tiers for all room types at the base rate when provided
			if (baseRateCents) {
				const rts = await db.query.roomTypes.findMany({
					where: eq(roomTypes.propertyId, propertyId),
					columns: { id: true }
				});
				for (const rt of rts) {
					await db.insert(rateTiers).values({
						id: crypto.randomUUID(), seasonId: newId, roomTypeId: rt.id, nightlyRate: baseRateCents
					});
				}
			}
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
		const upchargeStr = g('upcharge');
		const baseCentsStr = g('baseRateCents');
		if (!seasonId || !roomTypeId) return fail(400, { error: 'Missing fields' });
		let nightlyRate: number;
		if (upchargeStr !== null && baseCentsStr !== null) {
			const baseCents = parseInt(baseCentsStr) || 0;
			const upchargeCents = Math.round(parseFloat(upchargeStr) * 100);
			nightlyRate = Math.max(0, baseCents + upchargeCents);
		} else if (rateStr) {
			nightlyRate = Math.round(parseFloat(rateStr) * 100);
		} else {
			return fail(400, { error: 'Missing rate' });
		}
		if (isNaN(nightlyRate) || nightlyRate < 0) return fail(400, { error: 'Invalid rate' });
		const existing = await db.query.rateTiers.findFirst({
			where: and(eq(rateTiers.seasonId, seasonId), eq(rateTiers.roomTypeId, roomTypeId))
		});
		if (existing) {
			await db.update(rateTiers).set({ nightlyRate }).where(eq(rateTiers.id, existing.id));
		} else {
			await db.insert(rateTiers).values({
				id: crypto.randomUUID(), seasonId, roomTypeId, nightlyRate
			});
		}
		return { success: true };
	},

	// Copy all seasons (+ tiers) from fromYear to toYear, shifting dates by the year difference
	copyYear: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const propertyId = g('propertyId');
		const fromYear = parseInt(g('fromYear') ?? '') || 0;
		const toYear = parseInt(g('toYear') ?? '') || 0;
		if (!propertyId || !fromYear || !toYear || fromYear === toYear)
			return fail(400, { error: 'Invalid parameters' });

		function shiftYear(dateStr: string, diff: number): string {
			const [y, m, d] = dateStr.split('-').map(Number);
			return `${y + diff}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		}

		const diff = toYear - fromYear;
		// Only copy seasons that actually overlap with fromYear (prevents pulling in old years)
		const yearStart = `${fromYear}-01-01`;
		const yearEnd = `${fromYear}-12-31`;
		const fromSeasons = await db.query.rateSeasons.findMany({
			where: and(
				eq(rateSeasons.propertyId, propertyId),
				lte(rateSeasons.startDate, yearEnd),
				gte(rateSeasons.endDate, yearStart)
			),
			with: { tiers: true }
		});

		let copied = 0;
		for (const season of fromSeasons) {
			const newStart = shiftYear(season.startDate, diff);
			const newEnd = shiftYear(season.endDate, diff);
			// Skip if a season with identical dates already exists (prevent double-copy)
			const dup = await db.query.rateSeasons.findFirst({
				where: and(
					eq(rateSeasons.propertyId, propertyId),
					eq(rateSeasons.startDate, newStart),
					eq(rateSeasons.endDate, newEnd)
				)
			});
			if (dup) continue;
			const newSeasonId = crypto.randomUUID();
			await db.insert(rateSeasons).values({
				id: newSeasonId, propertyId,
				name: season.name, colour: season.colour,
				startDate: newStart, endDate: newEnd,
				minNights: season.minNights, sortOrder: season.sortOrder,
				baseRateCents: season.baseRateCents
			});
			for (const tier of season.tiers) {
				await db.insert(rateTiers).values({
					id: crypto.randomUUID(), seasonId: newSeasonId,
					roomTypeId: tier.roomTypeId, nightlyRate: tier.nightlyRate
				});
			}
			copied++;
		}
		return { success: true, copied };
	},

	// Delete all seasons for a property that overlap with a given year
	deleteYear: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const propertyId = (fd.get('propertyId') as string)?.trim();
		const year = parseInt((fd.get('year') as string)?.trim() ?? '') || 0;
		if (!propertyId || !year) return fail(400, { error: 'Missing fields' });
		const yearStart = `${year}-01-01`;
		const yearEnd = `${year}-12-31`;
		const toDelete = await db.query.rateSeasons.findMany({
			where: and(
				eq(rateSeasons.propertyId, propertyId),
				lte(rateSeasons.startDate, yearEnd),
				gte(rateSeasons.endDate, yearStart)
			),
			columns: { id: true }
		});
		for (const s of toDelete) {
			await db.delete(rateSeasons).where(eq(rateSeasons.id, s.id));
		}
		return { success: true, deleted: toDelete.length };
	},

	// Set all room types in a season to the base rate (upcharge = 0)
	upsertAllTiersAtBase: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const seasonId = g('seasonId');
		const propertyId = g('propertyId');
		if (!seasonId || !propertyId) return fail(400, { error: 'Missing fields' });
		const season = await db.query.rateSeasons.findFirst({ where: eq(rateSeasons.id, seasonId) });
		if (!season?.baseRateCents) return fail(400, { error: 'Season has no base rate' });
		const rts = await db.query.roomTypes.findMany({
			where: eq(roomTypes.propertyId, propertyId),
			columns: { id: true }
		});
		for (const rt of rts) {
			const existing = await db.query.rateTiers.findFirst({
				where: and(eq(rateTiers.seasonId, seasonId), eq(rateTiers.roomTypeId, rt.id))
			});
			if (existing) {
				await db.update(rateTiers).set({ nightlyRate: season.baseRateCents }).where(eq(rateTiers.id, existing.id));
			} else {
				await db.insert(rateTiers).values({
					id: crypto.randomUUID(), seasonId, roomTypeId: rt.id, nightlyRate: season.baseRateCents
				});
			}
		}
		return { success: true };
	}
};
