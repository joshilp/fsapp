/**
 * POST /api/booking/[id]/refund
 *
 * Body: { txnId: string, amountDollars?: string }
 *
 * Issues a credit (partial or full) against a previous Converge transaction.
 * On success, records a negative paymentEvent so the folio balance updates.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, paymentEvents } from '$lib/server/db/schema';
import { elavonRefund, type ElavonCreds } from '$lib/server/elavon';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (!body?.txnId) return json({ error: 'txnId is required' }, { status: 400 });

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true },
		with: {
			property: {
				columns: { elavonMerchantId: true, elavonUserId: true, elavonPin: true }
			}
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

	const result = await elavonRefund({
		creds,
		txnId:        String(body.txnId),
		amountDollars: body.amountDollars ? String(body.amountDollars) : undefined,
	});

	if (!result.ok) {
		return json({ error: result.errorMessage, code: result.errorCode }, { status: 402 });
	}

	// Record negative payment event
	const amountCents = body.amountDollars
		? -Math.round(parseFloat(body.amountDollars) * 100)
		: 0; // full-refund amount unknown until Converge responds; use 0 as sentinel

	await db.insert(paymentEvents).values({
		id:            nanoid(),
		bookingId:     params.id,
		type:          'refund',
		status:        'received',
		amount:        amountCents,
		paymentMethod: 'card',
		receiptNumber: `ELV-REF-${result.approvalCode}`,
		notes:         `Elavon refund | txn ${result.txnId}`,
		chargedAt:     new Date(),
	});

	return json({ ok: true, txnId: result.txnId, approvalCode: result.approvalCode });
};
