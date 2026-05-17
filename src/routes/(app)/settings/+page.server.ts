import { fail, redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	bookingChannels,
	properties,
	rateSeasons,
	rateTiers,
	rooms,
	roomTypes,
	taxPresets
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const [propertiesList, taxPresetsList, roomsList, roomTypesList, channelsList, rateSeasonsList] =
		await Promise.all([
			db.query.properties.findMany({ orderBy: (t, { asc }) => [asc(t.name)] }),
			db.query.taxPresets.findMany({
				with: { property: { columns: { name: true } } },
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.sortOrder)]
			}),
			db.query.rooms.findMany({
				with: {
					roomType: { columns: { name: true, category: true } },
					property: { columns: { name: true } }
				},
				orderBy: sql`CAST(${rooms.roomNumber} AS INTEGER)`
			}),
			db.query.roomTypes.findMany({
				with: { property: { columns: { name: true } } },
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.sortOrder)]
			}),
			db.query.bookingChannels.findMany({ orderBy: (t, { asc }) => [asc(t.sortOrder)] }),
			db.query.rateSeasons.findMany({
				with: { tiers: { with: { roomType: { columns: { name: true, category: true } } } } },
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.sortOrder)]
			})
		]);

	return {
		propertiesList,
		taxPresetsList,
		roomsList,
		roomTypesList,
		channelsList,
		rateSeasonsList
	};
};

export const actions: Actions = {
	// Update property details
	updateProperty: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });

		await db
			.update(properties)
			.set({
			name: g('name') ?? undefined,
			address: g('address') ?? undefined,
			city: g('city') ?? undefined,
			province: g('province') ?? undefined,
			postalCode: g('postalCode'),
			phone: g('phone'),
			gstNumber: g('gstNumber'),
			logoUrl: g('logoUrl'),
			checkinTime: g('checkinTime') ?? undefined,
				checkoutTime: g('checkoutTime') ?? undefined,
				policyText: g('policyText'),
				depositNights: parseInt(g('depositNights') ?? '1') || 1,
				cancellationFeeCents: Math.round((parseFloat(g('cancellationFeeDollars') ?? '25') || 25) * 100),
				noRefundDays: parseInt(g('noRefundDays') ?? '30') || 30,
		depositCalcMethod: g('depositCalcMethod') ?? 'first_night',
			depositPercent: parseInt(g('depositPercent') ?? '20') || 20,
			depositFlatCents: Math.round((parseFloat(g('depositFlatDollars') ?? '0') || 0) * 100),
			channexPropertyId: g('channexPropertyId'),
			bookingEnabled: (fd.get('bookingEnabled') as string) === '1',
			bookingDescription: g('bookingDescription'),
			heroImageUrl: g('heroImageUrl'),
			accentColour: g('accentColour') || g('accentColourText') || null
		})
		.where(eq(properties.id, id));

		return { success: true };
	},

	// Update Channex IDs for a room type
	updateRoomTypeChannex: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing room type ID' });
		await db.update(roomTypes).set({
			channexRoomTypeId: g('channexRoomTypeId'),
			channexRatePlanId: g('channexRatePlanId')
		}).where(eq(roomTypes.id, id));
		return { success: true };
	},

	// Upsert a tax preset (create or update)
	upsertTaxPreset: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const id = g('id');
		const propertyId = g('propertyId');
		const label = g('label');
		const rateStr = g('ratePercent');

		if (!propertyId || !label || !rateStr) {
			return fail(400, { error: 'Missing required fields' });
		}
		const ratePercent = parseFloat(rateStr);
		if (isNaN(ratePercent) || ratePercent < 0) {
			return fail(400, { error: 'Invalid rate' });
		}
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;

		if (id) {
			await db
				.update(taxPresets)
				.set({ label, ratePercent, sortOrder })
				.where(eq(taxPresets.id, id));
		} else {
			await db.insert(taxPresets).values({
				id: crypto.randomUUID(),
				propertyId,
				label,
				ratePercent,
				sortOrder,
				isActive: true
			});
		}
		return { success: true };
	},

	// Soft-delete a tax preset
	deleteTaxPreset: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = (fd.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(taxPresets).set({ isActive: false }).where(eq(taxPresets.id, id));
		return { success: true };
	},

	// Add a new room
	addRoom: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const propertyId = g('propertyId');
		const roomNumber = g('roomNumber');
		const roomTypeId = g('roomTypeId') || null;
		const numRooms = Math.max(1, parseInt(fd.get('numRooms') as string || '1', 10) || 1);
		const kingBeds = parseInt(fd.get('kingBeds') as string || '0', 10) || 0;
		const queenBeds = parseInt(fd.get('queenBeds') as string || '0', 10) || 0;
		const doubleBeds = parseInt(fd.get('doubleBeds') as string || '0', 10) || 0;
		const hasKitchen = fd.get('hasKitchen') === '1';
		const hasHideabed = fd.get('hasHideabed') === '1';
		const configsRaw = g('configs');
		const configLines = configsRaw
			? configsRaw.split('\n').map((s) => s.trim()).filter(Boolean)
			: [];
		const configs = configLines.length > 1 ? JSON.stringify(configLines) : null;

		if (!propertyId || !roomNumber) return fail(400, { error: 'Missing required fields' });

		const exists = await db.query.rooms.findFirst({
			where: and(eq(rooms.propertyId, propertyId), eq(rooms.roomNumber, roomNumber))
		});
		if (exists) {
			return fail(400, { error: `Room ${roomNumber} already exists for this property` });
		}

		await db.insert(rooms).values({
			id: crypto.randomUUID(),
			propertyId,
			roomNumber,
			roomTypeId,
			numRooms,
			kingBeds,
			queenBeds,
			doubleBeds,
			hasKitchen,
			hasHideabed,
			configs,
			isActive: true
		});
		return { success: true };
	},

	// Toggle room active/inactive
	toggleRoom: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = (fd.get('id') as string)?.trim();
		const isActive = fd.get('isActive') === 'true';
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(rooms).set({ isActive: !isActive }).where(eq(rooms.id, id));
		return { success: true };
	},

	// ── Room types ──────────────────────────────────────────────────────────────

	upsertRoomType: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		const propertyId = g('propertyId');
		const name = g('name');
		const category = g('category');
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;
		if (!propertyId || !name || !category) return fail(400, { error: 'Missing fields' });
		if (id) {
			await db.update(roomTypes).set({ name, category, sortOrder }).where(eq(roomTypes.id, id));
		} else {
			await db.insert(roomTypes).values({ id: crypto.randomUUID(), propertyId, name, category, sortOrder });
		}
		return { success: true };
	},

	deleteRoomType: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const id = ((await request.formData()).get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.delete(roomTypes).where(eq(roomTypes.id, id));
		return { success: true };
	},

	// ── Rate seasons (pricing calendar) ─────────────────────────────────────────

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
		if (!propertyId || !name || !startDate || !endDate) return fail(400, { error: 'Missing fields' });
		if (startDate > endDate) return fail(400, { error: 'Start must be before end' });
		if (id) {
			await db.update(rateSeasons)
				.set({ name, colour, startDate, endDate, minNights, sortOrder, baseRateCents })
				.where(eq(rateSeasons.id, id));
		} else {
			const newId = crypto.randomUUID();
			await db.insert(rateSeasons).values({
				id: newId, propertyId, name, colour, startDate, endDate, minNights, sortOrder, baseRateCents
			});
			// Auto-create tiers for all room types at the base rate when a base is provided
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
		// Support two modes: direct rate OR base + upcharge
		const rateStr = g('nightlyRate');
		const upchargeStr = g('upcharge');
		const baseCentsStr = g('baseRateCents');
		if (!seasonId || !roomTypeId) return fail(400, { error: 'Missing fields' });
		let nightlyRate: number;
		if (upchargeStr !== null && baseCentsStr !== null) {
			// Upcharge mode: effective = base + upcharge (upcharge may be negative for cheaper types)
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
			await db.insert(rateTiers).values({ id: crypto.randomUUID(), seasonId, roomTypeId, nightlyRate });
		}
		return { success: true };
	},

	// Set all room types in a season to the season's base rate (upcharge = 0)
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
	},

	// Upsert a booking channel
	upsertChannel: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const id = g('id');
		const name = g('name');
		const isOta = fd.get('isOta') === 'true';
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;

		if (!name) return fail(400, { error: 'Name is required' });

		if (id) {
			await db.update(bookingChannels).set({ name, isOta, sortOrder }).where(eq(bookingChannels.id, id));
		} else {
			await db.insert(bookingChannels).values({
				id: crypto.randomUUID(),
				name,
				isOta,
				sortOrder,
				isActive: true
			});
		}
		return { success: true };
	}
};
