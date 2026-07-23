/**
 * GET /api/booking/[id]/checkout-token
 *
 * Returns a short-lived Checkout.js session token so the browser can
 * initialise Elavon hosted fields without knowing the full API credentials.
 *
 * The token expires in ~30 minutes; request a fresh one each time the
 * payment panel is opened.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';
import { elavonGetCheckoutToken, type ElavonCreds } from '$lib/server/elavon';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

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
		return json({ error: 'Elavon not configured' }, { status: 422 });
	}

	const creds: ElavonCreds = {
		merchantId: prop.elavonMerchantId,
		userId:     prop.elavonUserId,
		pin:        prop.elavonPin,
		demo:       process.env.ELAVON_DEMO === 'true',
	};

	const result = await elavonGetCheckoutToken(creds);
	if (!result.ok) return json({ error: result.error }, { status: 502 });

	return json({ token: result.token });
};
