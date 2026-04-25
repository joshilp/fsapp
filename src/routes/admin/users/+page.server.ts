import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const me = await db.query.user.findFirst({ where: eq(user.id, locals.user.id) });
	if (!me?.isAdmin) redirect(303, '/booking');

	const users = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			isApproved: user.isApproved,
			isAdmin: user.isAdmin,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(user.createdAt);

	return { users, currentUserId: locals.user.id };
};

export const actions: Actions = {
	toggleApproved: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const me = await db.query.user.findFirst({ where: eq(user.id, locals.user.id) });
		if (!me?.isAdmin) return fail(403, { error: 'Not an admin' });

		const fd = await request.formData();
		const userId = (fd.get('userId') as string)?.trim();
		if (!userId) return fail(400, { error: 'Missing userId' });

		const target = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { isApproved: true } });
		if (!target) return fail(404, { error: 'User not found' });

		await db.update(user).set({ isApproved: !target.isApproved }).where(eq(user.id, userId));
		return { success: true };
	},

	toggleAdmin: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const me = await db.query.user.findFirst({ where: eq(user.id, locals.user.id) });
		if (!me?.isAdmin) return fail(403, { error: 'Not an admin' });

		const fd = await request.formData();
		const userId = (fd.get('userId') as string)?.trim();
		if (!userId || userId === locals.user.id) return fail(400, { error: 'Cannot change own admin status' });

		const target = await db.query.user.findFirst({ where: eq(user.id, userId), columns: { isAdmin: true } });
		if (!target) return fail(404, { error: 'User not found' });

		await db.update(user).set({ isAdmin: !target.isAdmin }).where(eq(user.id, userId));
		return { success: true };
	}
};
