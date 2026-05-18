<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import type { ARICell } from './+page.server';
	import { DragSelect, DrawSelect } from '$lib/utils/drag-select.svelte';
	import BookingCard from '$lib/components/booking/BookingCard.svelte';
	import GroupCard from '$lib/components/booking/GroupCard.svelte';
	import RoomAssignmentDialog from '$lib/components/booking/RoomAssignmentDialog.svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';

	let { data }: { data: PageData } = $props();

	const today = $derived(data.today);
	let activeProp = $state(data.activePropId);

	// ─── Layout mode ──────────────────────────────────────────────────────────
	const INV_LAYOUT_KEY = 'inventory-layout';
	function loadInvLayout(): 'single' | 'stacked' {
		if (typeof localStorage === 'undefined') return 'single';
		return (localStorage.getItem(INV_LAYOUT_KEY) as 'single' | 'stacked') || 'single';
	}
	let layoutMode = $state<'single' | 'stacked'>(loadInvLayout());
	function toggleLayout() {
		layoutMode = layoutMode === 'single' ? 'stacked' : 'single';
		if (typeof localStorage !== 'undefined') localStorage.setItem(INV_LAYOUT_KEY, layoutMode);
	}

	// ─── Row visibility ────────────────────────────────────────────────────────
	const INV_ROWS_KEY = 'inventory-rows';
	type RowVisibility = { sellable: boolean; booked: boolean; minStay: boolean; cta: boolean; ctd: boolean };
	const ROW_DEFAULTS: RowVisibility = { sellable: true, booked: false, minStay: true, cta: false, ctd: false };
	function loadInvRows(): RowVisibility {
		if (typeof localStorage === 'undefined') return { ...ROW_DEFAULTS };
		try { return { ...ROW_DEFAULTS, ...JSON.parse(localStorage.getItem(INV_ROWS_KEY) ?? '{}') }; }
		catch { return { ...ROW_DEFAULTS }; }
	}
	let visibleRows = $state<RowVisibility>(loadInvRows());
	function toggleRow(key: keyof RowVisibility) {
		visibleRows[key] = !visibleRows[key];
		if (typeof localStorage !== 'undefined') localStorage.setItem(INV_ROWS_KEY, JSON.stringify(visibleRows));
	}

	let displayPopoverOpen = $state(false);

	// Which properties to render based on layout
	const visibleProps = $derived(
		layoutMode === 'stacked' ? data.propertiesList : data.propertiesList.filter((p) => p.id === activeProp)
	);

	// ─── Navigation ────────────────────────────────────────────────────────────
	function navUrl(fromDate: string, prop?: string) {
		return `/inventory?from=${fromDate}&prop=${prop ?? activeProp}`;
	}
	function prevWindow() {
		const d = new Date(data.from + 'T12:00:00');
		d.setDate(d.getDate() - data.window);
		const f = d.toISOString().slice(0, 10);
		window.location.href = navUrl(f < today ? today : f);
	}
	function nextWindow() {
		const d = new Date(data.from + 'T12:00:00');
		d.setDate(d.getDate() + data.window);
		window.location.href = navUrl(d.toISOString().slice(0, 10));
	}

	// ─── Drag-to-book / mode ─────────────────────────────────────────────────
	const dragSel = new DragSelect();
	type InvDrawExtra = { roomTypeId: string; roomTypeName: string; propertyId: string; propertyName: string };
	const drawSel = new DrawSelect<InvDrawExtra>();
	let mode      = $state<'book' | 'group'>('book');
	let dragMoved = $state(false);
	function setMode(m: 'book' | 'group') {
		mode = m;
		drawSel.clear();
		editRange = null;
	}

	// ─── Bulk Edit Panel ─────────────────────────────────────────────────────
	type EditRange = { roomTypeId: string; roomTypeName: string; propertyId: string; propertyName: string; minCol: number; maxCol: number };
	let editRange     = $state<EditRange | null>(null);
	let bulkDOW       = $state([true, true, true, true, true, true, true]);
	let bulkRateMode  = $state<'none' | 'set' | 'increase_pct'>('none');
	let bulkRateValue = $state('');
	let bulkMinNights = $state('');
	let bulkStopSell      = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkCTA           = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkCTD           = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkAvailOverride = $state(''); // '' = no change, number = set cap, 'clear' = remove
	let bulkApplyTo       = $state<'roomType' | 'property'>('roomType');
	let bulkSaving        = $state(false);

	const bulkCount = $derived.by(() => {
		if (!editRange) return 0;
		let c = 0;
		for (let i = editRange.minCol; i <= editRange.maxCol; i++) {
			const d = data.dates[i];
			if (!d) continue;
			if (bulkDOW[new Date(d + 'T12:00:00').getDay()]) c++;
		}
		return c;
	});

	function cellEditState(roomTypeId: string, colIdx: number): boolean {
		if (!editRange) return false;
		return editRange.roomTypeId === roomTypeId && colIdx >= editRange.minCol && colIdx <= editRange.maxCol;
	}

	async function applyBulkEdit() {
		if (!editRange || bulkSaving) return;
		bulkSaving = true;
		try {
			const dates: string[] = [];
			for (let i = editRange.minCol; i <= editRange.maxCol; i++) {
				const d = data.dates[i];
				if (!d) continue;
				if (bulkDOW[new Date(d + 'T12:00:00').getDay()]) dates.push(d);
			}
			if (!dates.length) { toast.error('No dates match the day filter.'); return; }

			const r = await fetch('/api/ari/bulk-override', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					roomTypeId: bulkApplyTo === 'roomType' ? editRange.roomTypeId : undefined,
					propertyId: bulkApplyTo === 'property' ? editRange.propertyId : undefined,
					dates,
					rateMode: bulkRateMode,
					rateValue: bulkRateValue ? Number(bulkRateValue) : null,
					minNights: bulkMinNights ? Number(bulkMinNights) : null,
					// -1 = no change sentinel; null = clear override; number = set cap
					availabilityOverride: bulkAvailOverride === '' ? -1 : bulkAvailOverride === 'clear' ? null : Number(bulkAvailOverride),
					stopSell: bulkStopSell === 'enable' ? true : bulkStopSell === 'disable' ? false : null,
					closedToArrival: bulkCTA === 'enable' ? true : bulkCTA === 'disable' ? false : null,
					closedToDeparture: bulkCTD === 'enable' ? true : bulkCTD === 'disable' ? false : null,
				})
			});
			if (r.ok) {
				const result = await r.json();
				toast.success(`Updated ${result.updated} cell${result.updated === 1 ? '' : 's'}`);
				editRange = null;
				await invalidateAll();
			} else {
				const err = await r.json();
				toast.error(err.error ?? 'Bulk update failed');
			}
		} catch {
			toast.error('Bulk update failed');
		} finally {
			bulkSaving = false;
		}
	}

	function getAri(propId: string) { return data.propData[propId]?.ariData ?? {}; }

	// Svelte action: auto-focus + select on mount (used for inline availability input)
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function findRtProp(roomTypeId: string) {
		return data.propertiesList.find((p) => data.propData[p.id]?.roomTypesList.some((r) => r.id === roomTypeId));
	}

	function hasConflictInRange(roomTypeId: string, propId: string, minCol: number, maxCol: number): boolean {
		const ari = getAri(propId);
		for (let i = minCol; i <= maxCol; i++) {
			const cell = ari[roomTypeId]?.[data.dates[i]];
			if (cell && (cell.available === 0 || cell.stopSell)) return true;
		}
		return false;
	}

	function cellDragState(roomTypeId: string, propId: string, colIdx: number): 'selected' | 'conflict' | null {
		const r = dragSel.range;
		if (!r || r.rowId !== roomTypeId || colIdx < r.minCol || colIdx > r.maxCol) return null;
		return hasConflictInRange(roomTypeId, propId, r.minCol, r.maxCol) ? 'conflict' : 'selected';
	}

	function cellDrawState(roomTypeId: string, propId: string, colIdx: number): 'drawing' | 'drawing-conflict' | null {
		if (mode !== 'group') return null;
		const r = drawSel.activeRange;
		if (!r || r.rowId !== roomTypeId || colIdx < r.minCol || colIdx > r.maxCol) return null;
		return hasConflictInRange(roomTypeId, propId, r.minCol, r.maxCol) ? 'drawing-conflict' : 'drawing';
	}

	function onAvailMouseDown(e: MouseEvent, roomTypeId: string, colIdx: number) {
		e.preventDefault(); dragMoved = false;
		if (mode === 'group') drawSel.startGesture(roomTypeId, colIdx);
		else dragSel.start(roomTypeId, colIdx);
	}

	function onAvailMouseEnter(roomTypeId: string, colIdx: number) {
		if (mode === 'group') {
			const r = drawSel.activeRange;
			if (r?.rowId === roomTypeId && colIdx !== r.minCol) { dragMoved = true; drawSel.moveGesture(roomTypeId, colIdx); }
		} else {
			const r = dragSel.range;
			if (r?.rowId === roomTypeId && colIdx !== r.minCol) { dragMoved = true; dragSel.move(roomTypeId, colIdx); }
		}
	}

	let conflictMessage = $state('');

	function addDaysLocal(iso: string, n: number) {
		const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
	}

	function onDocumentMouseUp() {
		if (mode === 'group') {
			const r = drawSel.endGesture();
			if (!r) return;
			const prop = findRtProp(r.rowId);
			if (!prop) return;
			if (hasConflictInRange(r.rowId, prop.id, r.minCol, r.maxCol)) {
				conflictMessage = 'No availability for part of that range.';
				setTimeout(() => (conflictMessage = ''), 3000);
				return;
			}
			const rt = data.propData[prop.id]?.roomTypesList.find((x) => x.id === r.rowId);
			if (rt) drawSel.commit(r.rowId, r.minCol, r.maxCol, { roomTypeId: rt.id, roomTypeName: rt.name, propertyId: prop.id, propertyName: prop.name });
			return;
	}
	// Restriction / rate row drag — opens bulk edit regardless of Book/Group mode
	if (dragRowType !== null) {
		if (!dragSel.active) { dragRowType = null; return; }
		// Single click (mouse never moved to a different cell) — cancel drag and let
		// the onclick handler fire (toggleRestriction / startInlineRate / openPopover).
		if (!dragMoved) { dragSel.cancel(); dragRowType = null; return; }
		const r = dragSel.range;
		const prop = r ? findRtProp(r.rowId) : null;
		dragSel.cancel();
		if (!r || !prop) { dragRowType = null; return; }
		const rt = data.propData[prop.id]?.roomTypesList.find((x) => x.id === r.rowId);
		if (rt) {
			editRange = { roomTypeId: r.rowId, roomTypeName: rt.name, propertyId: prop.id, propertyName: prop.name, minCol: r.minCol, maxCol: r.maxCol };
			editRangeFocus = dragRowType;
			dragRowType = null;
			bulkRateMode = 'none'; bulkRateValue = ''; bulkMinNights = '';
			bulkStopSell = 'no_change'; bulkCTA = 'no_change'; bulkCTD = 'no_change';
			bulkDOW = [true, true, true, true, true, true, true]; bulkAvailOverride = '';
		}
		return;
	}
	// ── book mode ───────────────────────────────────────────────────────────
	if (!dragSel.active) return;
		const wasMoved = dragMoved;
		const r = dragSel.range;
		const prop = r ? findRtProp(r.rowId) : null;
		const hasConflict = r && prop ? hasConflictInRange(r.rowId, prop.id, r.minCol, r.maxCol) : false;
		dragSel.cancel();
		if (!r || !prop) return;
		if (hasConflict && wasMoved) { conflictMessage = 'No availability for part of that range.'; setTimeout(() => (conflictMessage = ''), 3000); return; }
		// Single click or drag: always open the unified popover.
		// The popover shows occupancy info + New Booking CTA + rate override.
		const checkIn  = data.dates[r.minCol];
		const checkOut = data.dates[r.maxCol + 1] ?? addDaysLocal(data.dates[r.maxCol], 1);
		openPopover(r.rowId, checkIn, wasMoved ? checkOut : undefined);
	}

	function bookDrawSelections() {
		const sels = drawSel.selections;
		if (!sels.length) return;

		if (sels.length === 1) {
			// Single selection → open BookingCard directly (room-type booking with optional room assign)
			const s = sels[0];
			openBookingCard(s.extra.roomTypeId, s.extra.roomTypeName, data.dates[s.minCol], data.dates[s.maxCol + 1] ?? addDaysLocal(data.dates[s.maxCol], 1), s.extra.propertyId, s.extra.propertyName);
			drawSel.clear();
		} else {
			// Multiple selections → open room assignment dialog first, then GroupCard
			assignSelections = sels.map(s => ({
				roomTypeId: s.extra.roomTypeId,
				roomTypeName: s.extra.roomTypeName,
				propertyId: s.extra.propertyId,
				propertyName: s.extra.propertyName,
				checkIn: data.dates[s.minCol],
				checkOut: data.dates[s.maxCol + 1] ?? addDaysLocal(data.dates[s.maxCol], 1)
			}));
			assignOpen = true;
			drawSel.clear();
		}
	}

	// ─── Room Assignment Dialog → GroupCard flow ───────────────────────────────
	type AssignSelection = { roomTypeId: string; roomTypeName: string; propertyId: string; propertyName: string; checkIn: string; checkOut: string };
	let assignOpen  = $state(false);
	let assignSelections = $state<AssignSelection[]>([]);

	// Called by RoomAssignmentDialog when operator has picked rooms and clicks Continue
	function onRoomsAssigned(rooms: { roomId: string; roomNumber: string; propertyId: string; propertyName: string; checkIn: string; checkOut: string; roomConfigs: string[] }[]) {
		groupNewRooms = rooms;
		groupOpen = true;
	}

	// ─── Group Card ────────────────────────────────────────────────────────────
	let groupOpen     = $state(false);
	let groupNewRooms = $state<{ roomId: string; roomNumber: string; propertyId: string; propertyName: string; checkIn: string; checkOut: string; roomConfigs: string[] }[]>([]);

	// ─── Booking Card ──────────────────────────────────────────────────────────
	let cardOpen       = $state(false);
	let cardBookingId  = $state<string | null>(null);
	let cardNewBooking = $state<{ propertyId: string; propertyName: string; requestedRoomTypeId?: string; requestedRoomTypeName?: string; checkIn: string; checkOut: string } | null>(null);

	// ─── Popover ───────────────────────────────────────────────────────────────
	type CellKey = { roomTypeId: string; date: string };
	let popoverCell  = $state<CellKey | null>(null);
	let popoverCheckOut  = $state('');   // pre-filled checkout for "New Booking" CTA
	let popoverPropId    = $state('');
	let popoverPropName  = $state('');
	let popoverSource    = $state<'avail' | 'rate'>('avail'); // controls whether booking CTA is shown
	let editRate     = $state('');
	let editMin      = $state('');
	let editAvail    = $state(''); // '' = no change, number = cap override
	let editStopSell = $state(false);
	let editCTA      = $state(false);
	let editCTD      = $state(false);
	let savingCell   = $state(false);
	let overrideDate = $state('');   // which night's override is being edited (may differ from check-in when multi-night)

	// ─── Inline availability editing ─────────────────────────────────────────
	// Key = "roomTypeId|date", value = current edit value ('' = not editing)
	let inlineAvailEdit = $state<{ roomTypeId: string; date: string; value: string } | null>(null);
	let savingInlineAvail = $state(false);

	/** Which row type started the current drag (used to focus bulk panel section). */
	let dragRowType = $state<'avail' | 'rate' | 'minStay' | 'cta' | 'ctd' | null>(null);
	/** Which bulk panel section to highlight when the panel opens. */
	let editRangeFocus = $state<'avail' | 'rate' | 'minStay' | 'cta' | 'ctd'>('avail');

	// Replaced by floatingEdit above; kept declaration avoids errors from leftover touch path
	// inlineRateEdit is no longer used

	function startInlineAvail(roomTypeId: string, date: string, currentOverride: number | null) {
		inlineAvailEdit = { roomTypeId, date, value: currentOverride != null ? String(currentOverride) : '' };
	}

	async function commitInlineAvail() {
		if (!inlineAvailEdit || savingInlineAvail) return;
		const { roomTypeId, date, value } = inlineAvailEdit;
		const parsed = value.trim() === '' ? null : parseInt(value, 10);
		// null = clear override (restore to computed), number = set cap
		inlineAvailEdit = null;
		savingInlineAvail = true;
		try {
			const r = await fetch('/api/ari/bulk-override', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					roomTypeId,
					dates: [date],
					rateMode: 'none',
					// -1 = sentinel "no change for other fields", but availabilityOverride is explicit
					availabilityOverride: parsed, // null clears it
				})
			});
			if (r.ok) {
				await invalidateAll();
			} else {
				const err = await r.json();
				toast.error(err.error ?? 'Save failed');
			}
		} catch {
			toast.error('Save failed');
		} finally {
			savingInlineAvail = false;
		}
	}

	// ─── Unified floating edit overlay (Rate / Avail Cap / Min Stay) ─────────
	type FloatingEditType = 'rate' | 'availCap' | 'minStay';
	type FloatingEdit = {
		type: FloatingEditType;
		roomTypeId: string;
		date: string;
		value: string;
		cx: number;
		cy: number;
		contextLabel: string;
		/** For availCap: totalRooms — enables "Reset to N" instead of plain Clear */
		resetTo?: number;
		/** For availCap: whether an override is currently active */
		hasOverride?: boolean;
	};
	let floatingEdit = $state<FloatingEdit | null>(null);
	let savingFloatingEdit = $state(false);

	function startFloatingEdit(
		type: FloatingEditType,
		roomTypeId: string,
		date: string,
		currentValue: number | null,
		contextLabel: string,
		e: MouseEvent,
		resetTo?: number,
		hasOverride?: boolean
	) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		floatingEdit = {
			type, roomTypeId, date,
			value: currentValue != null
				? (type === 'rate' ? String(currentValue / 100) : String(currentValue))
				: '',
		cx: rect.left + rect.width / 2,
		cy: rect.top,
		contextLabel,
		resetTo,
		hasOverride
		};
	}

	async function commitFloatingEdit() {
		if (!floatingEdit || savingFloatingEdit) return;
		const { type, roomTypeId, date, value } = floatingEdit;
		const empty = !value.trim();
		floatingEdit = null;
		savingFloatingEdit = true;
		let body: Record<string, unknown>;
		try {
			if (type === 'rate') {
				if (empty) {
					body = { roomTypeId, dates: [date], rateMode: 'clear' };
				} else {
					const dollars = parseFloat(value);
					if (isNaN(dollars) || dollars < 0) return;
					body = { roomTypeId, dates: [date], rateMode: 'set', rateValue: dollars };
				}
			} else if (type === 'availCap') {
				const parsed = empty ? null : parseInt(value, 10);
				body = { roomTypeId, dates: [date], rateMode: 'none', availabilityOverride: parsed };
			} else {
				// minStay — empty clears the override (null → DB removes it → falls back to season)
				const nights = empty ? null : parseInt(value, 10);
				if (!empty && (isNaN(nights!) || nights! < 1)) return;
				body = { roomTypeId, dates: [date], rateMode: 'none', minNights: nights };
			}
			const r = await fetch('/api/ari/bulk-override', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (r.ok) await invalidateAll();
			else { const err = await r.json(); toast.error(err.error ?? 'Save failed'); }
		} catch { toast.error('Save failed'); }
		finally { savingFloatingEdit = false; }
	}

	// Legacy wrappers kept for touch fallback paths
	function startInlineRate(roomTypeId: string, date: string, currentCents: number | null) {
		// Delegate to floating overlay with a synthetic position (center of viewport)
		const cx = window.innerWidth / 2;
		const cy = window.innerHeight / 2;
		floatingEdit = { type: 'rate', roomTypeId, date, value: currentCents != null ? String(currentCents / 100) : '', cx, cy, contextLabel: '' };
	}

	// ─── Inline Avail Cap editing ────────────────────────────────────────────
	// ─── Inline Min Stay editing ─────────────────────────────────────────────
	// (Replaced by unified floatingEdit above)

	// ─── Remove stop sell quick action ───────────────────────────────────────
	async function removeStopSell(roomTypeId: string, date: string) {
		try {
			const r = await fetch('/api/ari/bulk-override', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ roomTypeId, dates: [date], rateMode: 'none', stopSell: false })
			});
			if (r.ok) await invalidateAll();
			else toast.error('Save failed');
		} catch { toast.error('Save failed'); }
	}

	// ─── Toolbar Bulk Edit button ────────────────────────────────────────────
	function openBulkPanel() {
		const prop = data.propData[activeProp];
		if (!prop) return;
		const rt = prop.roomTypesList[0];
		if (!rt) return;
		// Start from today or the first visible date, whichever is later
		const startDate = today > data.dates[0] ? today : data.dates[0];
		const col = data.dates.indexOf(startDate);
		const startCol = col >= 0 ? col : 0;
		const endCol = Math.min(startCol + 6, data.dates.length - 1);
		editRange = { roomTypeId: rt.id, roomTypeName: rt.name, propertyId: prop.id, propertyName: prop.name, minCol: startCol, maxCol: endCol };
		editRangeFocus = 'rate';
		bulkRateMode = 'none'; bulkRateValue = ''; bulkMinNights = '';
		bulkStopSell = 'no_change'; bulkCTA = 'no_change'; bulkCTD = 'no_change';
		bulkDOW = [true, true, true, true, true, true, true]; bulkAvailOverride = '';
	}

	async function toggleRestriction(roomTypeId: string, date: string, field: 'cta' | 'ctd', current: boolean) {
		const body: Record<string, unknown> = { roomTypeId, dates: [date], rateMode: 'none' };
		if (field === 'cta') body.closedToArrival = !current;
		else body.closedToDeparture = !current;
		try {
			const r = await fetch('/api/ari/bulk-override', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (r.ok) await invalidateAll();
			else toast.error('Save failed');
		} catch { toast.error('Save failed'); }
	}

	function onRestrictMouseEnter(roomTypeId: string, colIdx: number) {
		const r = dragSel.range;
		if (r?.rowId === roomTypeId && colIdx !== r.minCol) { dragMoved = true; dragSel.move(roomTypeId, colIdx); }
	}
	const nightDates = $derived.by(() => {
		if (!popoverCell) return [] as string[];
		const dates: string[] = [];
		const end = new Date(popoverCheckOut + 'T12:00:00');
		let cur = new Date(popoverCell.date + 'T12:00:00');
		while (cur < end) {
			dates.push(cur.toISOString().slice(0, 10));
			cur.setDate(cur.getDate() + 1);
		}
		return dates;
	});
	// Occupancy data loaded on popover open
	type CellGuest = { id: string; guestName: string; roomNumber: string | null; nights?: number };
	let cellCheckingIn     = $state<CellGuest[]>([]);
	let cellCheckingOut    = $state<CellGuest[]>([]);
	let cellStayingThrough = $state(0);
	let cellOccupancyLoading = $state(false);

	async function loadCellOccupancy(roomTypeId: string, date: string) {
		cellOccupancyLoading = true;
		cellCheckingIn = []; cellCheckingOut = []; cellStayingThrough = 0;
		try {
			const res = await fetch(`/api/inventory/cell?roomTypeId=${encodeURIComponent(roomTypeId)}&date=${encodeURIComponent(date)}`);
			if (res.ok) {
				const d = await res.json();
				cellCheckingIn     = d.checkingIn;
				cellCheckingOut    = d.checkingOut;
				cellStayingThrough = d.stayingThrough;
			}
		} finally {
			cellOccupancyLoading = false;
		}
	}

	// Also allow opening an existing booking from the cell popover guest list
	function openBookingDetail(bookingId: string) {
		cardBookingId  = bookingId;
		cardNewBooking = null;
		cardOpen       = true;
		closePopover();
	}

	function openBookingCard(rtId: string, rtName: string, checkIn: string, checkOut: string, propId: string, propName: string) {
		cardNewBooking = { propertyId: propId, propertyName: propName, requestedRoomTypeId: rtId, requestedRoomTypeName: rtName, checkIn, checkOut };
		cardBookingId  = null;
		cardOpen = true;
	}

	function openPopover(roomTypeId: string, checkIn: string, checkOut?: string, source: 'avail' | 'rate' = 'avail') {
		if (!roomTypeId || !checkIn) return;
		const prop = findRtProp(roomTypeId);
		if (!prop) return;
		const ari = Object.values(data.propData).reduce<Record<string, Record<string, ARICell>>>((a, p) => ({ ...a, ...p.ariData }), {});
		const cell = ari[roomTypeId]?.[checkIn];
		popoverCell     = { roomTypeId, date: checkIn };
		popoverCheckOut = checkOut ?? addDaysLocal(checkIn, 1);
		popoverPropId   = prop.id;
		popoverPropName = prop.name;
		popoverSource   = source;
		overrideDate = checkIn;
		editRate     = cell?.overrideRateCents != null ? String(cell.overrideRateCents / 100) : '';
		editMin      = cell?.minNights != null && cell.minNights !== cell.baseMinNights ? String(cell.minNights) : '';
		editAvail    = cell?.availabilityOverride != null ? String(cell.availabilityOverride) : '';
		editStopSell = cell?.stopSell ?? false;
		editCTA      = cell?.closedToArrival ?? false;
		editCTD      = cell?.closedToDeparture ?? false;
		loadCellOccupancy(roomTypeId, checkIn);
	}
	function selectOverrideDate(d: string) {
		const ari = Object.values(data.propData).reduce<Record<string, Record<string, ARICell>>>((a, p) => ({ ...a, ...p.ariData }), {});
		const c = ari[popoverCell!.roomTypeId]?.[d];
		overrideDate = d;
		editRate     = c?.overrideRateCents != null ? String(c.overrideRateCents / 100) : '';
		editMin      = c?.minNights != null && c.minNights !== c.baseMinNights ? String(c.minNights) : '';
		editAvail    = c?.availabilityOverride != null ? String(c.availabilityOverride) : '';
		editStopSell = c?.stopSell ?? false;
		editCTA      = c?.closedToArrival ?? false;
		editCTD      = c?.closedToDeparture ?? false;
	}
	function closePopover() { popoverCell = null; }

	function openBulkFromPopover() {
		if (!popoverCell) return;
		const col = data.dates.indexOf(popoverCell.date);
		if (col === -1) return;
		const prop = findRtProp(popoverCell.roomTypeId);
		if (!prop) return;
		const rt = data.propData[prop.id]?.roomTypesList.find(r => r.id === popoverCell!.roomTypeId);
		if (!rt) return;
		editRange = { roomTypeId: popoverCell.roomTypeId, roomTypeName: rt.name, propertyId: prop.id, propertyName: prop.name, minCol: col, maxCol: col };
		editRangeFocus = 'avail';
		bulkRateMode = 'none'; bulkRateValue = ''; bulkMinNights = '';
		bulkStopSell = 'no_change'; bulkCTA = 'no_change'; bulkCTD = 'no_change';
		bulkDOW = [true, true, true, true, true, true, true]; bulkAvailOverride = '';
		closePopover();
	}

	// Touch helpers — track touchstart position to distinguish tap from scroll
	let touchStartX = 0;
	let touchStartY = 0;

	async function saveOverride() {
		if (!popoverCell) return;
		savingCell = true;
		try {
			const res = await fetch('/api/ari/override', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomTypeId: popoverCell.roomTypeId, date: overrideDate, rateCents: editRate ? Math.round(parseFloat(editRate) * 100) : null, minNights: editMin ? parseInt(editMin) : null, availabilityOverride: editAvail !== '' ? parseInt(editAvail) : null, stopSell: editStopSell, closedToArrival: editCTA, closedToDeparture: editCTD }) });
			if (res.ok) { toast.success('Override saved'); closePopover(); await invalidateAll(); } else toast.error('Save failed');
		} finally { savingCell = false; }
	}
	async function clearOverride() {
		if (!popoverCell) return;
		savingCell = true;
		try {
			const res = await fetch('/api/ari/override', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomTypeId: popoverCell.roomTypeId, date: overrideDate }) });
			if (res.ok) { toast.success('Override cleared'); closePopover(); await invalidateAll(); } else toast.error('Clear failed');
		} finally { savingCell = false; }
	}

	// ─── Sync Channex ──────────────────────────────────────────────────────────
	let syncing = $state(false);

	// ─── Helpers ───────────────────────────────────────────────────────────────
	function fmt(cents: number | null) { return cents == null ? '—' : '$' + (cents / 100).toFixed(0); }
	function fmtDate(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		return { dow: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()], day: String(d.getDate()) };
	}
	function isWeekend(iso: string) { return [0, 6].includes(new Date(iso + 'T12:00:00').getDay()); }
	function availClass(cell: ARICell) {
		if (cell.stopSell) return 'text-red-700 font-bold';
		if (cell.available === 0) return 'text-red-500 font-semibold';
		if (cell.available === 1) return 'text-amber-600 font-semibold';
		return 'text-emerald-700 font-semibold';
	}
	function cellBg(iso: string, cell: ARICell) {
		if (cell.stopSell) return 'bg-red-50';
		if (iso === today) return 'bg-amber-50/60';
		if (cell.hasOverride) return 'bg-blue-50/40';
		return '';
	}

	const monthGroups = $derived.by(() => {
		const groups: { label: string; count: number }[] = [];
		let last = '';
		for (const d of data.dates) {
			const m = d.slice(0, 7);
			if (m !== last) { groups.push({ label: new Date(d + 'T12:00:00').toLocaleString('en-CA', { month: 'long', year: 'numeric' }), count: 1 }); last = m; }
			else groups[groups.length - 1].count++;
		}
		return groups;
	});

	const COL_W = 52;
</script>

<svelte:head><title>Inventory</title></svelte:head>
<svelte:document onmouseup={onDocumentMouseUp} />

{#if popoverCell}
	<div class="fixed inset-0 z-20" role="presentation" onclick={closePopover}></div>
{/if}
{#if conflictMessage}
	<div class="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-md bg-destructive/90 text-destructive-foreground px-3 py-2 text-sm font-medium shadow">{conflictMessage}</div>
{/if}

<div class="flex min-h-screen flex-col select-none">

	<!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
	<div class="sticky top-14 z-30 border-b bg-background">
		<div class="flex flex-wrap items-center gap-2 px-4 py-2">
			<h1 class="text-sm font-bold">Inventory</h1>
			<span class="text-xs text-muted-foreground hidden sm:inline">Rates & Availability</span>

			<!-- Property selector (single mode only) -->
			{#if layoutMode === 'single'}
				{#if data.propertiesList.length > 1}
					<select
						class="rounded border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
						onchange={(e) => { window.location.href = navUrl(data.from, (e.target as HTMLSelectElement).value); }}>
						{#each data.propertiesList as prop}
							<option value={prop.id} selected={activeProp === prop.id}>{prop.name}</option>
						{/each}
					</select>
				{:else}
					<span class="text-xs font-semibold">{data.propertiesList[0]?.name ?? ''}</span>
				{/if}
			{/if}

		<!-- Date navigation -->
		<div class="flex items-center gap-1 rounded-lg border px-1 text-xs">
			<button onclick={prevWindow} class="px-2 py-1 hover:bg-muted rounded disabled:opacity-40" disabled={data.from <= today}>← {data.window}d</button>
			<input type="month"
				value={data.from.slice(0, 7)}
				onchange={(e) => { const v = (e.target as HTMLInputElement).value; if (v) window.location.href = navUrl(v + '-01', activeProp); }}
				class="border-0 bg-transparent text-xs text-muted-foreground font-mono cursor-pointer focus:outline-none hover:text-foreground px-2 py-1"
				title="Jump to month" />
			<button onclick={nextWindow} class="px-2 py-1 hover:bg-muted rounded">{data.window}d →</button>
		</div>

			<!-- Mode segmented control -->
			<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium">
				<button onclick={() => setMode('book')} class={['px-2.5 py-1 border-r border-input transition-colors', mode === 'book' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}>Book</button>
				<button onclick={() => setMode('group')} class={['px-2.5 py-1 transition-colors', mode === 'group' ? 'bg-orange-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}>Group</button>
			</div>

			<!-- Sync Channex -->
			<button
				onclick={openBulkPanel}
				class="flex items-center gap-1.5 rounded-md border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
			>✎ Bulk Edit</button>
			<form method="POST" action="?/syncChannex&prop={activeProp}"
				use:enhance={() => {
					syncing = true;
					return async ({ result, update }) => {
						syncing = false;
						if (result.type === 'success') { const d = result.data as { synced: boolean; message: string }; if (d.synced) toast.success(d.message); else toast.error(d.message); }
						else if (result.type === 'failure') toast.error((result.data as { error: string })?.error ?? 'Sync failed');
						await update();
					};
				}}
			>
				<button type="submit" disabled={syncing}
					class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors">
					<span class="text-base leading-none">⇅</span>{syncing ? 'Syncing…' : 'Sync Channex'}
				</button>
			</form>

			<!-- Display popover (right-aligned) -->
			<div class="ml-auto">
				<Popover.Root bind:open={displayPopoverOpen}>
					<Popover.Trigger
						class="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
					>⚙ Display</Popover.Trigger>

					<Popover.Content align="end" class="w-64 p-0 gap-0">
						<div class="p-4 space-y-4">

							<!-- Layout -->
							<div>
								<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Layout</p>
								<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium">
									<button
										onclick={() => { if (layoutMode !== 'single') toggleLayout(); }}
										class={['flex-1 px-2 py-1.5 border-r border-input transition-colors', layoutMode === 'single' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}
									>⊟ Single</button>
									<button
										onclick={() => { if (layoutMode !== 'stacked') toggleLayout(); }}
										class={['flex-1 px-2 py-1.5 transition-colors', layoutMode === 'stacked' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}
									>⊞ Stacked</button>
								</div>
								<p class="text-[9px] text-muted-foreground mt-1">{layoutMode === 'stacked' ? 'All properties visible at once' : 'One property at a time'}</p>
							</div>

							<!-- Rows -->
							<div>
								<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Visible rows</p>
								<div class="space-y-1">
									{#each [
										{ key: 'sellable', label: 'Sellable', hint: 'Inventory ceiling per room type' },
										{ key: 'booked', label: 'Booked', hint: 'Rooms currently occupied' },
										{ key: 'minStay', label: 'Min Stay', hint: 'Minimum night requirement' },
										{ key: 'cta', label: 'CTA', hint: 'Closed to arrival' },
										{ key: 'ctd', label: 'CTD', hint: 'Closed to departure' },
									] as row}
										<button
											onclick={() => toggleRow(row.key as keyof RowVisibility)}
											class={['w-full flex items-center justify-between rounded px-2.5 py-1.5 text-xs transition-colors text-left',
												visibleRows[row.key as keyof RowVisibility] ? 'bg-foreground/5 text-foreground' : 'text-muted-foreground hover:bg-muted'
											].join(' ')}
										>
											<span class="font-medium">{row.label}</span>
											<span class={['text-[10px] px-1.5 py-0.5 rounded font-mono', visibleRows[row.key as keyof RowVisibility] ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'].join(' ')}>
												{visibleRows[row.key as keyof RowVisibility] ? 'ON' : 'OFF'}
											</span>
										</button>
									{/each}
								</div>
							</div>

						</div>

						<!-- Legend section -->
						<div class="border-t border-border px-4 py-3">
							<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Legend</p>
							<div class="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1.5 items-center text-xs">
								<span class="font-medium bg-foreground text-background rounded px-1 py-0.5 text-[10px] justify-self-start">Book</span><span>Click/drag to book rooms</span>
								<span class="font-medium bg-orange-500 text-white rounded px-1 py-0.5 text-[10px] justify-self-start">Group</span><span>Multi-room group booking</span>
								<span class="w-3 h-3 rounded-sm bg-red-100 border border-red-300 justify-self-center"></span><span>Stop sell / conflict</span>
								<span class="w-3 h-3 rounded-sm bg-blue-50 border border-blue-200 justify-self-center"></span><span>Rate / restriction override</span>
								<span class="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200 justify-self-center"></span><span>Today</span>
								<span class="w-3 h-3 rounded-sm bg-teal-50 border border-teal-200 justify-self-center"></span><span>Sellable override active</span>
								<span class="font-bold text-emerald-700 justify-self-center">2</span><span>Available rooms</span>
								<span class="font-bold text-amber-600 justify-self-center">1</span><span>Only 1 left</span>
								<span class="font-bold text-red-500 justify-self-center">0</span><span>Sold out</span>
								<span class="font-bold text-red-700 justify-self-center">STOP</span><span>Stop sell active</span>
								<span class="font-semibold text-amber-700 justify-self-center">3n</span><span>Min stay 3 nights</span>
								<span class="font-bold text-red-600 justify-self-center">CTA</span><span>No check-in allowed</span>
								<span class="font-bold text-orange-600 justify-self-center">CTD</span><span>No check-out allowed</span>
							</div>
						</div>
					</Popover.Content>
				</Popover.Root>
			</div>
		</div>
	</div>

	<!-- ── Grid(s) ───────────────────────────────────────────────────────────── -->
	<div class="flex-1 overflow-auto">
		{#each visibleProps as prop}
			{@const propRoomTypes = data.propData[prop.id]?.roomTypesList ?? []}
			{@const propAri = data.propData[prop.id]?.ariData ?? {}}

			{#if layoutMode === 'stacked' && visibleProps.length > 1}
				<!-- Property divider in stacked mode -->
				<div class="sticky top-0 z-20 bg-foreground text-background border-b-2 border-border px-4 py-1.5 flex items-center gap-2">
					<span class="font-semibold text-sm">{prop.name}</span>
					<span class="text-xs opacity-60">{propRoomTypes.length} room type{propRoomTypes.length === 1 ? '' : 's'}</span>
				</div>
			{/if}

			<table class="border-collapse text-xs" style="min-width: {150 + data.dates.length * COL_W}px">
				<thead>
					<tr class="bg-background sticky top-{layoutMode === 'stacked' ? '10' : '0'} z-10 border-b border-border shadow-sm">
						<th class="sticky left-0 z-20 bg-background w-36 min-w-36 border-r border-border px-3 py-2 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wide">Room Type</th>
						{#each monthGroups as mg}
							<th colspan={mg.count} class="border-r border-border/40 px-2 py-1.5 text-center font-semibold text-muted-foreground whitespace-nowrap">{mg.label}</th>
						{/each}
					</tr>
					<tr class="bg-muted/30 sticky top-[33px] z-10 border-b border-border">
						<th class="sticky left-0 z-20 bg-muted/30 w-36 min-w-36 border-r border-border px-3 py-1 text-left"></th>
						{#each data.dates as iso}
							{@const fd = fmtDate(iso)}
							<th style="width:{COL_W}px; min-width:{COL_W}px"
								class={['border-r border-border/30 px-0.5 py-1 text-center font-medium', iso === today ? 'bg-amber-100 text-amber-800' : isWeekend(iso) ? 'text-rose-600' : 'text-foreground'].join(' ')}
							>
								<div class="text-[9px] text-muted-foreground leading-none">{fd.dow}</div>
								<div class="text-[11px] font-bold leading-tight">{fd.day}</div>
							</th>
						{/each}
					</tr>
				</thead>

				<tbody>
					{#each propRoomTypes as rt}
						<!-- Room type label -->
						<tr class="bg-muted/20 border-t-2 border-border">
							<td class="sticky left-0 z-10 bg-muted/20 border-r border-border px-3 py-2 font-semibold" colspan={1 + data.dates.length}>
								<div class="flex items-center gap-2">
									<span class="font-mono text-[10px] bg-foreground/10 rounded px-1.5 py-0.5">{rt.category}</span>
									<span>{rt.name}</span>
									{#if rt.channexRoomTypeId}
										<span class="text-[9px] text-emerald-600 font-medium ml-1">⇅ Channex</span>
									{/if}
								</div>
							</td>
						</tr>

					<!-- Available row — drag to book -->
					<tr class="border-b border-border/40">
						<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
							Available
						</td>
						{#each data.dates as iso, i}
							{@const cell = propAri[rt.id]?.[iso]}
							{@const dState = cellDragState(rt.id, prop.id, i)}
							{@const wState = cellDrawState(rt.id, prop.id, i)}
							{@const sel = drawSel.selections.find(s => s.rowId === rt.id)}
							{@const inSel = sel && i >= sel.minCol && i <= sel.maxCol}
					<td style="width:{COL_W}px"
						class={['border-r border-border/40 px-0.5 py-1.5 text-center transition-colors cursor-crosshair',
							dState === 'selected' ? 'bg-teal-100' : dState === 'conflict' ? 'bg-red-100' :
							cellEditState(rt.id, i) ? 'bg-blue-100/60 ring-1 ring-inset ring-blue-300' :
							wState === 'drawing' ? 'bg-orange-100' : wState === 'drawing-conflict' ? 'bg-red-100' :
							inSel ? 'bg-orange-100 ring-1 ring-inset ring-orange-400' : (cell ? cellBg(iso, cell) : '')
						].join(' ')}
						onmousedown={(e) => onAvailMouseDown(e, rt.id, i)}
						onmouseenter={() => onAvailMouseEnter(rt.id, i)}
						ontouchstart={(e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }}
						ontouchend={(e) => {
							const t = e.changedTouches[0];
							if (Math.abs(t.clientX - touchStartX) < 10 && Math.abs(t.clientY - touchStartY) < 10) {
								e.preventDefault();
								openPopover(rt.id, iso);
							}
						}}
						title="Click = info & book · drag = multi-night"
					>
				{#if cell}
					{#if inSel}
						<span class="text-[10px] font-bold text-orange-700">✓</span>
					{:else}
						<span class={availClass(cell)}>{cell.stopSell ? 'STOP' : cell.available}</span>
					{/if}
				{:else}
					<span class="text-muted-foreground">—</span>
				{/if}
						</td>
						{/each}
					</tr>

			<!-- Sellable row — drag to bulk-edit availability -->
			{#if visibleRows.sellable}
			<tr class="border-b border-border/40 hover:bg-muted/5">
			<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
					Sellable
				</td>
				{#each data.dates as iso, i}
					{@const cell = propAri[rt.id]?.[iso]}
					{@const acDragSel = dragSel.range?.rowId === rt.id && i >= (dragSel.range?.minCol ?? -1) && i <= (dragSel.range?.maxCol ?? -1) && dragRowType === 'avail'}
					{@const ceiling = cell?.availabilityOverride ?? cell?.totalRooms ?? null}
					<td style="width:{COL_W}px"
						class={['border-r border-border/40 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40',
							acDragSel ? 'bg-teal-100 ring-1 ring-inset ring-teal-400' :
							cell?.availabilityOverride != null ? 'bg-teal-50' : ''
						].join(' ')}
						onmousedown={(e) => { e.preventDefault(); dragMoved = false; dragRowType = 'avail'; dragSel.start(rt.id, i); }}
						onmouseenter={() => { if (dragRowType === 'avail') onRestrictMouseEnter(rt.id, i); }}
						onclick={(e) => { if (!dragMoved) startFloatingEdit('availCap', rt.id, iso, cell?.availabilityOverride ?? cell?.totalRooms ?? null, '', e, cell?.totalRooms, cell?.availabilityOverride != null); }}
					>
						{#if ceiling != null}
							<span class={['font-mono leading-none', cell?.availabilityOverride != null ? 'font-semibold text-teal-700' : 'text-muted-foreground/60'].join(' ')}>{ceiling}</span>
						{:else}
							<span class="text-[9px] text-muted-foreground/30 leading-none">—</span>
						{/if}
						</td>
					{/each}
				</tr>
			{/if}

			<!-- Booked row — read-only, shows rooms currently booked -->
			{#if visibleRows.booked}
			<tr class="border-b border-border/40 hover:bg-muted/5">
				<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
					Booked
				</td>
				{#each data.dates as iso, i}
					{@const cell = propAri[rt.id]?.[iso]}
					{@const booked = cell ? cell.totalRooms - cell.physicalAvailable : 0}
					<td style="width:{COL_W}px"
						class="border-r border-border/40 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40"
						onclick={() => openPopover(rt.id, iso)}
						title="Click to see who's booked"
					>
						{#if cell}
							<span class={['font-mono leading-none', booked > 0 ? 'font-semibold text-orange-700' : 'text-muted-foreground/30'].join(' ')}>{booked}</span>
						{:else}
							<span class="text-muted-foreground/30">—</span>
						{/if}
					</td>
				{/each}
			</tr>
			{/if}

			<!-- Rate row -->
					<tr class="border-b border-border/40 hover:bg-muted/5">
					<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
						Rate / night
					</td>
					{#each data.dates as iso, i}
						{@const cell = propAri[rt.id]?.[iso]}
						{@const rDragSel = dragSel.range?.rowId === rt.id && i >= (dragSel.range?.minCol ?? -1) && i <= (dragSel.range?.maxCol ?? -1)}
						<td style="width:{COL_W}px"
							class={['border-r border-border/40 px-0.5 py-1.5 text-center transition-colors cursor-pointer',
								rDragSel ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : (cell ? cellBg(iso, cell) : ''),
								'hover:bg-muted/40'
							].join(' ')}
							onmousedown={(e) => { e.preventDefault(); dragMoved = false; dragRowType = 'rate'; dragSel.start(rt.id, i); }}
							onmouseenter={() => onRestrictMouseEnter(rt.id, i)}
						onclick={(e) => { if (!dragMoved) startFloatingEdit('rate', rt.id, iso, cell?.overrideRateCents ?? null, cell?.baseRateCents ? `Season ${fmt(cell.baseRateCents)}` : '', e); }}
						ontouchstart={(e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }}
						ontouchend={(e) => { const t = e.changedTouches[0]; if (Math.abs(t.clientX - touchStartX) < 10 && Math.abs(t.clientY - touchStartY) < 10) { e.preventDefault(); openPopover(rt.id, iso, undefined, 'rate'); } }}
					>
						{#if cell}
							<span class={['font-mono', cell.overrideRateCents != null ? 'text-blue-700 font-bold' : ''].join(' ')} style={cell.seasonColour && !cell.overrideRateCents ? `color:${cell.seasonColour}; filter:brightness(0.6)` : ''}>
								{fmt(cell.effectiveRateCents)}
							</span>
							{#if cell.overrideRateCents != null}
								<div class="text-muted-foreground line-through leading-none">{fmt(cell.baseRateCents)}</div>
							{/if}
						{:else}<span class="text-muted-foreground">—</span>{/if}
					</td>
					{/each}
				</tr>

				<!-- Min Stay row -->
				{#if visibleRows.minStay}
				<tr class="border-b border-border/40 hover:bg-muted/5">
				<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
					Min Stay
				</td>
					{#each data.dates as iso, i}
						{@const cell = propAri[rt.id]?.[iso]}
						{@const msDragSel = dragSel.range?.rowId === rt.id && i >= (dragSel.range?.minCol ?? -1) && i <= (dragSel.range?.maxCol ?? -1) && dragRowType === 'minStay'}
						<td style="width:{COL_W}px"
							class={['border-r border-border/40 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40',
								msDragSel ? 'bg-amber-100 ring-1 ring-inset ring-amber-300' : (cell ? cellBg(iso, cell) : '')
							].join(' ')}
							onmousedown={(e) => { e.preventDefault(); dragMoved = false; dragRowType = 'minStay'; dragSel.start(rt.id, i); }}
							onmouseenter={() => { if (dragRowType === 'minStay') onRestrictMouseEnter(rt.id, i); }}
							onclick={(e) => { if (!dragMoved) startFloatingEdit('minStay', rt.id, iso, cell?.overrideMinNights ?? null, `Base: ${cell?.baseMinNights ?? 1}n`, e); }}
						>
							{#if cell}
								<span class={['font-mono leading-none', cell.minNights > 1 ? 'font-semibold text-amber-700' : 'text-muted-foreground/50'].join(' ')}>{cell.minNights}n</span>
							{:else}<span class="text-muted-foreground/30">—</span>{/if}
						</td>
					{/each}
				</tr>
				{/if}

				<!-- CTA row -->
				{#if visibleRows.cta}
				<tr class="border-b border-border/40 hover:bg-muted/5">
				<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
					CTA
				</td>
					{#each data.dates as iso, i}
						{@const cell = propAri[rt.id]?.[iso]}
						{@const ctaDragSel = dragSel.range?.rowId === rt.id && i >= (dragSel.range?.minCol ?? -1) && i <= (dragSel.range?.maxCol ?? -1) && dragRowType === 'cta'}
						<td style="width:{COL_W}px"
							class={['border-r border-border/40 px-0.5 py-1 text-center cursor-pointer transition-colors',
								ctaDragSel ? 'bg-red-100 ring-1 ring-inset ring-red-300' :
								cell?.closedToArrival ? 'bg-red-50' : 'hover:bg-muted/40'
							].join(' ')}
							onmousedown={(e) => { e.preventDefault(); dragMoved = false; dragRowType = 'cta'; dragSel.start(rt.id, i); }}
							onmouseenter={() => { if (dragRowType === 'cta') onRestrictMouseEnter(rt.id, i); }}
							onclick={() => { if (!dragMoved) toggleRestriction(rt.id, iso, 'cta', cell?.closedToArrival ?? false); }}
						>
						{#if cell?.closedToArrival}
							<span class="font-bold text-red-600 leading-none">CTA</span>
						{:else}
							<span class="text-muted-foreground/30 leading-none">—</span>
						{/if}
						</td>
					{/each}
				</tr>
				{/if}

				<!-- CTD row -->
				{#if visibleRows.ctd}
				<tr class="border-b-2 border-border hover:bg-muted/5">
				<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
					CTD
				</td>
					{#each data.dates as iso, i}
						{@const cell = propAri[rt.id]?.[iso]}
						{@const ctdDragSel = dragSel.range?.rowId === rt.id && i >= (dragSel.range?.minCol ?? -1) && i <= (dragSel.range?.maxCol ?? -1) && dragRowType === 'ctd'}
						<td style="width:{COL_W}px"
							class={['border-r border-border/40 px-0.5 py-1 text-center cursor-pointer transition-colors',
								ctdDragSel ? 'bg-orange-100 ring-1 ring-inset ring-orange-300' :
								cell?.closedToDeparture ? 'bg-orange-50' : 'hover:bg-muted/40'
							].join(' ')}
							onmousedown={(e) => { e.preventDefault(); dragMoved = false; dragRowType = 'ctd'; dragSel.start(rt.id, i); }}
							onmouseenter={() => { if (dragRowType === 'ctd') onRestrictMouseEnter(rt.id, i); }}
							onclick={() => { if (!dragMoved) toggleRestriction(rt.id, iso, 'ctd', cell?.closedToDeparture ?? false); }}
						>
						{#if cell?.closedToDeparture}
							<span class="font-bold text-orange-600 leading-none">CTD</span>
						{:else}
							<span class="text-muted-foreground/30 leading-none">—</span>
						{/if}
						</td>
					{/each}
				</tr>
				{/if}
					{:else}
						<tr>
							<td colspan={1 + data.dates.length} class="px-4 py-6 text-center text-muted-foreground text-sm">
								No room types for {prop.name}. <a href="/settings" class="text-primary underline">Go to Settings</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/each}
	</div>

	<!-- ── Draw selection bar ─────────────────────────────────────────────────── -->
	{#if drawSel.selections.length > 0}
		<div class="sticky bottom-0 z-30 border-t border-orange-200 bg-orange-50 px-4 py-2 flex flex-wrap items-center gap-3">
			<span class="text-sm font-semibold text-orange-800">{drawSel.selections.length} type{drawSel.selections.length === 1 ? '' : 's'} selected</span>
			<div class="flex flex-wrap gap-1.5">
				{#each drawSel.selections as sel}
					<span class="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs text-orange-700">
						{sel.extra.roomTypeName}
						<span class="text-orange-400 text-[10px]">{data.dates[sel.minCol]?.slice(5)} – {data.dates[sel.maxCol]?.slice(5)}</span>
						<button onclick={() => drawSel.remove(sel.rowId)} class="text-orange-400 hover:text-orange-700">×</button>
					</span>
				{/each}
			</div>
			<div class="ml-auto flex gap-2">
				<button onclick={() => drawSel.clear()} class="text-xs text-orange-600 hover:text-orange-800">Clear</button>
				<button onclick={bookDrawSelections} class="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
					Book {drawSel.selections.length} type{drawSel.selections.length === 1 ? '' : 's'} →
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- ── Cell Info & Override Popover ──────────────────────────────────────────── -->
{#if popoverCell}
	{@const allAri = Object.values(data.propData).reduce((a, p) => ({ ...a, ...p.ariData }), {} as Record<string, Record<string, ARICell>>)}
	{@const cell = allAri[popoverCell.roomTypeId]?.[popoverCell.date]}
	{@const overrideCell = allAri[popoverCell.roomTypeId]?.[overrideDate]}
	{@const allRts = data.propertiesList.flatMap(p => data.propData[p.id]?.roomTypesList ?? [])}
	{@const rt = allRts.find(r => r.id === popoverCell?.roomTypeId)}
	{@const popNights = Math.round((new Date(popoverCheckOut + 'T12:00:00').getTime() - new Date(popoverCell.date + 'T12:00:00').getTime()) / 86400000)}
	{@const multiNight = popNights > 1}
	{@const rtAri = allAri[popoverCell.roomTypeId] ?? {}}
	{@const totalCents = nightDates.reduce((s, d) => { const nc = rtAri[d]; return s + (nc?.overrideRateCents ?? nc?.baseRateCents ?? 0); }, 0)}
	<div class="fixed z-30 rounded-xl border border-border bg-background shadow-xl w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto" style="top:50%;left:50%;transform:translate(-50%,-50%)" role="dialog" aria-label="Cell info">

		<!-- Header -->
		<div class="px-4 pt-4 pb-3 flex items-start justify-between border-b border-border">
			<div>
				<p class="font-semibold text-sm">{rt?.name}</p>
				<p class="text-xs text-muted-foreground">
					{#if multiNight}
						{new Date(popoverCell.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
						–
						{new Date(new Date(popoverCheckOut + 'T12:00:00').getTime() - 86400000).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
						· {popNights} nights
					{:else}
						{new Date(popoverCell.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
					{/if}
					{#if cell?.totalRooms} · {cell.available} avail{#if cell.totalRooms - cell.physicalAvailable > 0}, {cell.totalRooms - cell.physicalAvailable} booked{/if}{/if}
				</p>
			</div>
			<button onclick={closePopover} class="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0">×</button>
		</div>

	<!-- ── New Booking CTA (full width) ───────────────────────────────────── -->
		{#if mode === 'book'}
		<div class="px-4 pt-3 pb-2">
			{#if (cell?.available ?? 0) > 0 && !cell?.stopSell}
				<button
					onclick={() => {
						openBookingCard(popoverCell!.roomTypeId, rt?.name ?? '', popoverCell!.date, popoverCheckOut, popoverPropId, popoverPropName);
						closePopover();
					}}
					class="w-full rounded-lg bg-green-600 text-white py-2 text-sm font-semibold hover:bg-green-700 transition-colors"
				>+ New Booking{multiNight ? ` · ${popNights} nights` : ''}</button>
			{:else if cell?.stopSell}
				<div class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-center justify-between gap-2">
					<p class="text-sm text-red-700 font-medium">Stop sell active</p>
					<button
						onclick={() => { removeStopSell(popoverCell!.roomTypeId, popoverCell!.date); closePopover(); }}
						class="text-xs text-red-600 font-semibold hover:underline shrink-0"
					>Remove →</button>
				</div>
			{:else}
				<p class="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">No availability — increase via the Sellable row.</p>
			{/if}
		</div>
	{/if}

		<!-- ── Two-column body: Rates (left) + Occupancy (right) ──────────────── -->
		<div class="grid grid-cols-2 gap-0 px-4 pb-3 divide-x divide-border">

			<!-- Left: Rates -->
			<div class="pr-3 space-y-1 min-w-0">
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
					{multiNight ? 'Rates' : 'Rate'}
				</p>
				{#if multiNight}
					<div class="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
						{#each nightDates as d}
							{@const nc = rtAri[d]}
							{@const isEditing = d === overrideDate}
							<button type="button" onclick={() => selectOverrideDate(d)}
								class={['flex items-center justify-between w-full text-left rounded px-1.5 py-1 text-xs transition-colors',
									isEditing ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted/60'].join(' ')}>
								<span class={['truncate mr-1', isEditing ? 'font-semibold' : 'text-muted-foreground'].join(' ')}>
									{new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
								</span>
								<span class="flex items-center gap-1 shrink-0">
									{#if nc?.overrideRateCents != null}
										<span class="text-amber-700 font-semibold">{fmt(nc.overrideRateCents)}</span>
										<span class="text-muted-foreground/60 line-through text-[10px]">{fmt(nc.baseRateCents ?? null)}</span>
									{:else if nc?.baseRateCents}
										<span class={isEditing ? 'font-semibold' : ''}>{fmt(nc.baseRateCents)}</span>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
									{#if nc?.hasOverride}<span class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Has override"></span>{/if}
								</span>
							</button>
						{/each}
					</div>
					{#if totalCents > 0}
						<div class="flex justify-between text-xs pt-1.5 border-t border-border font-medium">
							<span class="text-muted-foreground">Est. total</span>
							<span>{fmt(totalCents)}</span>
						</div>
					{/if}
				{:else}
					<!-- Single night: just show the rate -->
					<p class="text-sm font-medium">
						{#if cell?.overrideRateCents != null}
							<span class="text-amber-700">{fmt(cell.overrideRateCents)}</span>
							<span class="text-muted-foreground line-through text-xs ml-1">{fmt(cell.baseRateCents ?? null)}</span>
						{:else if cell?.baseRateCents}
							{fmt(cell.baseRateCents)}
						{:else}
							<span class="text-muted-foreground">—</span>
						{/if}
					</p>
					{#if cell?.minNights > 1}
						<p class="text-[10px] text-amber-700">{cell.minNights}n minimum</p>
					{/if}
				{/if}
			</div>

			<!-- Right: Occupancy -->
			<div class="pl-3 space-y-2 min-w-0">
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Occupancy</p>
				{#if cellOccupancyLoading}
					<p class="text-xs text-muted-foreground animate-pulse">Loading…</p>
				{:else if cellCheckingIn.length || cellCheckingOut.length || cellStayingThrough > 0}
					<div class="max-h-52 overflow-y-auto space-y-2 pr-0.5 text-xs">
						{#if cellCheckingIn.length}
							<div>
								<p class="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-0.5">In ({cellCheckingIn.length})</p>
								{#each cellCheckingIn as g}
									<button type="button" onclick={() => { openBookingDetail(g.id); closePopover(); }}
										class="flex items-center gap-1 w-full text-left py-0.5 hover:text-primary transition-colors min-w-0">
										<span class="text-muted-foreground shrink-0">→</span>
										<span class="font-medium truncate">{g.guestName}</span>
										<span class="text-muted-foreground shrink-0 text-[10px]">{g.roomNumber ? `Rm${g.roomNumber}` : 'unassigned'}</span>
									</button>
								{/each}
							</div>
						{/if}
						{#if cellCheckingOut.length}
							<div>
								<p class="text-[10px] font-semibold text-orange-700 uppercase tracking-wide mb-0.5">Out ({cellCheckingOut.length})</p>
								{#each cellCheckingOut as g}
									<button type="button" onclick={() => { openBookingDetail(g.id); closePopover(); }}
										class="flex items-center gap-1 w-full text-left py-0.5 hover:text-primary transition-colors min-w-0">
										<span class="text-muted-foreground shrink-0">←</span>
										<span class="font-medium truncate">{g.guestName}</span>
										{#if g.roomNumber}<span class="text-muted-foreground shrink-0 text-[10px]">Rm{g.roomNumber}</span>{/if}
									</button>
								{/each}
							</div>
						{/if}
						{#if cellStayingThrough > 0}
							<p class="text-muted-foreground text-[10px]">{cellStayingThrough} staying through</p>
						{/if}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No guests</p>
				{/if}
			</div>
		</div>

		<!-- ── Footer: Bulk edit link ─────────────────────────────────────────── -->
		<div class="border-t border-border px-4 py-2 flex justify-end">
			<button
				type="button"
				onclick={openBulkFromPopover}
				class="text-[11px] text-primary hover:underline underline-offset-2"
			>Bulk edit multiple dates →</button>
		</div>
	</div>
{/if}

<!-- ── Floating Edit Overlay (Rate / Avail Cap / Min Stay) ──────────────── -->
{#if floatingEdit}
	{@const fe = floatingEdit}
	{@const label = fe.type === 'rate' ? 'Rate/night' : fe.type === 'availCap' ? 'Sellable' : 'Min stay'}
	{@const accent = fe.type === 'rate' ? 'border-blue-500' : fe.type === 'availCap' ? 'border-teal-500' : 'border-amber-500'}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="fixed inset-0 z-40" onclick={() => commitFloatingEdit()}></div>
	<div
		style="position:fixed; left:{fe.cx}px; top:{fe.cy - 6}px; transform:translate(-50%,-100%); z-index:50;"
		class="bg-background border border-border rounded-xl shadow-2xl p-3 w-36 pointer-events-auto"
	>
		<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
		{#if fe.contextLabel}
			<p class="text-[9px] text-muted-foreground mb-1.5">{fe.contextLabel}</p>
		{/if}
		<div class="flex items-center gap-1">
			{#if fe.type === 'rate'}<span class="text-xs text-muted-foreground">$</span>{/if}
			<input
				type="number"
				min={fe.type === 'minStay' ? 1 : 0}
				step={fe.type === 'rate' ? 1 : 1}
				value={fe.value}
				oninput={(e) => { if (floatingEdit) floatingEdit.value = (e.target as HTMLInputElement).value; }}
				onblur={commitFloatingEdit}
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.preventDefault(); commitFloatingEdit(); }
					if (e.key === 'Escape') { floatingEdit = null; }
				}}
				use:focusOnMount
			placeholder="—"
			class={['flex-1 min-w-0 rounded border text-center text-sm font-mono bg-background px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring', accent].join(' ')}
		/>
		{#if fe.type === 'minStay'}<span class="text-xs text-muted-foreground shrink-0">n</span>{/if}
	</div>
	<div class="flex justify-end mt-1.5">
		{#if fe.type === 'availCap' && fe.hasOverride && fe.resetTo != null}
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => { if (floatingEdit) { floatingEdit.value = ''; commitFloatingEdit(); } }}
				class="text-[9px] text-destructive hover:underline shrink-0"
			>Reset to {fe.resetTo} ✕</button>
		{:else if fe.value}
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => { if (floatingEdit) { floatingEdit.value = ''; commitFloatingEdit(); } }}
				class="text-[9px] text-destructive hover:underline shrink-0"
			>Clear ✕</button>
		{/if}
	</div>
	</div>
{/if}

<!-- ── Bulk Edit Side Panel ──────────────────────────────────────────────── -->
{#if editRange}
	<div class="fixed right-0 top-14 bottom-0 w-80 z-30 border-l border-border bg-background shadow-xl overflow-hidden flex flex-col">
		<!-- Header -->
		<div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-blue-600 text-white">
			<div class="flex-1 min-w-0">
				<p class="font-semibold text-sm">Bulk Edit</p>
				<p class="text-xs opacity-80 truncate">{editRange.roomTypeName}</p>
			</div>
			<button onclick={() => editRange = null} class="opacity-70 hover:opacity-100 text-xl leading-none">×</button>
		</div>

		<!-- Date range summary -->
		<div class="px-4 py-2.5 bg-blue-50 border-b border-border text-sm">
			<span class="text-muted-foreground text-xs">Range:</span>
			<span class="font-medium ml-1">{data.dates[editRange.minCol]}</span>
			{#if editRange.minCol !== editRange.maxCol}
				<span class="text-muted-foreground"> → </span>
				<span class="font-medium">{data.dates[editRange.maxCol]}</span>
			{/if}
			<span class="text-xs text-muted-foreground ml-1">({editRange.maxCol - editRange.minCol + 1}d)</span>
		</div>

		<!-- Form body -->
		<div class="flex-1 overflow-y-auto px-4 py-4 space-y-5">
			<!-- Apply to -->
			<div>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Apply to</p>
				<div class="flex gap-4 text-sm">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={bulkApplyTo} value="roomType" class="h-3.5 w-3.5" />
						<span>This room type</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={bulkApplyTo} value="property" class="h-3.5 w-3.5" />
						<span>All room types</span>
					</label>
				</div>
			</div>

			<!-- Day of week filter -->
			<div>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Days of week</p>
				<div class="flex gap-1">
					{#each ['Su','Mo','Tu','We','Th','Fr','Sa'] as dow, i}
						<button onclick={() => bulkDOW[i] = !bulkDOW[i]}
							class={['flex-1 rounded py-1.5 text-[11px] font-medium border transition-colors',
								bulkDOW[i] ? 'bg-blue-600 text-white border-blue-600' : 'bg-background text-muted-foreground border-input hover:bg-muted'
							].join(' ')}
						>{dow}</button>
					{/each}
				</div>
			</div>

			<!-- Rate -->
			<div class={['border-l-2 pl-3 -ml-1 transition-colors', editRangeFocus === 'rate' ? 'border-blue-500' : 'border-transparent'].join(' ')}>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rate</p>
				<div class="space-y-2 text-sm">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={bulkRateMode} value="none" class="h-3.5 w-3.5" />
						<span>No change</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={bulkRateMode} value="set" class="h-3.5 w-3.5" />
						<span>Set to</span>
						{#if bulkRateMode === 'set'}
							<div class="flex items-center gap-1">
								<span class="text-muted-foreground">$</span>
								<input type="number" min="0" step="1" bind:value={bulkRateValue} placeholder="0"
									class="w-20 rounded border border-input px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
							</div>
						{/if}
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" bind:group={bulkRateMode} value="increase_pct" class="h-3.5 w-3.5" />
						<span>Adjust by</span>
						{#if bulkRateMode === 'increase_pct'}
							<div class="flex items-center gap-1">
								<input type="number" min="-99" max="500" step="1" bind:value={bulkRateValue} placeholder="0"
									class="w-16 rounded border border-input px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
								<span class="text-muted-foreground text-xs">%</span>
							</div>
						{/if}
					</label>
				</div>
			</div>

			<!-- Min nights -->
			<div class={['border-l-2 pl-3 -ml-1 transition-colors', editRangeFocus === 'minStay' ? 'border-amber-500' : 'border-transparent'].join(' ')}>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Min nights</p>
				<input type="number" min="1" max="30" bind:value={bulkMinNights} placeholder="No change"
					class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
			</div>

			<!-- Availability override -->
			<div class={['border-l-2 pl-3 -ml-1 transition-colors', editRangeFocus === 'avail' ? 'border-teal-500' : 'border-transparent'].join(' ')}>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Selling availability</p>
				<p class="text-[10px] text-muted-foreground mb-1.5">Cap rooms offered online (OTA allotment). Empty = no change.</p>
				<div class="flex gap-2 items-center">
					<input type="number" min="0" bind:value={bulkAvailOverride} placeholder="No change"
						class="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
						disabled={bulkAvailOverride === 'clear'} />
					<button onclick={() => bulkAvailOverride = bulkAvailOverride === 'clear' ? '' : 'clear'}
						class={['rounded border px-2 py-1.5 text-xs font-medium transition-colors', bulkAvailOverride === 'clear' ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'border-input text-muted-foreground hover:bg-muted'].join(' ')}
						title="Remove cap — restore to computed availability"
					>{bulkAvailOverride === 'clear' ? 'Clearing…' : 'Clear cap'}</button>
				</div>
			</div>

			<!-- Restrictions -->
			<div class={['border-l-2 pl-3 -ml-1 transition-colors', editRangeFocus === 'cta' || editRangeFocus === 'ctd' ? 'border-red-400' : 'border-transparent'].join(' ')}>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Restrictions</p>
				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span>Stop Sell</span>
						<select bind:value={bulkStopSell} class="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
							<option value="no_change">No change</option>
							<option value="enable">Enable</option>
							<option value="disable">Disable</option>
						</select>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span>CTA <span class="text-muted-foreground text-xs">(no arrivals)</span></span>
						<select bind:value={bulkCTA} class="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
							<option value="no_change">No change</option>
							<option value="enable">Enable</option>
							<option value="disable">Disable</option>
						</select>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span>CTD <span class="text-muted-foreground text-xs">(no departures)</span></span>
						<select bind:value={bulkCTD} class="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
							<option value="no_change">No change</option>
							<option value="enable">Enable</option>
							<option value="disable">Disable</option>
						</select>
					</div>
				</div>
			</div>
		</div>

		<!-- Footer -->
		<div class="border-t border-border px-4 py-3 space-y-2.5">
			<p class="text-xs text-muted-foreground">{bulkCount} cell{bulkCount === 1 ? '' : 's'} will be updated</p>
			<div class="flex gap-2">
				<button onclick={() => editRange = null}
					class="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
				<button onclick={applyBulkEdit} disabled={bulkSaving || bulkCount === 0}
					class="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">{bulkSaving ? 'Applying…' : 'Apply'}</button>
			</div>
			<p class="text-[10px] text-muted-foreground text-center">Syncs to Channex automatically</p>
		</div>
	</div>
{/if}

<!-- Legend is now in the ⚙ Display popover -->

<!-- Booking Card (single selection or existing booking detail) -->
<BookingCard
	bind:open={cardOpen}
	newBooking={cardNewBooking ?? undefined}
	bookingId={cardBookingId ?? undefined}
	channels={data.channels}
	users={data.users}
	currentUserId={data.currentUserId}
	{today}
	propertyName={cardNewBooking?.propertyName}
/>

<!-- Room Assignment Dialog (multi-selection step 1) -->
<RoomAssignmentDialog
	bind:open={assignOpen}
	selections={assignSelections}
	onConfirm={onRoomsAssigned}
/>

<!-- Group Card (multi-selection step 2) -->
<GroupCard
	bind:open={groupOpen}
	newRooms={groupNewRooms.length ? groupNewRooms : undefined}
	channels={data.channels}
	users={data.users}
	currentUserId={data.currentUserId}
	{today}
/>
