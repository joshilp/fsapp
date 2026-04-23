import { form, getRequestEvent } from '$app/server';
import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

export const logout = form(async () => {
	const event = getRequestEvent();
	await auth.api.signOut({ headers: event!.request.headers });
	redirect(303, '/auth/login');
});

export const signIn = form(
	v.object({
		email: v.pipe(v.string(), v.email('Please enter a valid email')),
		_password: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters'))
	}),
	async ({ email, _password }) => {
		try {
			await auth.api.signInEmail({ body: { email, password: _password } });
		} catch (e) {
			if (e instanceof APIError) {
				return { error: e.message ?? 'Sign in failed' };
			}
			return { error: 'An unexpected error occurred' };
		}
		redirect(303, '/');
	}
);

export const signUp = form(
	v.object({
		name: v.pipe(v.string(), v.nonEmpty('Name is required')),
		email: v.pipe(v.string(), v.email('Please enter a valid email')),
		_password: v.pipe(v.string(), v.minLength(8, 'Password must be at least 8 characters'))
	}),
	async ({ name, email, _password }) => {
		try {
			await auth.api.signUpEmail({ body: { name, email, password: _password } });
		} catch (e) {
			if (e instanceof APIError) {
				return { error: e.message ?? 'Sign up failed' };
			}
			return { error: 'An unexpected error occurred' };
		}
		redirect(303, '/');
	}
);
