import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { svelteKitHandler } from 'better-auth/svelte-kit';

// Routes that bypass the isApproved check entirely (public or system routes)
const UNPROTECTED = ['/auth/', '/api/', '/book', '/pending'];
const PENDING_PATH = '/pending';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;

		// Approval check for authenticated routes
		const path = event.url.pathname;
		// Also allow the public homepage and all public paths
		const isUnprotected =
			UNPROTECTED.some((p) => path.startsWith(p)) ||
			path === '/' ||
			path === PENDING_PATH;

		if (!isUnprotected) {
			const dbUser = await db.query.user.findFirst({
				where: eq(user.id, session.user.id),
				columns: { isApproved: true, isAdmin: true }
			});

			if (dbUser && !dbUser.isApproved) {
				return new Response(null, { status: 302, headers: { Location: PENDING_PATH } });
			}
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
