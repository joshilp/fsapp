import { fail, redirect } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	bookingChannels,
	bookings,
	losDiscounts,
	promoCodes,
	properties,
	rooms,
	roomTypes,
	taxPresets,
	addonPresets
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const [propertiesList, taxPresetsList, addonPresetsList, roomsList, roomTypesList, channelsList, losDiscountsList, promoCodesList] =
		await Promise.all([
			db.query.properties.findMany({ orderBy: (t, { asc }) => [asc(t.name)] }),
			db.query.taxPresets.findMany({
				with: { property: { columns: { name: true } } },
				where: (t, { eq }) => eq(t.isActive, true),
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.sortOrder)]
			}),
			db.query.addonPresets.findMany({
				where: (t, { eq }) => eq(t.isActive, true),
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
			db.query.losDiscounts.findMany({
				with: { roomType: { columns: { name: true, category: true } } },
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.sortOrder)]
			}),
			db.query.promoCodes.findMany({
				where: (t, { eq }) => eq(t.isActive, true),
				orderBy: (t, { asc }) => [asc(t.propertyId), asc(t.createdAt)]
			}),
		]);

	return {
		propertiesList,
		taxPresetsList,
		addonPresetsList,
		roomsList,
		roomTypesList,
		channelsList,
		losDiscountsList,
		promoCodesList
	};
};

export const actions: Actions = {
	// ── General: name, address, contact, logo, check-in/out ──────────────────
	updatePropertyGeneral: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({
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
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// ── Policy: cancellation, deposit, policy text ────────────────────────────
	updatePropertyPolicy: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({
			policyText: g('policyText'),
			depositNights: parseInt(g('depositNights') ?? '1') || 1,
			cancellationFeeCents: Math.round((parseFloat(g('cancellationFeeDollars') ?? '25') || 25) * 100),
			noRefundDays: parseInt(g('noRefundDays') ?? '30') || 30,
			depositCalcMethod: g('depositCalcMethod') ?? 'first_night',
			depositPercent: parseInt(g('depositPercent') ?? '20') || 20,
			depositFlatCents: Math.round((parseFloat(g('depositFlatDollars') ?? '0') || 0) * 100),
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// ── Booking page: online booking settings ────────────────────────────────
	updatePropertyBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({
			bookingEnabled: (fd.get('bookingEnabled') as string) === '1',
			bookingDescription: g('bookingDescription'),
			heroImageUrl: g('heroImageUrl'),
			accentColour: g('accentColour') || g('accentColourText') || null,
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// Legacy full-update (kept for compatibility) ─────────────────────────────
	updateProperty: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({
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
			accentColour: g('accentColour') || g('accentColourText') || null,
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// Update restriction settings: max stay, gap fill, quarantine
	updatePropertyRestrictions: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		const defaultMaxNightsRaw = g('defaultMaxNights');
		const gapFillNightsRaw    = g('gapFillNights');
		const quarantineHoursRaw  = g('quarantineHours');
		await db.update(properties).set({
			defaultMaxNights: defaultMaxNightsRaw ? parseInt(defaultMaxNightsRaw) || null : null,
			gapFillNights:    gapFillNightsRaw    ? Math.max(0, parseInt(gapFillNightsRaw) || 0) : 0,
			quarantineHours:  quarantineHoursRaw  ? Math.max(0, parseInt(quarantineHoursRaw) || 0) : 0,
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// Update Elavon Converge payment credentials for a property
	updatePropertyPayments: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({
			elavonMerchantId: g('elavonMerchantId'),
			elavonUserId:     g('elavonUserId'),
			elavonPin:        g('elavonPin'),
		}).where(eq(properties.id, id));
		return { success: true };
	},

	// Update Channex IDs for a property (safe — only touches Channex fields)
	updateChannexProperty: async ({ request, locals }) => {		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = (fd.get('id') as string)?.trim();
		const channexPropertyId = (fd.get('channexPropertyId') as string)?.trim() || null;
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({ channexPropertyId }).where(eq(properties.id, id));
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
		const appliesToRoom  = fd.get('appliesToRoom')  === '1';
		const appliesToAddon = fd.get('appliesToAddon') === '1';

		if (id) {
			await db
				.update(taxPresets)
				.set({ label, ratePercent, sortOrder, appliesToRoom, appliesToAddon })
				.where(eq(taxPresets.id, id));
		} else {
			await db.insert(taxPresets).values({
				id: crypto.randomUUID(),
				propertyId,
				label,
				ratePercent,
				sortOrder,
				appliesToRoom,
				appliesToAddon,
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

	// ── Add-on presets ────────────────────────────────────────────────────────
	upsertAddonPreset: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		const propertyId = g('propertyId');
		const name = g('name');
		if (!propertyId || !name) return fail(400, { error: 'Missing required fields' });
		const unitStr = g('defaultUnitCents');
		const defaultUnitCents = unitStr ? Math.round(parseFloat(unitStr) * 100) : null;
		const isTaxable = fd.get('isTaxable') === '1';
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;
		if (id) {
			await db.update(addonPresets).set({ name, defaultUnitCents, isTaxable, sortOrder }).where(eq(addonPresets.id, id));
		} else {
			await db.insert(addonPresets).values({ id: crypto.randomUUID(), propertyId, name, defaultUnitCents, isTaxable, sortOrder });
		}
		return { success: true };
	},

	deleteAddonPreset: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = (fd.get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(addonPresets).set({ isActive: false }).where(eq(addonPresets.id, id));
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

	updateRoomAccess: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(rooms).set({
			doorCode:            g('doorCode'),
			checkinInstructions: g('checkinInstructions'),
		}).where(eq(rooms.id, id));
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
		const defaultRateRaw = g('defaultRateCents');
		const defaultRateCents = defaultRateRaw ? Math.round(parseFloat(defaultRateRaw) * 100) || null : null;
		const description = g('description');
		const imageUrl = g('imageUrl');
		const maxOccupancyRaw = g('maxOccupancy');
		const maxOccupancy = maxOccupancyRaw ? parseInt(maxOccupancyRaw) || null : null;
		const maxNightsRaw = g('maxNights');
		const maxNights = maxNightsRaw ? parseInt(maxNightsRaw) || null : null;
		const parentRoomTypeId = g('parentRoomTypeId') || null;
		if (!propertyId || !name || !category) return fail(400, { error: 'Missing fields' });
		if (id) {
			await db.update(roomTypes).set({ name, category, sortOrder, defaultRateCents, description, imageUrl, maxOccupancy, maxNights, parentRoomTypeId }).where(eq(roomTypes.id, id));
		} else {
			await db.insert(roomTypes).values({ id: crypto.randomUUID(), propertyId, name, category, sortOrder, defaultRateCents, description, imageUrl, maxOccupancy, maxNights, parentRoomTypeId });
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

	// ── LOS Discounts ─────────────────────────────────────────────────────────
	upsertLosDiscount: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		const propertyId = g('propertyId');
		const label = g('label');
		const minNightsRaw = g('minNights');
		const discountPercentRaw = g('discountPercent');
		const roomTypeId = g('roomTypeId') || null;
		const sortOrder = parseInt(g('sortOrder') ?? '0') || 0;
		if (!propertyId || !label || !minNightsRaw || !discountPercentRaw) return fail(400, { error: 'Missing fields' });
		const minNights = parseInt(minNightsRaw);
		const discountPercent = parseFloat(discountPercentRaw);
		if (isNaN(minNights) || minNights < 2) return fail(400, { error: 'Min nights must be ≥ 2' });
		if (isNaN(discountPercent) || discountPercent <= 0 || discountPercent >= 100) return fail(400, { error: 'Discount must be 0–100%' });
		if (id) {
			await db.update(losDiscounts).set({ label, minNights, discountPercent, roomTypeId, sortOrder }).where(eq(losDiscounts.id, id));
		} else {
			await db.insert(losDiscounts).values({ id: crypto.randomUUID(), propertyId, label, minNights, discountPercent, roomTypeId, sortOrder });
		}
		return { success: true };
	},

	deleteLosDiscount: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const id = ((await request.formData()).get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.delete(losDiscounts).where(eq(losDiscounts.id, id));
		return { success: true };
	},

	// ── Promo Codes ───────────────────────────────────────────────────────────
	upsertPromoCode: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('id');
		const propertyId = g('propertyId');
		const code = g('code')?.toUpperCase();
		const label = g('label');
		const discountPercentRaw = g('discountPercent');
		const discountCentsRaw = g('discountDollars');
		const maxUsesRaw = g('maxUses');
		const expiresRaw = g('expiresAt');
		if (!propertyId || !code || !label) return fail(400, { error: 'Missing fields' });
		const discountPercent = discountPercentRaw ? parseFloat(discountPercentRaw) || null : null;
		const discountCents = discountCentsRaw ? Math.round(parseFloat(discountCentsRaw) * 100) || null : null;
		if (!discountPercent && !discountCents) return fail(400, { error: 'Must set a % or $ discount' });
		const maxUses = maxUsesRaw ? parseInt(maxUsesRaw) || null : null;
		const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
		if (id) {
			await db.update(promoCodes).set({ code, label, discountPercent, discountCents, maxUses, expiresAt }).where(eq(promoCodes.id, id));
		} else {
			await db.insert(promoCodes).values({ id: crypto.randomUUID(), propertyId, code, label, discountPercent, discountCents, maxUses, expiresAt });
		}
		return { success: true };
	},

	deletePromoCode: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const id = ((await request.formData()).get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(promoCodes).set({ isActive: false }).where(eq(promoCodes.id, id));
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
	},

	// ── Email template customization ──────────────────────────────────────────
	updateEmailTemplates: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = ((fd.get('id') as string) ?? '').trim();
		const emailNote = ((fd.get('emailNote') as string) ?? '').trim() || null;
		const emailSignature = ((fd.get('emailSignature') as string) ?? '').trim() || null;
		if (!id) return fail(400, { error: 'Missing property ID' });
		await db.update(properties).set({ emailNote, emailSignature }).where(eq(properties.id, id));
		return { success: true };
	},

	// ── Property: create / delete ─────────────────────────────────────────────
	createProperty: async ({ request, locals }) => {
		const fd = await request.formData();
		const name = ((fd.get('name') as string) ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });
		const newId = crypto.randomUUID();
		await db.insert(properties).values({
			id: newId,
			name,
			address: '—',
			city: '—',
			province: '—'
		});
		return { success: true, newPropertyId: newId };
	},

	deleteProperty: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const id = ((await request.formData()).get('id') as string)?.trim();
		if (!id) return fail(400, { error: 'Missing ID' });
		const hasBookings = await db.query.bookings.findFirst({
			where: eq(bookings.propertyId, id),
			columns: { id: true }
		});
		if (hasBookings) return fail(400, { error: 'Cannot delete a property that has bookings' });
		await db.delete(properties).where(eq(properties.id, id));
		return { success: true };
	}
};
