import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) {
		return redirect(302, '/auth/login');
	}
	return { user: event.locals.user };
};
