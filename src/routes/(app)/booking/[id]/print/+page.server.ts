import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: true,
			room: {
				with: {
					roomType: { columns: { name: true, category: true } },
					property: true
				}
			},
			lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] },
			paymentEvents: { orderBy: (pe, { asc }) => [asc(pe.chargedAt)] },
			channel: { columns: { name: true } },
			clerk: { columns: { name: true } }
		}
	});

	if (!booking) redirect(303, '/booking');

	return { booking };
};
