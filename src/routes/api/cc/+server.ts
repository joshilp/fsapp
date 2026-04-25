import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { ccStaging } from '$lib/server/db/schema';
import { decryptCc } from '$lib/server/cc';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { bookingId } = await request.json().catch(() => ({}));
	if (!bookingId) return json({ error: 'bookingId required' }, { status: 400 });

	const row = await db.query.ccStaging.findFirst({ where: eq(ccStaging.bookingId, bookingId) });
	if (!row) return json({ error: 'No card on file' }, { status: 404 });

	const card = decryptCc(row.encryptedData);
	return json(card);
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { bookingId } = await request.json().catch(() => ({}));
	if (!bookingId) return json({ error: 'bookingId required' }, { status: 400 });

	await db.delete(ccStaging).where(eq(ccStaging.bookingId, bookingId));
	return json({ ok: true });
};
