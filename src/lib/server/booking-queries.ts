import { and, eq, gt, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import { db } from './db/index';
import { bookings, ccStaging, properties, rooms } from './db/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingSummary = {
	id: string;
	guestName: string | null;
	clerkLabel: string | null;
	channelName: string | null;
	status: string;
	checkInDate: string;
	checkOutDate: string;
	numAdults: number;
	numChildren: number;
	notes: string | null;
	ccLastFour: string | null; // non-null means a card is staged for this booking
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
	roomTypeCategory: string | null;
	roomTypeName: string | null;
	kingBeds: number;
	queenBeds: number;
	doubleBeds: number;
	hasHideabed: boolean;
	hasKitchen: boolean;
	housekeepingStatus: string;
	configs: string[] | null; // parsed from JSON, null = single fixed config
	spans: DaySpan[];
};

export type GridData = {
	propertyId: string;
	propertyName: string;
	year: number;
	month: number;
	daysInMonth: number;
	rooms: GridRoom[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
	return new Date(year, month, 0).getDate(); // month is 1-indexed
}

function isoDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Grid query ───────────────────────────────────────────────────────────────

export async function getGridData(
	propertyId: string,
	year: number,
	month: number
): Promise<GridData> {
	const days = daysInMonth(year, month);
	const monthStart = isoDate(year, month, 1);
	const monthEnd = isoDate(year, month, days);

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

	// All bookings overlapping this month (not cancelled)
	const monthBookings = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propertyId),
			lte(bookings.checkInDate, monthEnd),
			gt(bookings.checkOutDate, monthStart),
			ne(bookings.status, 'cancelled')
		),
		with: {
			guest: { columns: { name: true } },
			channel: { columns: { name: true } },
			clerk: { columns: { name: true } }
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
			notes: true
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

	// Group by room
	const byRoom = new Map<string, typeof monthBookings>();
	for (const b of monthBookings) {
		if (!b.roomId) continue;
		if (!byRoom.has(b.roomId)) byRoom.set(b.roomId, []);
		byRoom.get(b.roomId)!.push(b);
	}

	// Compute spans for each room
	const gridRooms: GridRoom[] = propertyRooms.map((room) => {
		const roomBookings = (byRoom.get(room.id) ?? []).sort((a, b) =>
			a.checkInDate.localeCompare(b.checkInDate)
		);

		// Build day → booking index for O(1) lookup
		const dayMap = new Map<number, (typeof monthBookings)[0]>();
		for (const b of roomBookings) {
			const startDay = b.checkInDate < monthStart ? 1 : Number(b.checkInDate.slice(8));
			// check-out day itself is free; guest occupies up to (checkOut - 1)
			const rawEndDay =
				b.checkOutDate > monthEnd ? days : Number(b.checkOutDate.slice(8)) - 1;
			for (let d = startDay; d <= rawEndDay; d++) {
				dayMap.set(d, b);
			}
		}

		const spans: DaySpan[] = [];
		let day = 1;
		while (day <= days) {
			const b = dayMap.get(day);
			if (!b) {
				spans.push({ type: 'free', day });
				day++;
				continue;
			}

			const overflowStart = b.checkInDate < monthStart;
			const overflowEnd = b.checkOutDate > monthEnd;
			const spanStart = overflowStart ? 1 : Number(b.checkInDate.slice(8));

			if (day !== spanStart) {
				// Mid-booking cell already covered — this shouldn't normally occur
				// because we advance `day` by span length below
				spans.push({ type: 'free', day });
				day++;
				continue;
			}

			const spanEndDay = overflowEnd ? days : Number(b.checkOutDate.slice(8)) - 1;
			const length = spanEndDay - spanStart + 1;

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
					status: b.status,
					checkInDate: b.checkInDate,
					checkOutDate: b.checkOutDate,
					numAdults: b.numAdults,
					numChildren: b.numChildren,
					notes: b.notes,
					ccLastFour: ccByBooking.get(b.id) ?? null
				}
			});
			day += length;
		}

		return {
			id: room.id,
			roomNumber: room.roomNumber,
			roomTypeCategory: room.roomType?.category ?? null,
			roomTypeName: room.roomType?.name ?? null,
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
		year,
		month,
		daysInMonth: days,
		rooms: gridRooms
	};
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
};

export async function getTodayData(today: string): Promise<{
	arrivals: TodayBooking[];
	departures: TodayBooking[];
	inHouse: TodayBooking[];
}> {
	const rows = await db.query.bookings.findMany({
		where: and(
			or(
				// Arriving today (confirmed or already checked in today)
				eq(bookings.checkInDate, today),
				// Departing today
				eq(bookings.checkOutDate, today),
				// Currently in house
				and(lt(bookings.checkInDate, today), gt(bookings.checkOutDate, today))
			),
			ne(bookings.status, 'cancelled')
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
			}
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
	});

	const toTodayBooking = (r: (typeof rows)[0]): TodayBooking => ({
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
		notes: r.notes
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
			.map(toTodayBooking)
	};
}
