/**
 * Shared room bed-notation utilities.
 * Used in grid, dialogs, dropdowns — keeps notation consistent everywhere.
 */

export interface RoomBedInfo {
	numRooms: number; // bedroom count (1BR, 2BR, etc.)
	kingBeds: number;
	queenBeds: number;
	doubleBeds: number;
	hasHideabed: boolean;
	hasKitchen: boolean;
}

/**
 * Returns exactly 6 fixed-position slots for the grid column.
 * Empty string = blank slot. Order: BR · K · Q · D · HB · Kit
 */
export function bedSlots(r: RoomBedInfo): [string, string, string, string, string, string] {
	return [
		`${r.numRooms}BR`,
		r.kingBeds > 0 ? `${r.kingBeds}K` : '',
		r.queenBeds > 0 ? `${r.queenBeds}Q` : '',
		r.doubleBeds > 0 ? `${r.doubleBeds}D` : '',
		r.hasHideabed ? 'HB' : '',
		r.hasKitchen ? 'Kit' : ''
	];
}

/**
 * Compact single-line label for dropdowns/chips, e.g. "2BR 1Q 1D Kit".
 * Skips blank slots.
 */
export function bedCompact(r: RoomBedInfo): string {
	return bedSlots(r).filter(Boolean).join(' ') || '—';
}

/** Total sleeping capacity (excluding hide-a-bed from count if desired). */
export function totalBeds(r: Pick<RoomBedInfo, 'kingBeds' | 'queenBeds' | 'doubleBeds' | 'hasHideabed'>): number {
	return r.kingBeds + r.queenBeds + r.doubleBeds + (r.hasHideabed ? 1 : 0);
}
