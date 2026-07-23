/**
 * POST /api/booking/[id]/charge
 *
 * Body: { token: string, amountDollars: string, type: 'deposit' | 'final_charge' }
 *
 * Fetches the property's Elavon credentials, runs a ccSale via Converge,
 * and (on success) records a paymentEvent row for the booking.
 *
 * The `token` is the one-time ssl_token produced by Checkout.js running in
 * the browser – the raw card number never touches our server.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, paymentEvents, properties } from '$lib/server/db/schema';
import { elavonSale, type ElavonCreds } from '$lib/server/elavon';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body?.token || !body?.amountDollars) {
		return json({ error: 'token and amountDollars are required' }, { status: 400 });
	}

	const type: string = body.type ?? 'final_charge';
	const amountDollars: string = String(body.amountDollars);
	const token: string = String(body.token);

	// Load booking + property credentials
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true, propertyId: true, guestId: true },
		with: {
			property: {
				columns: { elavonMerchantId: true, elavonUserId: true, elavonPin: true }
			},
			guest: { columns: { name: true } }
		}
	});

	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });

	const prop = (booking as any).property;
	if (!prop?.elavonMerchantId || !prop?.elavonUserId || !prop?.elavonPin) {
		return json({ error: 'Elavon credentials not configured for this property' }, { status: 422 });
	}

	const creds: ElavonCreds = {
		merchantId: prop.elavonMerchantId,
		userId:     prop.elavonUserId,
		pin:        prop.elavonPin,
		demo:       process.env.ELAVON_DEMO === 'true',
	};

	const guest = (booking as any).guest;
	const guestName = guest?.name?.trim() || undefined;

	const result = await elavonSale({
		creds,
		token,
		amountDollars,
		guestName,
		bookingRef: params.id.slice(0, 12),
	});

	if (!result.ok) {
		return json({ error: result.errorMessage, code: result.errorCode }, { status: 402 });
	}

	// Record the payment event
	const amountCents = Math.round(parseFloat(amountDollars) * 100);
	const receipt = `ELV-${result.approvalCode}`;

	await db.insert(paymentEvents).values({
		id:            nanoid(),
		bookingId:     params.id,
		type,
		status:        'received',
		amount:        amountCents,
		paymentMethod: 'card',
		receiptNumber: receipt,
		notes:         `Elavon: ${result.cardType} ••••${result.last4} | txn ${result.txnId}`,
		chargedAt:     new Date(),
	});

	return json({
		ok:          true,
		txnId:       result.txnId,
		approvalCode:result.approvalCode,
		last4:       result.last4,
		cardType:    result.cardType,
		receiptNumber: receipt,
		amountCents,
	});
};
