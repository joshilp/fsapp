import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { groups, bookings } from '$lib/server/db/schema';

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

/** PATCH /api/groups/[id] — update group meta only */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json();
	await db.update(groups).set({
		name:           body.name           ?? undefined,
		organizerName:  body.organizerName  ?? undefined,
		organizerPhone: body.organizerPhone ?? undefined,
		organizerEmail: body.organizerEmail ?? undefined,
		billingType:    body.billingType    ?? undefined,
		notes:          body.notes          ?? undefined
	}).where(eq(groups.id, params.id));
	return json({ ok: true });
};
