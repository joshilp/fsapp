import { json } from '@sveltejs/kit';
import { like, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guests } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json([], { status: 401 });

	// ?q= searches name, phone, and email (used by merge search and autocomplete)
	// Legacy params ?name= and ?phone= are still supported for other callers
	const q        = url.searchParams.get('q')?.trim() ?? '';
	const phoneRaw = url.searchParams.get('phone')?.trim() ?? '';
	const phone    = phoneRaw.replace(/\D/g, '');
	const name     = url.searchParams.get('name')?.trim() ?? '';

	if (!q && !phone && !name) return json([]);

	const conditions = [];
	if (q.length >= 2) {
		const pattern = `%${q}%`;
		conditions.push(like(guests.name,  pattern));
		conditions.push(like(guests.email, pattern));
		conditions.push(like(guests.phone, pattern));
	}
	if (phone.length >= 3) conditions.push(like(guests.phone, `%${phone}%`));
	if (name.length  >= 2) conditions.push(like(guests.name,  `%${name}%`));

	if (conditions.length === 0) return json([]);

	const results = await db.query.guests.findMany({
		where: or(...conditions),
		columns: { id: true, name: true, phone: true, email: true, street: true, city: true, provinceState: true },
		limit: 10,
		orderBy: (g, { desc }) => [desc(g.updatedAt)]
	});

	return json(results);
};
