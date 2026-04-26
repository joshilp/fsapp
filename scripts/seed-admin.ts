/**
 * Creates (or updates) an admin user in the database.
 * Run once: tsx --env-file=.env scripts/seed-admin.ts
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=changeme tsx --env-file=.env scripts/seed-admin.ts
 *
 * After running, sign in with the email/password and change your password in Settings.
 */
import Database from 'better-sqlite3';
import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { resolve } from 'path';

const scryptAsync = promisify(scrypt);

const dbPath = resolve(process.env.DATABASE_URL ?? 'local.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME;

if (!email || !password || !name) {
	throw new Error('ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME are required');
}

// Hash password in the same format better-auth uses:
// $scrypt$N=16384,r=16,p=1$<salt_base64>$<hash_base64>
async function hashPassword(pw: string): Promise<string> {
	const N = 16384, r = 16, p = 1, keyLen = 64;
	const salt = randomBytes(16);
	const key = await scryptAsync(pw, salt, keyLen, { N, r, p }) as Buffer;
	return `$scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

const now = Date.now();
const userId = crypto.randomUUID();
const accountId = crypto.randomUUID();
const pwHash = await hashPassword(password);

// Check if user already exists
const existing = db.prepare("SELECT id, is_admin FROM user WHERE email = ?").get(email) as { id: string; is_admin: number } | undefined;

if (existing) {
	// Update to admin + approved; update password hash
	db.prepare("UPDATE user SET is_admin = 1, is_approved = 1, updated_at = ? WHERE id = ?").run(now, existing.id);
	db.prepare("UPDATE account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'").run(pwHash, now, existing.id);
	console.log(`✓ Updated existing user ${email} to admin`);
	console.log(`  Password hash updated — sign in with your new password`);
} else {
	// Insert user
	db.prepare(`
		INSERT INTO user (id, name, email, email_verified, image, is_approved, is_admin, created_at, updated_at)
		VALUES (?, ?, ?, 1, NULL, 1, 1, ?, ?)
	`).run(userId, name, email, now, now);

	// Insert account (credential provider)
	db.prepare(`
		INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token,
			access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
		VALUES (?, ?, 'credential', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
	`).run(accountId, userId, userId, pwHash, now, now);

	console.log(`✓ Created admin user: ${email}`);
	console.log(`  Temporary password: ${password}`);
	console.log(`  Sign in and change your password immediately.`);
}

db.close();
