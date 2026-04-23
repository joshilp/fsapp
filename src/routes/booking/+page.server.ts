import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getGridData } from '$lib/server/booking-queries';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const now = new Date();
	const monthParam = url.searchParams.get('month');

	let year: number;
	let month: number;

	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		[year, month] = monthParam.split('-').map(Number);
	} else {
		year = now.getFullYear();
		month = now.getMonth() + 1;
	}

	// Clamp to valid range
	month = Math.max(1, Math.min(12, month));

	const [falcon, spanish] = await Promise.all([
		getGridData('prop-falcon', year, month),
		getGridData('prop-spanish', year, month)
	]);

	return {
		falcon,
		spanish,
		year,
		month,
		today: now.toISOString().slice(0, 10)
	};
};
