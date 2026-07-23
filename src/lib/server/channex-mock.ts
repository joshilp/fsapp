/**
 * In-memory mock log for Channex ARI pushes.
 * This module is a Node.js singleton — all imports share the same `log` array.
 * Used when CHANNEX_MOCK=true in .env to test the integration without a real account.
 */

export type MockARIEntry = {
	id: string;
	timestamp: string;
	updates: unknown[];
};

const log: MockARIEntry[] = [];

export function logARIPush(updates: unknown[]): void {
	log.unshift({
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		updates
	});
	if (log.length > 100) log.pop();
}

export function getMockLog(): MockARIEntry[] {
	return [...log];
}

export function clearMockLog(): void {
	log.length = 0;
}
