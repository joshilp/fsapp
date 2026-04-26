import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: LayoutServerLoad = async () => {
	const properties = await db.query.properties.findMany({
		columns: { id: true, name: true, address: true, city: true, province: true, phone: true, website: true, checkinTime: true, checkoutTime: true, cancellationPolicy: true, smokingFee: true }
	});
	return { properties };
};
