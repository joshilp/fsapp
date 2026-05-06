import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, ccStaging, taxPresets, groups } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: true,
			room: { with: { roomType: { columns: { id: true, name: true, category: true } } } },
			property: { columns: { id: true, name: true, checkinTime: true, checkoutTime: true, logoUrl: true, address: true, phone: true } },
			lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] },
			paymentEvents: { orderBy: (pe, { asc }) => [asc(pe.chargedAt)] },
			channel: { columns: { id: true, name: true, isOta: true } },
			clerk: { columns: { id: true, name: true } }
		}
	});

	if (!booking) throw error(404, 'Not found');

	const [presets, cc, groupMembers, groupInfo] = await Promise.all([
		db.query.taxPresets.findMany({
			where: and(eq(taxPresets.propertyId, booking.propertyId), eq(taxPresets.isActive, true)),
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		}),
		db.query.ccStaging.findFirst({
			where: eq(ccStaging.bookingId, params.id),
			columns: { lastFour: true, cardType: true, expiresAt: true }
		}),
		// If part of a group, fetch sibling bookings
		booking.groupId
			? db.query.bookings.findMany({
					where: and(
						eq(bookings.groupId, booking.groupId)
					),
					with: {
						room: { columns: { roomNumber: true } },
						guest: { columns: { name: true } },
						lineItems: { columns: { type: true, totalAmount: true } }
					},
					columns: {
						id: true,
						status: true,
						checkInDate: true,
						checkOutDate: true,
						roomConfig: true,
						groupId: true
					}
				})
			: Promise.resolve([]),
		// Fetch group details (name etc.)
		booking.groupId
			? db.query.groups.findFirst({
					where: eq(groups.id, booking.groupId),
					columns: { id: true, name: true, billingType: true, organizerName: true }
				})
			: Promise.resolve(null)
	]);

	// Prior stay context (room move)
	let priorStay: { roomNumber: string | null; checkInDate: string; checkOutDate: string } | null = null;
	if (booking.movedFromBookingId) {
		const prior = await db.query.bookings.findFirst({
			where: eq(bookings.id, booking.movedFromBookingId),
			columns: { checkInDate: true, checkOutDate: true },
			with: { room: { columns: { roomNumber: true } } }
		});
		if (prior) {
			priorStay = {
				roomNumber: prior.room?.roomNumber ?? null,
				checkInDate: prior.checkInDate,
				checkOutDate: prior.checkOutDate
			};
		}
	}

	return json({
		booking: {
			...booking,
			roomConfigs: booking.room?.configs ? JSON.parse(booking.room.configs) : []
		},
		presets,
		cc: cc ? { lastFour: cc.lastFour, cardType: cc.cardType } : null,
		groupMembers: groupMembers.filter((m) => m.id !== params.id),
		groupInfo: groupInfo ?? null,
		priorStay
	});
};
