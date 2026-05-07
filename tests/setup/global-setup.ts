/**
 * Playwright global setup — runs once before any test project starts.
 *
 * Creates (or updates) the test user in local.db using TEST_EMAIL and
 * TEST_PASSWORD from .env. This means `pnpm test` is fully self-contained —
 * no manual seed step needed.
 *
 * Uses the same @noble/hashes/scrypt hashing and "{hex_salt}:{hex_key}"
 * format as better-auth's built-in credential provider (see
 * node_modules/better-auth/dist/crypto/password.mjs).
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import Database from 'better-sqlite3';
import { config } from 'dotenv';

export default async function globalSetup() {
	// Load .env so TEST_EMAIL / TEST_PASSWORD are available
	config({ path: resolve(process.cwd(), '.env') });

	const email    = process.env.TEST_EMAIL    ?? 'test@playwright.local';
	const password = process.env.TEST_PASSWORD ?? 'playwrightpass123';
	const name     = 'Playwright Test User';
	const dbPath   = resolve(process.env.DATABASE_URL ?? 'local.db');

	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');

	const pwHash = await hashPassword(password);
	const now    = Date.now();

	const existing = db.prepare(
		'SELECT id FROM user WHERE email = ?'
	).get(email) as { id: string } | undefined;

	if (existing) {
		db.prepare(
			'UPDATE user SET is_approved = 1, is_admin = 1, updated_at = ? WHERE id = ?'
		).run(now, existing.id);
		db.prepare(
			"UPDATE account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'"
		).run(pwHash, now, existing.id);
		console.log(`[test setup] Updated test user: ${email}`);
	} else {
		const userId    = crypto.randomUUID();
		const accountId = crypto.randomUUID();

		db.prepare(`
			INSERT INTO user (id, name, email, email_verified, image, is_approved, is_admin, created_at, updated_at)
			VALUES (?, ?, ?, 1, NULL, 1, 1, ?, ?)
		`).run(userId, name, email, now, now);

		db.prepare(`
			INSERT INTO account
				(id, account_id, provider_id, user_id, access_token, refresh_token, id_token,
				 access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
			VALUES (?, ?, 'credential', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
		`).run(accountId, userId, userId, pwHash, now, now);

		console.log(`[test setup] Created test user: ${email}`);
	}

	db.close();
}

/** Matches better-auth's hashPassword() — stores as "{hex_salt}:{hex_hash}" */
async function hashPassword(pw: string): Promise<string> {
	const N = 16384, r = 16, p = 1, dkLen = 64;
	const saltBytes = randomBytes(16);
	const salt      = bytesToHex(saltBytes);
	const key       = await scryptAsync(pw.normalize('NFKC'), salt, {
		N, p, r, dkLen,
		maxmem: 128 * N * r * 2,
	});
	return `${salt}:${bytesToHex(key)}`;
}
