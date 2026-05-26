/**
 * POST /api/cron/pre-arrival
 *
 * Finds all bookings checking in tomorrow that:
 *   - have a guest email on file
 *   - have a selfCheckinToken generated
 *   - have NOT yet had a pre-arrival email sent (preArrivalSentAt IS NULL)
 *   - are not cancelled
 *
 * For each, sends a pre-arrival email with the self check-in link, then
 * stamps preArrivalSentAt so it never double-fires.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 * CRON_SECRET must be set in .env — if blank the endpoint is disabled.
 *
 * Suggested schedule: once daily at 08:00 local time.
 * See README.md → Cron Jobs for setup instructions.
 */
import { json } from '@sveltejs/kit';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';
import { sendPreArrival } from '$lib/server/email';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, url }) => {
	// ── Auth ─────────────────────────────────────────────────────────────────
	const secret = env.CRON_SECRET;
	if (!secret) {
		return json({ error: 'CRON_SECRET not configured' }, { status: 503 });
	}
	const authHeader = request.headers.get('authorization') ?? '';
	if (authHeader !== `Bearer ${secret}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// ── Target date ───────────────────────────────────────────────────────────
	// Default: tomorrow. Pass ?date=YYYY-MM-DD to override (useful for testing).
	const override = url.searchParams.get('date');
	const target = override ?? getTomorrow();

	// ── Query ─────────────────────────────────────────────────────────────────
	const candidates = await db.query.bookings.findMany({
		where: and(
			eq(bookings.checkInDate, target),
			isNotNull(bookings.selfCheckinToken),
			isNull(bookings.preArrivalSentAt)
		),
		columns: {
			id: true,
			checkInDate: true,
			checkOutDate: true,
			selfCheckinToken: true,
		},
		with: {
			guest: { columns: { name: true, email: true } },
			property: {
				columns: {
					name: true,
					phone: true,
					address: true,
					city: true,
					checkinTime: true,
				}
			}
		}
	});

	const origin = env.ORIGIN || `${new URL(request.url).origin}`;
	let sent = 0;
	const errors: string[] = [];

	for (const booking of candidates) {
		const guest = (booking as any).guest;
		const prop  = (booking as any).property;

		if (!guest?.email) continue; // no email — skip silently
		if (!booking.selfCheckinToken) continue;

		const nights = Math.round(
			(new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86400000
		);
		const address = prop?.city
			? `${prop.address ?? ''}, ${prop.city}`.trim().replace(/^,\s*/, '')
			: (prop?.address ?? null);

		try {
			await sendPreArrival({
				guestName:       guest.name ?? 'Guest',
				guestEmail:      guest.email,
				propertyName:    prop?.name ?? 'Hotel',
				propertyPhone:   prop?.phone ?? null,
				propertyAddress: address,
				checkInDate:     booking.checkInDate,
				checkOutDate:    booking.checkOutDate,
				nights,
				checkinTime:     prop?.checkinTime ?? '2:00 PM',
				selfCheckinUrl:  `${origin}/checkin/${booking.selfCheckinToken}`,
			});

			// Stamp sent timestamp — prevents double-fire even if cron runs twice
			await db.update(bookings)
				.set({ preArrivalSentAt: new Date() })
				.where(eq(bookings.id, booking.id));

			sent++;
		} catch (err) {
			errors.push(`${booking.id}: ${(err as Error).message}`);
		}
	}

	return json({
		ok: true,
		date: target,
		candidates: candidates.length,
		sent,
		errors: errors.length ? errors : undefined,
	});
};

function getTomorrow(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return d.toISOString().slice(0, 10);
}
