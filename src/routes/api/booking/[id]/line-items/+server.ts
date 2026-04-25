import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { bookingLineItems, paymentEvents } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const [items, payments] = await Promise.all([
		db.query.bookingLineItems.findMany({
			where: eq(bookingLineItems.bookingId, params.id),
			orderBy: [asc(bookingLineItems.sortOrder), asc(bookingLineItems.createdAt)]
		}),
		db.query.paymentEvents.findMany({
			where: eq(paymentEvents.bookingId, params.id),
			orderBy: [asc(paymentEvents.chargedAt)]
		})
	]);

	return json({
		lineItems: items.map((li) => ({
			id: li.id,
			type: li.type,
			label: li.label,
			quantity: li.quantity,
			unitAmount: li.unitAmount,
			totalAmount: li.totalAmount
		})),
		payments: payments.map((pe) => ({
			id: pe.id,
			type: pe.type,
			amount: pe.amount,
			paymentMethod: pe.paymentMethod,
			chargedAt: pe.chargedAt ? new Date(pe.chargedAt).toISOString() : null
		}))
	});
};
