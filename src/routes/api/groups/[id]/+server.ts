import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups, bookings, bookingLineItems } from '$lib/server/db/schema';

/** GET /api/groups/[id] — full group folio with all linked bookings */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const group = await db.query.groups.findFirst({
		where: eq(groups.id, params.id),
		with: {
			bookings: {
				with: {
					room: { columns: { roomNumber: true }, with: { roomType: { columns: { name: true, category: true } } } },
					guest: { columns: { id: true, name: true, phone: true, email: true } },
					lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] },
					paymentEvents: { orderBy: (pe, { asc }) => [asc(pe.createdAt)] }
				},
				orderBy: (b, { asc }) => [asc(b.checkInDate)]
			}
		}
	});
	if (!group) return json({ error: 'Not found' }, { status: 404 });
	return json(group);
};

/** PATCH /api/groups/[id] — update group meta + per-booking line items */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json();

	// Update group meta
	await db.update(groups).set({
		name:           body.name           ?? undefined,
		organizerName:  body.organizerName  ?? undefined,
		organizerPhone: body.organizerPhone ?? undefined,
		organizerEmail: body.organizerEmail ?? undefined,
		billingType:    body.billingType    ?? undefined,
		notes:          body.notes          ?? undefined
	}).where(eq(groups.id, params.id));

	// Update per-booking line items and dates if provided
	const rooms: { bookingId: string; checkIn?: string; checkOut?: string; rateLines: unknown[]; taxLines: unknown[] }[] = body.rooms ?? [];

	for (const spec of rooms) {
		if (!spec.bookingId) continue;

		// Verify booking belongs to this group
		const bk = await db.query.bookings.findFirst({
			where: and(eq(bookings.id, spec.bookingId), eq(bookings.groupId, params.id)),
			columns: { id: true }
		});
		if (!bk) continue;

		// Update dates if provided
		if (spec.checkIn && spec.checkOut && spec.checkIn < spec.checkOut) {
			await db.update(bookings)
				.set({ checkInDate: spec.checkIn, checkOutDate: spec.checkOut })
				.where(eq(bookings.id, spec.bookingId));
		}

		// Replace line items (delete all, re-insert)
		await db.delete(bookingLineItems).where(eq(bookingLineItems.bookingId, spec.bookingId));

		const items: (typeof bookingLineItems.$inferInsert)[] = [];
		(spec.rateLines as { label: string; qty?: number; unit?: number; total: number }[]).forEach((l, i) => {
			if (l.label && l.total) items.push({
				id: crypto.randomUUID(), bookingId: spec.bookingId, type: 'rate',
				label: l.label, quantity: l.qty ?? null,
				unitAmount: l.unit != null ? Math.round(l.unit * 100) : null,
				totalAmount: Math.round(l.total * 100), sortOrder: i
			});
		});
		(spec.taxLines as { label: string; total: number }[]).forEach((l, i) => {
			if (l.label && l.total) items.push({
				id: crypto.randomUUID(), bookingId: spec.bookingId, type: 'tax',
				label: l.label, quantity: null, unitAmount: null,
				totalAmount: Math.round(l.total * 100), sortOrder: 100 + i
			});
		});
		if (items.length > 0) await db.insert(bookingLineItems).values(items);
	}

	return json({ ok: true });
};
