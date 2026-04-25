import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { bookingLineItems } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const items = await db.query.bookingLineItems.findMany({
		where: eq(bookingLineItems.bookingId, params.id),
		orderBy: [asc(bookingLineItems.sortOrder), asc(bookingLineItems.createdAt)]
	});

	return json(
		items.map((li) => ({
			id: li.id,
			type: li.type,
			label: li.label,
			quantity: li.quantity,
			unitAmount: li.unitAmount,
			totalAmount: li.totalAmount
		}))
	);
};
