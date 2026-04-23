/**
 * AES-256-GCM encryption for CC staging.
 *
 * Key is loaded from CC_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 * Generate a key with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * IMPORTANT: The decrypted payload must NEVER be:
 *   - logged
 *   - returned to the client
 *   - stored anywhere other than cc_staging.encrypted_data
 *
 * Only the charge workflow (server-side only) should call decrypt().
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit IV — standard for GCM
const TAG_BYTES = 16;

function loadKey(): Buffer {
	const hex = env.CC_ENCRYPTION_KEY;
	if (!hex || hex.length !== 64) {
		throw new Error(
			'CC_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). ' +
				'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
		);
	}
	return Buffer.from(hex, 'hex');
}

export type CcPayload = {
	number: string;
	expiry: string; // "MM/YY"
	cvv?: string;
	name?: string;
};

/**
 * Encrypts a CC payload. Returns a single base64 string: iv + tag + ciphertext.
 * The last four digits and card type are returned separately so they can be
 * stored in plain text for display — everything else stays encrypted.
 */
export function encryptCc(payload: CcPayload): {
	encryptedData: string;
	lastFour: string;
	cardType: string;
} {
	const key = loadKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	const json = JSON.stringify(payload);
	const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	// Layout: [iv (12)] [tag (16)] [ciphertext (variable)]
	const combined = Buffer.concat([iv, tag, encrypted]);

	return {
		encryptedData: combined.toString('base64'),
		lastFour: payload.number.replace(/\s/g, '').slice(-4),
		cardType: detectCardType(payload.number)
	};
}

/**
 * Decrypts a CC payload. Only call this server-side in the charge workflow.
 * Never return the result to the client.
 */
export function decryptCc(encryptedData: string): CcPayload {
	const key = loadKey();
	const combined = Buffer.from(encryptedData, 'base64');

	const iv = combined.subarray(0, IV_BYTES);
	const tag = combined.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
	const ciphertext = combined.subarray(IV_BYTES + TAG_BYTES);

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return JSON.parse(decrypted.toString('utf8')) as CcPayload;
}

function detectCardType(number: string): string {
	const n = number.replace(/\s/g, '');
	if (/^4/.test(n)) return 'Visa';
	if (/^5[1-5]|^2[2-7]/.test(n)) return 'MC';
	if (/^3[47]/.test(n)) return 'Amex';
	if (/^6(?:011|5)/.test(n)) return 'Discover';
	return 'Other';
}
