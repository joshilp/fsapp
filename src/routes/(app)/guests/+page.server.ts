import { redirect } from '@sveltejs/kit';
import { like, or, desc, eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { bookings, guests } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const selectedId = url.searchParams.get('id') ?? null;

	let guestList: { id: string; name: string; phone: string | null; email: string | null; rating: number | null; ratingNotes: string | null }[] = [];

	if (q.length >= 2) {
		const pattern = `%${q}%`;
		guestList = await db.query.guests.findMany({
			where: or(
				like(guests.name, pattern),
				like(guests.phone, pattern),
				like(guests.email, pattern)
			),
			columns: { id: true, name: true, phone: true, email: true, rating: true, ratingNotes: true },
			orderBy: (g, { asc }) => [asc(g.name)],
			limit: 40
		});
	}

	// If a guest is selected, load their full profile + history
	let selectedGuest: {
		id: string; name: string; phone: string | null; email: string | null;
		street: string | null; city: string | null; provinceState: string | null; country: string | null;
		notes: string | null; rating: number | null; ratingNotes: string | null;
	} | null = null;

	let guestBookings: {
		id: string; status: string; checkInDate: string; checkOutDate: string;
		propertyName: string | null; roomNumber: string | null; nights: number;
		totalCents: number;
	}[] = [];

	if (selectedId) {
		selectedGuest = await db.query.guests.findFirst({
			where: eq(guests.id, selectedId),
			columns: { id: true, name: true, phone: true, email: true, street: true, city: true, provinceState: true, country: true, notes: true, rating: true, ratingNotes: true }
		}) ?? null;

		if (selectedGuest) {
			const rawBookings = await db.query.bookings.findMany({
				where: eq(bookings.guestId, selectedId),
				with: {
					room: { with: { property: { columns: { name: true } } }, columns: { roomNumber: true } },
					lineItems: { columns: { type: true, totalAmount: true } }
				},
				columns: { id: true, status: true, checkInDate: true, checkOutDate: true },
				orderBy: (b, { desc }) => [desc(b.checkInDate)],
				limit: 50
			});

			guestBookings = rawBookings.map((b) => ({
				id: b.id,
				status: b.status,
				checkInDate: b.checkInDate,
				checkOutDate: b.checkOutDate,
				propertyName: b.room?.property?.name ?? null,
				roomNumber: b.room?.roomNumber ?? null,
				nights: Math.round((new Date(b.checkOutDate).getTime() - new Date(b.checkInDate).getTime()) / 86400000),
				totalCents: b.lineItems.filter(li => li.type !== 'deposit').reduce((s, li) => s + li.totalAmount, 0)
			}));
		}
	}

	return { q, selectedId, guestList, selectedGuest, guestBookings };
};

export const actions: Actions = {
	rateGuest: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const id = (fd.get('guestId') as string)?.trim();
		const rating = parseInt(fd.get('rating') as string);
		const ratingNotes = ((fd.get('ratingNotes') as string) ?? '').trim() || null;
		if (!id || isNaN(rating) || rating < 1 || rating > 5) return fail(400, { error: 'Invalid' });
		await db.update(guests).set({ rating, ratingNotes }).where(eq(guests.id, id));
		return { success: true };
	},

	updateGuest: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const id = g('guestId');
		if (!id) return fail(400, { error: 'Missing ID' });
		await db.update(guests).set({
			name: g('name') ?? undefined,
			phone: g('phone'),
			email: g('email'),
			notes: g('notes'),
			street: g('street'),
			city: g('city'),
			provinceState: g('province'),
			country: g('country')
		}).where(eq(guests.id, id));
		return { success: true };
	}
};
