/**
 * POST /api/booking/[id]/save-cc
 * Captures card-on-file reference info (last four, type, expiry, name).
 * Stores a JSON blob in cc_staging.encryptedData — add real AES-256-GCM
 * encryption here once an encryption key is provisioned.
 *
 * DELETE /api/booking/[id]/save-cc
 * Removes the cc_staging record for this booking.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, ccStaging } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { cardType, lastFour, expiryMonth, expiryYear, cardholderName } = body;

	if (!lastFour || String(lastFour).length !== 4 || !/^\d{4}$/.test(String(lastFour))) {
		return json({ error: 'Last four digits are required (4 numeric digits)' }, { status: 400 });
	}

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true }
	});
	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });

	// Store reference info (non-sensitive) as a JSON string.
	// TODO: replace with AES-256-GCM using env.CC_ENCRYPTION_KEY
	const encryptedData = Buffer.from(JSON.stringify({
		cardholderName: cardholderName ?? '',
		expiryMonth: expiryMonth ?? '',
		expiryYear: expiryYear ?? ''
	})).toString('base64');

	// Build expiry date for the record
	const expYear = parseInt(expiryYear ?? new Date().getFullYear() + 3);
	const expMonth = parseInt(expiryMonth ?? 12);
	const expiresAt = new Date(expYear, expMonth - 1, 28, 23, 59, 59);

	// Upsert: delete existing then insert fresh
	await db.delete(ccStaging).where(eq(ccStaging.bookingId, params.id));
	await db.insert(ccStaging).values({
		id: crypto.randomUUID(),
		bookingId: params.id,
		encryptedData,
		lastFour: String(lastFour),
		cardType: cardType ?? null,
		isCharged: false,
		expiresAt
	});

	return json({ ok: true, lastFour: String(lastFour), cardType: cardType ?? null });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	await db.delete(ccStaging).where(eq(ccStaging.bookingId, params.id));
	return json({ ok: true });
};
