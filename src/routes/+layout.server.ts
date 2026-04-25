import { eq, and } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';

export const load: LayoutServerLoad = async (event) => {
	const currentUser = event.locals.user ?? null;
	let pendingUserCount = 0;

	if (currentUser) {
		const me = await db.query.user.findFirst({
			where: eq(user.id, currentUser.id),
			columns: { isAdmin: true }
		});
		if (me?.isAdmin) {
			const pending = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.isApproved, false));
			pendingUserCount = pending.length;
		}
	}

	return {
		user: currentUser,
		pendingUserCount
	};
};
