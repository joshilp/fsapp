/**
 * POST /api/groups
 * Creates a group record + all its room bookings in one shot.
 *
 * Body shape:
 * {
 *   groupName: string,
 *   organizerName?: string,
 *   organizerPhone?: string,
 *   organizerEmail?: string,
 *   billingType: 'master' | 'individual',
 *   notes?: string,
 *   propertyId?: string,        // optional; set if all rooms on same property
 *   channelId: string,
 *   clerkId?: string,
 *   depositAmount?: number,     // cents — applied to first booking
 *   depositMethod?: string,
 *   guestName: string,
 *   guestPhone?: string,
 *   guestEmail?: string,
 *   rooms: Array<{
 *     roomId: string,
 *     checkIn: string,          // YYYY-MM-DD
 *     checkOut: string,
 *     roomConfig?: string,
 *     rateLines: Array<{ label, qty?, unit?, total }>,
 *     taxLines:  Array<{ label, total }>,
 *   }>
 * }
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	groups, bookings, guests, bookingLineItems, paymentEvents, rooms as roomsTable
} from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const {
		groupName, organizerName, organizerPhone, organizerEmail,
		billingType = 'master', notes,
		propertyId, channelId, clerkId,
		depositAmount, depositMethod,
		guestName, guestPhone, guestEmail,
		rooms: roomSpecs = []
	} = body;

	if (!groupName) return json({ error: 'Group name is required' }, { status: 400 });
	if (!channelId) return json({ error: 'Channel is required' }, { status: 400 });
	if (!Array.isArray(roomSpecs) || roomSpecs.length === 0)
		return json({ error: 'At least one room is required' }, { status: 400 });

	// ── Determine property (use first room's if not given) ────────────────────
	const firstRoom = await db.query.rooms.findFirst({
		where: eq(roomsTable.id, roomSpecs[0].roomId),
		columns: { propertyId: true }
	});
	const resolvedPropertyId = propertyId ?? firstRoom?.propertyId ?? '';

	// ── Guest: find or create from organizer contact ─────────────────────────
	let guestId: string | null = null;
	if (guestName) {
		const cleanPhone = guestPhone?.replace(/\D/g, '') || null;
		const existing = cleanPhone
			? await db.query.guests.findFirst({ where: eq(guests.phone, cleanPhone) })
			: null;
		if (existing) {
			guestId = existing.id;
			await db.update(guests).set({ name: guestName, email: guestEmail ?? existing.email }).where(eq(guests.id, existing.id));
		} else {
			guestId = crypto.randomUUID();
			await db.insert(guests).values({ id: guestId, name: guestName, phone: cleanPhone, email: guestEmail ?? null });
		}
	}

	// ── Create group ──────────────────────────────────────────────────────────
	const groupId = crypto.randomUUID();
	await db.insert(groups).values({
		id: groupId,
		propertyId: resolvedPropertyId || null,
		name: groupName,
		organizerName: organizerName || null,
		organizerPhone: organizerPhone?.replace(/\D/g, '') || null,
		organizerEmail: organizerEmail || null,
		billingType,
		notes: notes || null
	});

	// ── Create bookings ───────────────────────────────────────────────────────
	const bookingIds: string[] = [];
	const now = new Date();

	for (const spec of roomSpecs) {
		const { roomId, checkIn, checkOut, roomConfig, rateLines = [], taxLines = [] } = spec;
		if (!roomId || !checkIn || !checkOut || checkIn >= checkOut) continue;

		// Fetch room's property
		const rm = await db.query.rooms.findFirst({
			where: eq(roomsTable.id, roomId),
			columns: { propertyId: true }
		});
		if (!rm) continue;

		const bookingId = crypto.randomUUID();
		await db.insert(bookings).values({
			id: bookingId,
			propertyId: rm.propertyId,
			roomId,
			guestId,
			channelId,
			clerkId: clerkId ?? locals.user.id,
			status: 'confirmed',
			checkInDate: checkIn,
			checkOutDate: checkOut,
			roomConfig: roomConfig ?? null,
			groupId
		});
		bookingIds.push(bookingId);

		// Line items
		const items: (typeof bookingLineItems.$inferInsert)[] = [];
		rateLines.forEach((l: { label: string; qty?: number; unit?: number; total: number }, i: number) => {
			if (l.label && l.total) {
				items.push({
					id: crypto.randomUUID(), bookingId, type: 'rate',
					label: l.label,
					quantity: l.qty ?? null,
					unitAmount: l.unit != null ? Math.round(l.unit * 100) : null,
					totalAmount: Math.round(l.total * 100),
					sortOrder: i
				});
			}
		});
		taxLines.forEach((l: { label: string; total: number }, i: number) => {
			if (l.label && l.total) {
				items.push({
					id: crypto.randomUUID(), bookingId, type: 'tax',
					label: l.label, quantity: null, unitAmount: null,
					totalAmount: Math.round(l.total * 100),
					sortOrder: rateLines.length + i
				});
			}
		});
		if (items.length > 0) await db.insert(bookingLineItems).values(items);
	}

	// ── Deposit against first booking ─────────────────────────────────────────
	if (depositAmount && depositAmount > 0 && bookingIds.length > 0) {
		await db.insert(paymentEvents).values({
			id: crypto.randomUUID(),
			bookingId: bookingIds[0],
			type: 'deposit',
			amount: Math.round(depositAmount),
			paymentMethod: depositMethod ?? 'cash',
			chargedAt: now
		});
	}

	return json({ groupId, bookingIds });
};
