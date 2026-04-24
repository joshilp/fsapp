import { json } from '@sveltejs/kit';
import { like, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guests } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json([], { status: 401 });

	const phoneRaw = url.searchParams.get('phone')?.trim() ?? '';
	const phone = phoneRaw.replace(/\D/g, ''); // digits only for matching
	const name = url.searchParams.get('name')?.trim() ?? '';

	if (!phone && !name) return json([]);

	const conditions = [];
	// Match partial digits anywhere in the stored (normalized) phone
	if (phone.length >= 3) {
		conditions.push(like(guests.phone, `%${phone}%`));
	}
	if (name.length >= 2) {
		conditions.push(like(guests.name, `%${name}%`));
	}
	if (conditions.length === 0) return json([]);

	const results = await db.query.guests.findMany({
		where: or(...conditions),
		columns: { id: true, name: true, phone: true, email: true, street: true, city: true, provinceState: true },
		limit: 5,
		orderBy: (g, { desc }) => [desc(g.updatedAt)]
	});

	return json(results);
};
