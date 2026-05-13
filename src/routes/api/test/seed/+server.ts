/**
 * POST /api/test/seed
 * Creates a self-contained test property with room type, room, and rate season.
 * Returns all IDs needed by Playwright fixtures.
 *
 * DELETE /api/test/seed
 * Tears down everything created for a given propertyId.
 *
 * ONLY available in development mode (NODE_ENV !== 'production').
 * Requires authentication.
 */
import { json, error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	properties, roomTypes, rooms, rateSeasons, rateTiers, bookings
} from '$lib/server/db/schema';

function devOnly(locals: App.Locals) {
	if (process.env.NODE_ENV === 'production') throw error(403, 'Not available in production');
	if (!locals.user) throw error(401, 'Unauthorized');
}

function addDays(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	devOnly(locals);

	const body = await request.json().catch(() => ({}));
	const tag  = (body.tag as string | undefined) ?? `test-${Date.now()}`;

	const publicId = `test-${Date.now().toString(36)}`;

	// Property
	const [prop] = await db.insert(properties).values({
		name:           `[Test] ${tag}`,
		address:        '1 Test Street',
		city:           'Testville',
		province:       'BC',
		postalCode:     'V0V0V0',
		phone:          '555-0100',
		publicId,
		bookingEnabled: true,
		bookingDescription: 'Automated test property — safe to delete',
		// Fake Channex property ID so ARI sync fires in mock mode
		channexPropertyId: `DEV:prop-test-${Date.now()}`,
	}).returning({ id: properties.id, name: properties.name, publicId: properties.publicId });

	// Room type
	const [roomType] = await db.insert(roomTypes).values({
		propertyId: prop.id,
		name:       'Standard',
		category:   'A',
		sortOrder:  0,
		// Fake Channex IDs so ARI sync fires in mock mode
		channexRoomTypeId: `DEV:rt-test-${Date.now()}`,
		channexRatePlanId: `DEV:rp-test-${Date.now()}`,
	}).returning({ id: roomTypes.id, name: roomTypes.name });

	// Physical room
	const [room] = await db.insert(rooms).values({
		propertyId:  prop.id,
		roomTypeId:  roomType.id,
		roomNumber:  '101',
		queenBeds:   1,
		isActive:    true,
	}).returning({ id: rooms.id, roomNumber: rooms.roomNumber });

	// Rate season covering the next 90 days
	const [season] = await db.insert(rateSeasons).values({
		propertyId: prop.id,
		name:       'Test Rate',
		colour:     '#22c55e',
		startDate:  addDays(0),
		endDate:    addDays(90),
		minNights:  1,
	}).returning({ id: rateSeasons.id });

	// Rate tier: $149 / night
	await db.insert(rateTiers).values({
		seasonId:    season.id,
		roomTypeId:  roomType.id,
		nightlyRate: 14900,
	});

	return json({
		propertyId:   prop.id,
		propertyName: prop.name,
		publicId:     prop.publicId,
		roomTypeId:   roomType.id,
		roomTypeName: roomType.name,
		roomId:       room.id,
		roomNumber:   room.roomNumber,
		seasonId:     season.id,
		nightlyRate:  149,
		checkIn:      addDays(14),
		checkOut:     addDays(17),
	}, { status: 201 });
};

// ─── Teardown ─────────────────────────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ request, locals }) => {
	devOnly(locals);

	const body = await request.json().catch(() => ({}));
	const propertyId = body.propertyId as string | undefined;
	if (!propertyId) throw error(400, 'propertyId required');

	// Safety: only delete properties whose name starts with "[Test]"
	const prop = await db.query.properties.findFirst({
		where: eq(properties.id, propertyId),
		columns: { id: true, name: true }
	});
	if (!prop) return json({ deleted: false, reason: 'not found' });
	if (!prop.name.startsWith('[Test]')) {
		throw error(403, 'Will only delete properties prefixed with [Test]');
	}

	// Cascade: bookings, rooms, roomTypes, rateSeasons all have onDelete: cascade
	// so deleting the property is enough. Do it last to let FK constraints fire first.
	const bookingRows = await db.query.bookings.findMany({
		where: eq(bookings.propertyId, propertyId),
		columns: { id: true }
	});
	if (bookingRows.length) {
		await db.delete(bookings).where(
			inArray(bookings.id, bookingRows.map(b => b.id))
		);
	}

	await db.delete(properties).where(eq(properties.id, propertyId));

	return json({ deleted: true, propertyId });
};
