import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMockLog, clearMockLog } from '$lib/server/channex-mock';

/** GET /api/dev/channex-log — return recent mock ARI push log */
export const GET: RequestHandler = async () => {
	return json(getMockLog());
};

/** DELETE /api/dev/channex-log — clear the log */
export const DELETE: RequestHandler = async () => {
	clearMockLog();
	return json({ cleared: true });
};
