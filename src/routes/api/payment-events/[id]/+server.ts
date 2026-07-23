import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { paymentEvents } from '$lib/server/db/schema';

/** DELETE /api/payment-events/[id] — hard-delete a payment record */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const pe = await db.query.paymentEvents.findFirst({
		where: eq(paymentEvents.id, params.id),
		columns: { id: true }
	});
	if (!pe) return json({ error: 'Not found' }, { status: 404 });

	await db.delete(paymentEvents).where(eq(paymentEvents.id, params.id));
	return json({ deleted: true });
};
