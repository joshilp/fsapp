/**
 * GET /api/booking/search
 * Lightweight booking lookup for tests and internal tooling.
 *
 * Query params (at least one required):
 *   otaRef      — match bookings.otaConfirmationNumber
 *   token       — match bookings.publicToken
 *   guestEmail  — match guest email (returns most recent first)
 *   propertyId  — filter by property (combine with other params)
 *   status      — filter by status (confirmed | checked_in | cancelled | etc.)
 *
 * Returns an array of lightweight booking objects safe for test assertions.
 * Requires authentication — not a public endpoint.
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, guests } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const otaRef     = url.searchParams.get('otaRef')     ?? null;
	const token      = url.searchParams.get('token')      ?? null;
	const guestEmail = url.searchParams.get('guestEmail') ?? null;
	const propertyId = url.searchParams.get('propertyId') ?? null;
	const status     = url.searchParams.get('status')     ?? null;

	if (!otaRef && !token && !guestEmail) {
		throw error(400, 'Provide at least one of: otaRef, token, guestEmail');
	}

	// Build filter conditions
	const conditions = [];
	if (propertyId) conditions.push(eq(bookings.propertyId, propertyId));
	if (status)     conditions.push(eq(bookings.status, status as 'confirmed'));
	if (otaRef)     conditions.push(eq(bookings.otaConfirmationNumber, otaRef));
	if (token)      conditions.push(eq(bookings.publicToken, token));

	if (guestEmail) {
		// Join through guest table for email lookup
		const guest = await db.query.guests.findFirst({
			where: eq(guests.email, guestEmail),
			columns: { id: true }
		});
		if (!guest) return json([]);
		conditions.push(eq(bookings.guestId, guest.id));
	}

	const rows = await db.query.bookings.findMany({
		where: and(...conditions),
		with: {
			guest:    { columns: { name: true, email: true, phone: true } },
			room:     { columns: { roomNumber: true, roomTypeId: true } },
			channel:  { columns: { name: true, isOta: true } },
			property: { columns: { name: true } },
			lineItems: { columns: { type: true, totalAmount: true, label: true } }
		},
		columns: {
			id: true, propertyId: true, roomId: true, requestedRoomTypeId: true,
			status: true, checkInDate: true, checkOutDate: true,
			numAdults: true, numChildren: true, notes: true,
			publicToken: true, otaConfirmationNumber: true,
			groupId: true, guestId: true,
			createdAt: true
		},
		orderBy: (b, { desc }) => [desc(b.createdAt)],
		limit: 20
	});

	return json(rows.map(r => ({
		id:                    r.id,
		propertyId:            r.propertyId,
		propertyName:          r.property?.name ?? null,
		roomId:                r.roomId,
		roomNumber:            r.room?.roomNumber ?? null,
		requestedRoomTypeId:   r.requestedRoomTypeId,
		status:                r.status,
		checkInDate:           r.checkInDate,
		checkOutDate:          r.checkOutDate,
		numAdults:             r.numAdults,
		numChildren:           r.numChildren,
		notes:                 r.notes,
		publicToken:           r.publicToken,
		otaConfirmationNumber: r.otaConfirmationNumber,
		groupId:               r.groupId ?? null,
		guestId:               r.guestId ?? null,
		guestName:             r.guest?.name ?? null,
		guestEmail:            r.guest?.email ?? null,
		guestPhone:            r.guest?.phone ?? null,
		channelName:           r.channel?.name ?? null,
		isOta:                 r.channel?.isOta ?? false,
		lineItems:             r.lineItems,
		createdAt:             r.createdAt
	})));
};
