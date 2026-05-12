import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rooms, roomTypes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { bookAction } from '$lib/server/public-book';

export const load: PageServerLoad = async () => {
	const today = new Date().toISOString().slice(0, 10);

	const propertiesList = await db.query.properties.findMany({
		columns: { id: true, name: true, publicId: true, bookingEnabled: true, checkinTime: true, checkoutTime: true, cancellationPolicy: true },
		orderBy: (p, { asc }) => [asc(p.name)]
	});

	const roomTypesList = await db.query.roomTypes.findMany({
		columns: { id: true, propertyId: true, name: true, category: true, sortOrder: true },
		orderBy: (rt, { asc }) => [asc(rt.sortOrder)]
	});

	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		columns: { id: true, propertyId: true, roomTypeId: true, kingBeds: true, queenBeds: true, doubleBeds: true, hasKitchen: true, hasHideabed: true }
	});

	return { today, properties: propertiesList, roomTypes: roomTypesList, allRooms };
};

export const actions: Actions = {
	book: ({ request }) => bookAction(request)
};
