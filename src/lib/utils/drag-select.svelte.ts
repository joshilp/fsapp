/**
 * Shared drag-to-select utility for date-column grids.
 *
 * Both the Booking Grid (rooms × days) and the Inventory Grid (room types × dates)
 * use these classes so the gesture logic lives in one place.
 *
 * Column values are numbers (day-index) in both grids — ISO dates are mapped to
 * array indices before interacting with these classes.
 */

// ─── Single-row drag ──────────────────────────────────────────────────────────
// Tracks one drag gesture on one row. On release, returns the selected column
// range so the caller can open a BookingCard.

export class DragSelect {
	#gesture = $state<{ rowId: string; startCol: number; currentCol: number } | null>(null);

	get active() { return this.#gesture !== null; }

	/** The normalised min/max range while a drag is in progress (null when idle). */
	get range(): { rowId: string; minCol: number; maxCol: number } | null {
		const g = this.#gesture;
		if (!g) return null;
		return {
			rowId: g.rowId,
			minCol: Math.min(g.startCol, g.currentCol),
			maxCol: Math.max(g.startCol, g.currentCol)
		};
	}

	/** Begin a drag gesture. */
	start(rowId: string, col: number) {
		this.#gesture = { rowId, startCol: col, currentCol: col };
	}

	/** Extend the active drag to a new column (only if same row). */
	move(rowId: string, col: number) {
		const g = this.#gesture;
		if (g?.rowId === rowId) this.#gesture = { ...g, currentCol: col };
	}

	/**
	 * Capture the current range and clear drag state.
	 * Call this on global mouseup — read the returned value BEFORE calling end()
	 * if you need derived values (they recalculate immediately after clearing).
	 */
	end(): { rowId: string; minCol: number; maxCol: number } | null {
		const r = this.range;
		this.#gesture = null;
		return r;
	}

	cancel() { this.#gesture = null; }
}

// ─── Multi-row draw mode ──────────────────────────────────────────────────────
// Tracks one active draw gesture AND accumulates committed selections across
// multiple rows. Used for group bookings.

export type DrawSelection<TExtra = Record<string, unknown>> = {
	rowId: string;
	minCol: number;
	maxCol: number;
	extra: TExtra;
};

export class DrawSelect<TExtra = Record<string, unknown>> {
	#gesture = $state<{ rowId: string; startCol: number; currentCol: number } | null>(null);
	selections = $state<DrawSelection<TExtra>[]>([]);

	get active() { return this.#gesture !== null; }

	get activeRange(): { rowId: string; minCol: number; maxCol: number } | null {
		const g = this.#gesture;
		if (!g) return null;
		return {
			rowId: g.rowId,
			minCol: Math.min(g.startCol, g.currentCol),
			maxCol: Math.max(g.startCol, g.currentCol)
		};
	}

	startGesture(rowId: string, col: number) {
		this.#gesture = { rowId, startCol: col, currentCol: col };
	}

	moveGesture(rowId: string, col: number) {
		const g = this.#gesture;
		if (g?.rowId === rowId) this.#gesture = { ...g, currentCol: col };
	}

	/** End gesture and return the range without committing to selections. */
	endGesture(): { rowId: string; minCol: number; maxCol: number } | null {
		const r = this.activeRange;
		this.#gesture = null;
		return r;
	}

	/** Add or replace the selection for a row. */
	commit(rowId: string, minCol: number, maxCol: number, extra: TExtra) {
		this.selections = [
			...this.selections.filter((s) => s.rowId !== rowId),
			{ rowId, minCol, maxCol, extra }
		];
	}

	remove(rowId: string) {
		this.selections = this.selections.filter((s) => s.rowId !== rowId);
	}

	clear() {
		this.selections = [];
		this.#gesture = null;
	}
}
