/**
 * POST /api/booking/[id]/void
 *
 * Body: { txnId: string }
 *
 * Voids a same-day, pre-settlement transaction.  If the day has settled, use
 * /refund instead.  On success, marks the paymentEvent as voided via a note.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, paymentEvents } from '$lib/server/db/schema';
import { elavonVoid, type ElavonCreds } from '$lib/server/elavon';
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

	const result = await elavonVoid({ creds, txnId: String(body.txnId) });

	if (!result.ok) {
		return json({ error: result.errorMessage, code: result.errorCode }, { status: 402 });
	}

	// Record a zero-amount void event for the audit trail
	await db.insert(paymentEvents).values({
		id:            nanoid(),
		bookingId:     params.id,
		type:          'refund',
		status:        'received',
		amount:        0,
		paymentMethod: 'card',
		receiptNumber: `ELV-VOID-${result.approvalCode}`,
		notes:         `Elavon void | txn ${result.txnId}`,
		chargedAt:     new Date(),
	});

	return json({ ok: true, txnId: result.txnId });
};
