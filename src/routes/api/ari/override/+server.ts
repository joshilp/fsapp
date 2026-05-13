import { json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rateOverrides } from '$lib/server/db/schema';
import { syncARIForDate } from '$lib/server/ari-sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { roomTypeId, date, rateCents, minNights, stopSell, closedToArrival, closedToDeparture } = body as {
		roomTypeId: string;
		date: string;
		rateCents?: number | null;
		minNights?: number | null;
		stopSell?: boolean;
		closedToArrival?: boolean;
		closedToDeparture?: boolean;
	};

	if (!roomTypeId || !date) return json({ error: 'Missing roomTypeId or date' }, { status: 400 });

	await db.delete(rateOverrides).where(
		and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
	);

	const hasContent = rateCents != null || minNights != null || stopSell || closedToArrival || closedToDeparture;
	if (hasContent) {
		await db.insert(rateOverrides).values({
			id: crypto.randomUUID(),
			roomTypeId,
			date,
			rateCents: rateCents ?? null,
			minNights: minNights ?? null,
			stopSell: stopSell ?? false,
			closedToArrival: closedToArrival ?? false,
			closedToDeparture: closedToDeparture ?? false,
			updatedAt: new Date()
		});
	}

	void syncARIForDate(roomTypeId, date).catch((e) => console.error('[ari-sync] override POST:', e));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { roomTypeId, date } = await request.json() as { roomTypeId: string; date: string };
	if (!roomTypeId || !date) return json({ error: 'Missing params' }, { status: 400 });

	await db.delete(rateOverrides).where(
		and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
	);

	void syncARIForDate(roomTypeId, date).catch((e) => console.error('[ari-sync] override DELETE:', e));
	return json({ ok: true });
};
