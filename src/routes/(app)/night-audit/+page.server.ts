import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne, gte } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	bookings,
	bookingLineItems,
	nightAuditRuns,
	properties,
	rooms,
	roomTypes,
	rateSeasons,
	rateTiers,
	rateOverrides
} from '$lib/server/db/schema';
import { resolveNightlyRate } from '$lib/server/rates';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const today = new Date().toISOString().slice(0, 10);
	const auditDate = url.searchParams.get('date') ?? today;

	const allProperties = await db.query.properties.findMany({
		columns: { id: true, name: true },
		orderBy: (p, { asc }) => [asc(p.name)]
	});
	const propId = url.searchParams.get('prop') ?? allProperties[0]?.id ?? '';

	// Bookings that are in-house (checked_in) on the audit date
	// i.e., checkIn <= auditDate < checkOut and status = checked_in
	const inHouseBookings = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propId),
			eq(bookings.status, 'checked_in'),
			lt(bookings.checkInDate, auditDate + '\uffff'),
			gt(bookings.checkOutDate, auditDate)
		),
		with: {
			guest: { columns: { name: true, email: true } },
			room: { columns: { roomNumber: true }, with: { roomType: { columns: { name: true } } } },
			lineItems: { columns: { id: true, type: true, label: true, totalAmount: true } }
		},
		columns: {
			id: true, checkInDate: true, checkOutDate: true,
			numAdults: true, numChildren: true, requestedRoomTypeId: true
		}
	});

	// Arrivals today
	const arrivals = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propId),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			eq(bookings.checkInDate, auditDate)
		),
		with: { guest: { columns: { name: true } }, room: { columns: { roomNumber: true } } },
		columns: { id: true, status: true, checkOutDate: true }
	});

	// Departures today
	const departures = await db.query.bookings.findMany({
		where: and(
			eq(bookings.propertyId, propId),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			eq(bookings.checkOutDate, auditDate)
		),
		with: { guest: { columns: { name: true } }, room: { columns: { roomNumber: true } } },
		columns: { id: true, status: true, checkInDate: true }
	});

	// Past audit runs for this property (last 14)
	const pastRuns = await db.query.nightAuditRuns.findMany({
		where: eq(nightAuditRuns.propertyId, propId),
		orderBy: (r, { desc }) => [desc(r.auditDate)],
		columns: { id: true, auditDate: true, notes: true, createdAt: true }
	});

	// Check if today's audit already ran
	const todayAudit = pastRuns.find((r) => r.auditDate === auditDate) ?? null;

	// Build rate data for in-house bookings (to compute tonight's charge)
	// For each in-house booking, compute the nightly rate for `auditDate`
	const inHouseWithRate = await Promise.all(
		inHouseBookings.map(async (b) => {
			const roomTypeId = b.room?.roomType
				? (await db.query.roomTypes.findFirst({
					where: and(eq(roomTypes.propertyId, propId)),
					columns: { id: true }
				}))?.id
				: null;

			// Find the room's room type more directly
			const roomTypeIdResolved = b.requestedRoomTypeId ?? null;

			let nightlyRateCents: number | null = null;
			if (roomTypeIdResolved) {
				// Check per-date override first
				const override = await db.query.rateOverrides.findFirst({
					where: and(eq(rateOverrides.roomTypeId, roomTypeIdResolved), eq(rateOverrides.date, auditDate)),
					columns: { rateCents: true }
				});
				if (override?.rateCents != null) {
					nightlyRateCents = override.rateCents;
				} else {
					// Find season tier
					const season = await db.query.rateSeasons.findFirst({
						where: and(
							eq(rateSeasons.propertyId, propId),
							lt(rateSeasons.startDate, auditDate + '\uffff'),
							gte(rateSeasons.endDate, auditDate)
						),
						columns: { id: true }
					});
					if (season) {
						const tier = await db.query.rateTiers.findFirst({
							where: and(eq(rateTiers.seasonId, season.id), eq(rateTiers.roomTypeId, roomTypeIdResolved)),
							columns: { nightlyRate: true, dowRates: true }
						});
						if (tier) {
							nightlyRateCents = resolveNightlyRate(tier.nightlyRate, tier.dowRates, auditDate);
						}
					}
				}
			}

			// Check if tonight's charge already posted
			const tonightLabel = `Night audit · ${auditDate}`;
			const alreadyPosted = b.lineItems.some((li) => li.label === tonightLabel);

			return {
				...b,
				nightlyRateCents,
				alreadyPosted
			};
		})
	);

	return {
		allProperties,
		propId,
		auditDate,
		inHouse: inHouseWithRate,
		arrivals,
		departures,
		todayAudit,
		pastRuns: pastRuns.slice(0, 14)
	};
};

export const actions: Actions = {
	runAudit: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const propId    = (fd.get('propId') as string)?.trim();
		const auditDate = (fd.get('auditDate') as string)?.trim();
		const notes     = ((fd.get('notes') as string) ?? '').trim() || null;
		if (!propId || !auditDate) return fail(400, { error: 'Missing fields' });

		// Prevent double-audit
		const existing = await db.query.nightAuditRuns.findFirst({
			where: and(eq(nightAuditRuns.propertyId, propId), eq(nightAuditRuns.auditDate, auditDate))
		});
		if (existing) return fail(400, { error: 'Audit already run for this date.' });

		// Get in-house bookings
		const inHouseBookings = await db.query.bookings.findMany({
			where: and(
				eq(bookings.propertyId, propId),
				eq(bookings.status, 'checked_in'),
				lt(bookings.checkInDate, auditDate + '\uffff'),
				gt(bookings.checkOutDate, auditDate)
			),
			with: {
				lineItems: { columns: { label: true } },
				room: { with: { roomType: { columns: { id: true } } } }
			},
			columns: { id: true, requestedRoomTypeId: true, numAdults: true, numChildren: true }
		});

		const tonightLabel = `Night audit · ${auditDate}`;

		// Post nightly room charges for each in-house booking
		for (const b of inHouseBookings) {
			if (b.lineItems.some((li) => li.label === tonightLabel)) continue; // already posted

			const roomTypeId = b.room?.roomType?.id ?? b.requestedRoomTypeId ?? null;
			let nightlyRateCents: number | null = null;

			if (roomTypeId) {
				const override = await db.query.rateOverrides.findFirst({
					where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, auditDate)),
					columns: { rateCents: true }
				});
				if (override?.rateCents != null) {
					nightlyRateCents = override.rateCents;
				} else {
					const season = await db.query.rateSeasons.findFirst({
						where: and(
							eq(rateSeasons.propertyId, propId),
							lt(rateSeasons.startDate, auditDate + '\uffff'),
							gte(rateSeasons.endDate, auditDate)
						),
						columns: { id: true }
					});
					if (season) {
						const tier = await db.query.rateTiers.findFirst({
							where: and(eq(rateTiers.seasonId, season.id), eq(rateTiers.roomTypeId, roomTypeId)),
							columns: { nightlyRate: true, dowRates: true }
						});
						if (tier) {
							nightlyRateCents = resolveNightlyRate(tier.nightlyRate, tier.dowRates, auditDate);
						}
					}
				}
			}

			if (nightlyRateCents != null && nightlyRateCents > 0) {
				// Find next sort order for this booking
				const maxSort = await db.query.bookingLineItems.findMany({
					where: eq(bookingLineItems.bookingId, b.id),
					columns: { sortOrder: true }
				});
				const nextSort = maxSort.length > 0 ? Math.max(...maxSort.map((li) => li.sortOrder)) + 1 : 10;

				await db.insert(bookingLineItems).values({
					id: crypto.randomUUID(),
					bookingId: b.id,
					type: 'rate',
					label: tonightLabel,
					quantity: 1,
					unitAmount: nightlyRateCents,
					totalAmount: nightlyRateCents,
					sortOrder: nextSort
				});
			}
		}

		// Record the audit run
		await db.insert(nightAuditRuns).values({
			id: crypto.randomUUID(),
			propertyId: propId,
			auditDate,
			ranBy: locals.user.id,
			notes
		});

		return { success: true, posted: inHouseBookings.length };
	}
};
