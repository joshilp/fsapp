import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { losDiscounts, properties } from '$lib/server/db/schema';
// Re-use the shared book action logic
import { bookAction } from '$lib/server/public-book';

export const load: PageServerLoad = async ({ params, url }) => {
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

	// LOS discounts to show hints on the room selection step
	const losDiscountsList = await db.query.losDiscounts.findMany({
		where: eq(losDiscounts.propertyId, property.id),
		columns: { minNights: true, discountPercent: true, label: true },
		orderBy: (d, { asc }) => [asc(d.minNights)]
	});

	// Pre-select a room type if passed in URL (?roomTypeId=xxx)
	const preselectedRoomTypeId = url.searchParams.get('roomTypeId') ?? null;

	return { property, today: new Date().toISOString().slice(0, 10), preselectedRoomTypeId, losDiscountsList };
};

export const actions: Actions = {
	book: ({ request }) => bookAction(request)
};
