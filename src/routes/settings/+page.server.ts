import { fail, redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	bookingChannels,
	properties,
	rooms,
	roomTypes,
	taxPresets
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const [propertiesList, taxPresetsList, roomsList, roomTypesList, channelsList] = await Promise.all(
		[
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
			db.query.bookingChannels.findMany({ orderBy: (t, { asc }) => [asc(t.sortOrder)] })
		]
	);

	return { propertiesList, taxPresetsList, roomsList, roomTypesList, channelsList };
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
				checkinTime: g('checkinTime') ?? undefined,
				checkoutTime: g('checkoutTime') ?? undefined,
				policyText: g('policyText')
			})
			.where(eq(properties.id, id));

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
