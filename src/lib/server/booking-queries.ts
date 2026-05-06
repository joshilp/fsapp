import { and, eq, gt, gte, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from './db/index';
import { bookingLineItems, bookings, ccStaging, paymentEvents, properties, rateSeasons, rooms } from './db/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingSummary = {
	id: string;
	guestName: string | null;
	clerkLabel: string | null;
	channelName: string | null;
	otaConfirmationNumber: string | null;
	status: string;
	checkInDate: string;
	checkOutDate: string;
	numAdults: number;
	numChildren: number;
	notes: string | null;
	ccLastFour: string | null; // non-null means a card is staged for this booking
	// Room-move chain (null when booking was not part of a move)
	movedFromBookingId: string | null;
	movedToBookingId: string | null;
	// Payment status derived from paymentEvents vs line item charges
	paymentStatus: 'unpaid' | 'partial' | 'paid' | null;
	lastPaymentMethod: string | null; // most recent non-refund method
	// Guest identity + rating for quick display in dialog
	guestId: string | null;
	guestRating: number | null;
	// Group membership (null for standalone bookings)
	groupId: string | null;
	groupName: string | null;
};

export type FreeSpan = { type: 'free'; day: number };
export type BookingSpan = {
	type: 'booking';
	day: number;
	length: number;
	overflowStart: boolean; // booking started before this month
	overflowEnd: boolean; // booking continues past this month
	booking: BookingSummary;
};
export type DaySpan = FreeSpan | BookingSpan;

export type GridRoom = {
	id: string;
	roomNumber: string;
	roomTypeId: string | null;
	roomTypeCategory: string | null;
	roomTypeName: string | null;
	numRooms: number; // bedrooms — 1BR, 2BR, etc.
	kingBeds: number;
	queenBeds: number;
	doubleBeds: number;
	hasHideabed: boolean;
	hasKitchen: boolean;
	housekeepingStatus: string;
	configs: string[] | null; // parsed from JSON, null = single fixed config
	spans: DaySpan[];
};

// Per-day pricing info for empty cell display
export type DayRate = {
	colour: string;
	minNights: number;
	rateByTypeId: Record<string, number>; // roomTypeId → nightly rate cents
};

export type GridData = {
	propertyId: string;
	propertyName: string;
	/** ISO date (YYYY-MM-DD) of the first column (day 1) */
	startDate: string;
	/** Total columns shown */
	numDays: number;
	rooms: GridRoom[];
	/** index 1..numDays — null means no season covers that day */
	dayRates: Array<DayRate | null>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoAddDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

// ─── Grid query ───────────────────────────────────────────────────────────────

export async function getGridData(
	propertyId: string,
	startDate: string, // YYYY-MM-DD — first column
	numDays = 35       // default 5-week window
): Promise<GridData> {
	const windowStart = startDate;
	const windowEnd = isoAddDays(startDate, numDays - 1); // last day inclusive

	const startMs = new Date(startDate + 'T12:00:00').getTime();

	/** Convert an ISO date to a 1-indexed day number within the window */
	function dateToDay(iso: string): number {
		return Math.round((new Date(iso + 'T12:00:00').getTime() - startMs) / 86400000) + 1;
	}

	// Rooms — sorted numerically by room number
	const propertyRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)),
		with: { roomType: true },
		orderBy: sql`CAST(${rooms.roomNumber} AS INTEGER) ASC`
	});

	// Property name
	const prop = await db.query.properties.findFirst({
		where: eq(properties.id, propertyId),
		columns: { name: true }
	});

	// All bookings overlapping this window (not cancelled)
	const monthBookings = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propertyId),
			lte(bookings.checkInDate, windowEnd),
			gt(bookings.checkOutDate, windowStart),
			ne(bookings.status, 'cancelled')
		),
		with: {
			guest: { columns: { name: true, rating: true } },
			channel: { columns: { name: true } },
			clerk: { columns: { name: true } },
			group: { columns: { id: true, name: true } }
		},
			columns: {
				id: true,
				roomId: true,
				status: true,
				checkInDate: true,
				checkOutDate: true,
				clerkName: true,
				numAdults: true,
				numChildren: true,
				notes: true,
				otaConfirmationNumber: true,
				movedFromBookingId: true,
				movedToBookingId: true,
				guestId: true,
				groupId: true
			}
	});

	// CC staging — fetch lastFour for all bookings in this batch
	const bookingIds = monthBookings.map((b) => b.id);
	const ccRows =
		bookingIds.length > 0
			? await db.query.ccStaging.findMany({
					where: inArray(ccStaging.bookingId, bookingIds),
					columns: { bookingId: true, lastFour: true }
				})
			: [];
	const ccByBooking = new Map(ccRows.map((r) => [r.bookingId, r.lastFour]));

	// Payment status — batch fetch charges and payments for all bookings
	const [chargeRows, paymentRows] =
		bookingIds.length > 0
			? await Promise.all([
					db.query.bookingLineItems.findMany({
						where: and(
							inArray(bookingLineItems.bookingId, bookingIds),
							ne(bookingLineItems.type, 'deposit')
						),
						columns: { bookingId: true, type: true, totalAmount: true }
					}),
					db.query.paymentEvents.findMany({
						where: inArray(paymentEvents.bookingId, bookingIds),
						columns: { bookingId: true, type: true, amount: true, paymentMethod: true, chargedAt: true }
					})
				])
			: [[], []];

	// Total charges per booking (rate + extra + tax; excludes deposit line items)
	const chargesByBooking = new Map<string, number>();
	for (const li of chargeRows) {
		chargesByBooking.set(li.bookingId, (chargesByBooking.get(li.bookingId) ?? 0) + li.totalAmount);
	}
	// Net payments per booking (deposits + final charges − refunds), and last method
	const paidByBooking = new Map<string, number>();
	const lastMethodByBooking = new Map<string, string>();
	// Sort by chargedAt so last entry wins for method
	const sortedPayments = [...paymentRows].sort(
		(a, b) => ((a.chargedAt?.getTime() ?? 0) - (b.chargedAt?.getTime() ?? 0))
	);
	for (const pe of sortedPayments) {
		const delta = pe.type === 'refund' ? -pe.amount : pe.amount;
		paidByBooking.set(pe.bookingId, (paidByBooking.get(pe.bookingId) ?? 0) + delta);
		if (pe.type !== 'refund') lastMethodByBooking.set(pe.bookingId, pe.paymentMethod);
	}

	function getPaymentStatus(bookingId: string): 'unpaid' | 'partial' | 'paid' | null {
		const charged = chargesByBooking.get(bookingId) ?? 0;
		if (charged === 0) return null; // no charges recorded yet
		const paid = paidByBooking.get(bookingId) ?? 0;
		if (paid <= 0) return 'unpaid';
		if (paid >= charged) return 'paid';
		return 'partial';
	}

	// Rate seasons overlapping this window (for grid cell pricing colours)
	const monthSeasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, propertyId),
			lte(rateSeasons.startDate, windowEnd),
			gte(rateSeasons.endDate, windowStart)
		),
		with: { tiers: true },
		orderBy: (s, { asc }) => [asc(s.startDate)]
	});

	// Build day → DayRate lookup (1-indexed, later seasons overwrite earlier)
	const dayRatesArr: Array<DayRate | null> = new Array(numDays + 1).fill(null);
	for (const season of monthSeasons) {
		const startDay = Math.max(1, dateToDay(season.startDate));
		const endDay = Math.min(numDays, dateToDay(season.endDate));
		const rateByTypeId: Record<string, number> = {};
		for (const tier of season.tiers) {
			rateByTypeId[tier.roomTypeId] = tier.nightlyRate;
		}
		for (let d = startDay; d <= endDay; d++) {
			dayRatesArr[d] = { colour: season.colour, minNights: season.minNights, rateByTypeId };
		}
	}

	// Group bookings by room
	const byRoom = new Map<string, typeof monthBookings>();
	for (const b of monthBookings) {
		if (!b.roomId) continue;
		if (!byRoom.has(b.roomId)) byRoom.set(b.roomId, []);
		byRoom.get(b.roomId)!.push(b);
	}

	// Compute spans for each room (day numbers are 1-indexed from windowStart)
	const gridRooms: GridRoom[] = propertyRooms.map((room) => {
		const roomBookings = (byRoom.get(room.id) ?? []).sort((a, b) =>
			a.checkInDate.localeCompare(b.checkInDate)
		);

		// Build day → booking for O(1) lookup
		const dayMap = new Map<number, (typeof monthBookings)[0]>();
		for (const b of roomBookings) {
			const spanStart = Math.max(1, dateToDay(b.checkInDate));
			// check-out day itself is free; last occupied day = checkOut - 1
			const spanEnd = Math.min(numDays, dateToDay(b.checkOutDate) - 1);
			if (spanEnd < spanStart) continue;
			for (let d = spanStart; d <= spanEnd; d++) dayMap.set(d, b);
		}

		const spans: DaySpan[] = [];
		let day = 1;
		while (day <= numDays) {
			const b = dayMap.get(day);
			if (!b) {
				spans.push({ type: 'free', day });
				day++;
				continue;
			}

			const ciDay = dateToDay(b.checkInDate);
			const overflowStart = ciDay < 1;
			const coDay = dateToDay(b.checkOutDate) - 1; // last occupied day
			const overflowEnd = coDay > numDays;
			const spanStart = overflowStart ? 1 : ciDay;
			const spanEnd = overflowEnd ? numDays : coDay;
			const length = spanEnd - spanStart + 1;

			spans.push({
				type: 'booking',
				day: spanStart,
				length,
				overflowStart,
				overflowEnd,
				booking: {
					id: b.id,
					guestName: b.guest?.name ?? null,
					clerkLabel: b.clerkName ?? b.clerk?.name ?? null,
					channelName: b.channel?.name ?? null,
					otaConfirmationNumber: b.otaConfirmationNumber ?? null,
					status: b.status,
					checkInDate: b.checkInDate,
					checkOutDate: b.checkOutDate,
					numAdults: b.numAdults,
					numChildren: b.numChildren,
					notes: b.notes,
					ccLastFour: ccByBooking.get(b.id) ?? null,
					movedFromBookingId: b.movedFromBookingId ?? null,
					movedToBookingId: b.movedToBookingId ?? null,
				paymentStatus: getPaymentStatus(b.id),
				lastPaymentMethod: lastMethodByBooking.get(b.id) ?? null,
				guestId: b.guestId ?? null,
				guestRating: b.guest?.rating ?? null,
				groupId: b.groupId ?? null,
				groupName: b.group?.name ?? null
				}
			});
			day += length;
		}

		return {
			id: room.id,
			roomNumber: room.roomNumber,
			roomTypeId: room.roomTypeId ?? null,
			roomTypeCategory: room.roomType?.category ?? null,
			roomTypeName: room.roomType?.name ?? null,
			numRooms: room.numRooms,
			kingBeds: room.kingBeds,
			queenBeds: room.queenBeds,
			doubleBeds: room.doubleBeds,
			hasHideabed: room.hasHideabed,
			hasKitchen: room.hasKitchen,
			housekeepingStatus: room.housekeepingStatus,
			configs: room.configs ? (JSON.parse(room.configs) as string[]) : null,
			spans
		};
	});

	return {
		propertyId,
		propertyName: prop?.name ?? propertyId,
		startDate,
		numDays,
		rooms: gridRooms,
		dayRates: dayRatesArr
	};
}

// ─── Unassigned bookings (no room yet — online/public bookings) ───────────────

export type UnassignedBooking = {
	id: string;
	propertyId: string;
	propertyName: string;
	requestedTypeName: string | null;
	requestedTypeCategory: string | null;
	guestName: string | null;
	guestEmail: string | null;
	channelName: string | null;
	checkInDate: string;
	checkOutDate: string;
	numAdults: number;
	numChildren: number;
	notes: string | null;
	publicToken: string | null;
	quotedTotalCents: number | null; // rate line total saved at booking time
};

export async function getUnassignedBookings(propertyId: string): Promise<UnassignedBooking[]> {
	const rows = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propertyId),
			sql`${bookings.roomId} IS NULL`,
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'checked_out')
		),
		with: {
			guest: { columns: { name: true, email: true } },
			channel: { columns: { name: true } },
			requestedRoomType: { columns: { name: true, category: true } },
			property: { columns: { name: true } },
			lineItems: { columns: { type: true, totalAmount: true } }
		},
		columns: {
			id: true, propertyId: true, status: true,
			checkInDate: true, checkOutDate: true,
			numAdults: true, numChildren: true, notes: true, publicToken: true
		},
		orderBy: (b, { asc }) => [asc(b.checkInDate)]
	});

	return rows.map(r => {
		const quotedTotal = r.lineItems
			.filter(li => li.type === 'rate')
			.reduce((sum, li) => sum + li.totalAmount, 0);
		return {
			id: r.id,
			propertyId: r.propertyId,
			propertyName: r.property?.name ?? r.propertyId,
			requestedTypeName: r.requestedRoomType?.name ?? null,
			requestedTypeCategory: r.requestedRoomType?.category ?? null,
			guestName: r.guest?.name ?? null,
			guestEmail: r.guest?.email ?? null,
			channelName: r.channel?.name ?? null,
			checkInDate: r.checkInDate,
			checkOutDate: r.checkOutDate,
			numAdults: r.numAdults,
			numChildren: r.numChildren,
			notes: r.notes,
			publicToken: r.publicToken,
			quotedTotalCents: quotedTotal > 0 ? quotedTotal : null
		};
	});
}

// ─── Today data ───────────────────────────────────────────────────────────────

export type TodayBooking = {
	id: string;
	propertyId: string;
	propertyName: string;
	roomNumber: string;
	roomTypeCategory: string | null;
	guestName: string | null;
	channelName: string | null;
	status: string;
	checkInDate: string;
	checkOutDate: string;
	numAdults: number;
	numChildren: number;
	notes: string | null;
	/** 'paid' | 'partial' | 'unpaid' — derived from paymentEvents vs lineItems */
	paymentStatus: 'paid' | 'partial' | 'unpaid';
};

export async function getTodayData(today: string): Promise<{
	arrivals: TodayBooking[];
	departures: TodayBooking[];
	inHouse: TodayBooking[];
	unassigned: UnassignedBooking[];
}> {
	const [rows, unassignedRows] = await Promise.all([
		db.query.bookings.findMany({
			where: and(
				or(
					// Arriving today (confirmed or already checked in today)
					eq(bookings.checkInDate, today),
					// Departing today
					eq(bookings.checkOutDate, today),
					// Currently in house
					and(lt(bookings.checkInDate, today), gt(bookings.checkOutDate, today))
				),
				ne(bookings.status, 'cancelled'),
				// Only assigned bookings here — unassigned are separate
				sql`${bookings.roomId} IS NOT NULL`
			),
			with: {
				guest: { columns: { name: true } },
				channel: { columns: { name: true } },
				room: {
					columns: { roomNumber: true },
					with: {
						roomType: { columns: { category: true } },
						property: { columns: { id: true, name: true } }
					}
				},
				paymentEvents: { columns: { type: true, amount: true } },
				lineItems: { columns: { type: true, totalAmount: true } }
			},
			columns: {
				id: true,
				propertyId: true,
				status: true,
				checkInDate: true,
				checkOutDate: true,
				numAdults: true,
				numChildren: true,
				notes: true
			},
			orderBy: (b, { asc }) => [asc(b.checkInDate)]
		}),
		// Unassigned bookings arriving today or overdue (all properties)
		db.query.bookings.findMany({
			where: and(
				sql`${bookings.roomId} IS NULL`,
				ne(bookings.status, 'cancelled'),
				ne(bookings.status, 'checked_out'),
				lte(bookings.checkInDate, today)
			),
			with: {
				guest: { columns: { name: true, email: true } },
				channel: { columns: { name: true } },
				requestedRoomType: { columns: { name: true, category: true } },
				property: { columns: { name: true } },
				lineItems: { columns: { type: true, totalAmount: true } }
			},
			columns: {
				id: true, propertyId: true, status: true,
				checkInDate: true, checkOutDate: true,
				numAdults: true, numChildren: true, notes: true, publicToken: true
			},
			orderBy: (b, { asc }) => [asc(b.checkInDate)]
		})
	]);

	const toTodayBooking = (r: (typeof rows)[0]): TodayBooking => {
		const netPaid = (r.paymentEvents ?? []).reduce(
			(s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0
		);
		const totalCharged = (r.lineItems ?? [])
			.filter(li => li.type === 'rate' || li.type === 'extra' || li.type === 'tax')
			.reduce((s, li) => s + li.totalAmount, 0);
		const paymentStatus: TodayBooking['paymentStatus'] =
			netPaid >= totalCharged && totalCharged > 0 ? 'paid'
			: netPaid > 0 ? 'partial'
			: 'unpaid';
		return {
			id: r.id,
			propertyId: r.propertyId,
			propertyName: r.room?.property?.name ?? r.propertyId,
			roomNumber: r.room?.roomNumber ?? '?',
			roomTypeCategory: r.room?.roomType?.category ?? null,
			guestName: r.guest?.name ?? null,
			channelName: r.channel?.name ?? null,
			status: r.status,
			checkInDate: r.checkInDate,
			checkOutDate: r.checkOutDate,
			numAdults: r.numAdults,
			numChildren: r.numChildren,
			notes: r.notes,
			paymentStatus
		};
	};

	const unassigned: UnassignedBooking[] = unassignedRows.map(r => {
		const quotedTotal = r.lineItems
			.filter(li => li.type === 'rate')
			.reduce((sum, li) => sum + li.totalAmount, 0);
		return {
			id: r.id,
			propertyId: r.propertyId,
			propertyName: r.property?.name ?? r.propertyId,
			requestedTypeName: r.requestedRoomType?.name ?? null,
			requestedTypeCategory: r.requestedRoomType?.category ?? null,
			guestName: r.guest?.name ?? null,
			guestEmail: r.guest?.email ?? null,
			channelName: r.channel?.name ?? null,
			checkInDate: r.checkInDate,
			checkOutDate: r.checkOutDate,
			numAdults: r.numAdults,
			numChildren: r.numChildren,
			notes: r.notes,
			publicToken: r.publicToken,
			quotedTotalCents: quotedTotal > 0 ? quotedTotal : null
		};
	});

	return {
		arrivals: rows
			.filter((r) => r.checkInDate === today && r.status === 'confirmed')
			.map(toTodayBooking),
		departures: rows
			.filter((r) => r.checkOutDate === today && r.status === 'checked_in')
			.map(toTodayBooking),
		inHouse: rows
			.filter((r) => r.checkInDate < today && r.checkOutDate > today && r.status === 'checked_in')
			.map(toTodayBooking),
		unassigned
	};
}
