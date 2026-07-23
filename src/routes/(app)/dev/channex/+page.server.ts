import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getMockLog } from '$lib/server/channex-mock';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async () => {
	const properties = await db.query.properties.findMany({
		columns: { id: true, name: true, channexPropertyId: true }
	});

	const roomTypes = await db.query.roomTypes.findMany({
		columns: {
			id: true,
			name: true,
			propertyId: true,
			channexRoomTypeId: true,
			channexRatePlanId: true
		}
	});

	return {
		properties,
		roomTypes,
		isMockMode: (env.CHANNEX_MOCK ?? '') === 'true',
		log: getMockLog()
	};
};
