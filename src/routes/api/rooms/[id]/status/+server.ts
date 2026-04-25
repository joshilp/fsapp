import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rooms } from '$lib/server/db/schema';

const STATUSES = ['clean', 'dirty', 'in_progress', 'out_of_order'] as const;
type HkStatus = (typeof STATUSES)[number];

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const status: HkStatus = STATUSES.includes(body.status) ? body.status : 'clean';

	await db.update(rooms).set({ housekeepingStatus: status }).where(eq(rooms.id, params.id));

	return json({ status });
};
