import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { properties } from '$lib/server/db/schema';
// Re-use the shared book action logic
import { bookAction } from '$lib/server/public-book';

export const load: PageServerLoad = async ({ params }) => {
	const property = await db.query.properties.findFirst({
		where: eq(properties.publicId, params.publicId),
		columns: {
			id: true, name: true, publicId: true, bookingEnabled: true,
			logoUrl: true, heroImageUrl: true, accentColour: true, bookingDescription: true,
			checkinTime: true, checkoutTime: true, cancellationPolicy: true, phone: true,
			address: true, city: true, province: true
		}
	});

	if (!property) throw error(404, 'Property not found');
	if (!property.bookingEnabled) throw redirect(303, '/');

	return { property, today: new Date().toISOString().slice(0, 10) };
};

export const actions: Actions = {
	book: ({ request }) => bookAction(request)
};
