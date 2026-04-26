import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { rooms, rateTiers, rateSeasons } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const properties = await db.query.properties.findMany({
		columns: {
			id: true, name: true, address: true, city: true, province: true,
			phone: true, checkinTime: true, checkoutTime: true,
			cancellationPolicy: true, earlyDeparturePolicy: true, smokingFee: true
		}
	});

	// Room types with lowest-available rate for "from $X/night" display
	const roomTypes = await db.query.roomTypes.findMany({
		with: {
			rateTiers: {
				with: { season: { columns: { name: true, colour: true } } },
				columns: { nightlyRate: true }
			}
		},
		columns: { id: true, propertyId: true, name: true, category: true, sortOrder: true },
		orderBy: (rt, { asc }) => [asc(rt.sortOrder)]
	});

	// Bed summary per room type (take the first active room of each type as representative)
	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		with: { roomType: { columns: { id: true } } },
		columns: { roomTypeId: true, numRooms: true, hasKitchen: true, kingBeds: true, queenBeds: true, doubleBeds: true, hasHideabed: true }
	});

	// Build representative bed info per room type
	const bedsByType = new Map<string, { numRooms: number; hasKitchen: boolean; kingBeds: number; queenBeds: number; doubleBeds: number; hasHideabed: boolean }>();
	for (const r of allRooms) {
		if (r.roomTypeId && !bedsByType.has(r.roomTypeId)) {
			bedsByType.set(r.roomTypeId, {
				numRooms: r.numRooms,
				hasKitchen: r.hasKitchen,
				kingBeds: r.kingBeds ?? 0,
				queenBeds: r.queenBeds,
				doubleBeds: r.doubleBeds,
				hasHideabed: r.hasHideabed
			});
		}
	}

	// Deduplicate room types across properties for display (show unique categories)
	const seen = new Set<string>();
	const displayTypes = roomTypes
		.filter(rt => {
			if (seen.has(rt.category)) return false;
			seen.add(rt.category);
			return true;
		})
		.map(rt => {
			const minRate = rt.rateTiers.length > 0 ? Math.min(...rt.rateTiers.map(t => t.nightlyRate)) : null;
			const beds = bedsByType.get(rt.id) ?? null;
			return { id: rt.id, name: rt.name, category: rt.category, minRateCents: minRate, beds };
		});

	return { properties, displayTypes };
};
