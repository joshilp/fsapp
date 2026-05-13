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
	let mode      = $state<'book' | 'edit' | 'group'>('book');
	let dragMoved = $state(false);
	let legendOpen = $state(false);

	function setMode(m: 'book' | 'edit' | 'group') {
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
	let bulkStopSell  = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkCTA       = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkCTD       = $state<'no_change' | 'enable' | 'disable'>('no_change');
	let bulkApplyTo   = $state<'roomType' | 'property'>('roomType');
	let bulkSaving    = $state(false);

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
		if (mode !== 'edit' || !editRange) return false;
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
		if (mode === 'edit') {
			if (!dragSel.active) return;
			const r = dragSel.range;
			const prop = r ? findRtProp(r.rowId) : null;
			dragSel.cancel();
			if (!r || !prop) return;
			const rt = data.propData[prop.id]?.roomTypesList.find((x) => x.id === r.rowId);
			if (rt) {
				editRange = { roomTypeId: r.rowId, roomTypeName: rt.name, propertyId: prop.id, propertyName: prop.name, minCol: r.minCol, maxCol: r.maxCol };
				bulkRateMode = 'none'; bulkRateValue = ''; bulkMinNights = '';
				bulkStopSell = 'no_change'; bulkCTA = 'no_change'; bulkCTD = 'no_change';
				bulkDOW = [true, true, true, true, true, true, true];
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
		if (hasConflict) { conflictMessage = 'No availability for part of that range.'; setTimeout(() => (conflictMessage = ''), 3000); return; }
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
	let editStopSell = $state(false);
	let editCTA      = $state(false);
	let editCTD      = $state(false);
	let savingCell   = $state(false);
	let overrideDate = $state('');   // which night's override is being edited (may differ from check-in when multi-night)

	// Array of ISO dates for each night in the selected range (check-in inclusive, check-out exclusive)
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
		editStopSell = c?.stopSell ?? false;
		editCTA      = c?.closedToArrival ?? false;
		editCTD      = c?.closedToDeparture ?? false;
	}
	function closePopover() { popoverCell = null; }

	// Touch helpers — track touchstart position to distinguish tap from scroll
	let touchStartX = 0;
	let touchStartY = 0;

	async function saveOverride() {
		if (!popoverCell) return;
		savingCell = true;
		try {
			const res = await fetch('/api/ari/override', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomTypeId: popoverCell.roomTypeId, date: overrideDate, rateCents: editRate ? Math.round(parseFloat(editRate) * 100) : null, minNights: editMin ? parseInt(editMin) : null, stopSell: editStopSell, closedToArrival: editCTA, closedToDeparture: editCTD }) });
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

	const COL_W = 46;
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
	<div class="sticky top-14 z-10 border-b bg-background/95 backdrop-blur">
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

			<!-- Layout toggle -->
			<button onclick={toggleLayout}
				class="rounded border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
				title={layoutMode === 'single' ? 'Show all properties stacked' : 'Show one property at a time'}
			>{layoutMode === 'single' ? '⊞ Stack' : '⊟ Single'}</button>

			<!-- Date navigation -->
			<div class="flex items-center gap-1 rounded-lg border px-1 text-xs">
				<button onclick={prevWindow} class="px-2 py-1 hover:bg-muted rounded disabled:opacity-40" disabled={data.from <= today}>← {data.window}d</button>
				<span class="px-2 text-muted-foreground font-mono">
					{new Date(data.from + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – {new Date(data.to + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
				</span>
				<button onclick={nextWindow} class="px-2 py-1 hover:bg-muted rounded">{data.window}d →</button>
			</div>

			<!-- Mode segmented control -->
			<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium">
				<button onclick={() => setMode('book')} class={['px-2.5 py-1 border-r border-input transition-colors', mode === 'book' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}>Book</button>
				<button onclick={() => setMode('edit')} class={['px-2.5 py-1 border-r border-input transition-colors', mode === 'edit' ? 'bg-blue-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}>✎ Rates</button>
				<button onclick={() => setMode('group')} class={['px-2.5 py-1 transition-colors', mode === 'group' ? 'bg-orange-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'].join(' ')}>Group</button>
			</div>

			<!-- Sync Channex -->
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

			<button onclick={() => legendOpen = !legendOpen}
				class={['ml-auto rounded border px-2 py-1 text-xs font-medium transition-colors', legendOpen ? 'bg-foreground text-background border-foreground' : 'border-input text-muted-foreground hover:bg-muted'].join(' ')}>Legend</button>
		</div>
	</div>

	<!-- ── Grid(s) ───────────────────────────────────────────────────────────── -->
	<div class="flex-1 overflow-auto">
		{#each visibleProps as prop}
			{@const propRoomTypes = data.propData[prop.id]?.roomTypesList ?? []}
			{@const propAri = data.propData[prop.id]?.ariData ?? {}}

			{#if layoutMode === 'stacked' && visibleProps.length > 1}
				<!-- Property divider in stacked mode -->
				<div class="sticky top-0 z-20 bg-muted/80 border-b-2 border-border px-4 py-1.5 flex items-center gap-2 backdrop-blur">
					<span class="font-semibold text-sm">{prop.name}</span>
					<span class="text-xs text-muted-foreground">{propRoomTypes.length} room type{propRoomTypes.length === 1 ? '' : 's'}</span>
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
						<tr class="border-b border-border/20">
							<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
								Available
								<div class="text-[8px] normal-case font-normal opacity-60 mt-0.5">{mode === 'edit' ? 'drag to edit' : 'drag to book'}</div>
							</td>
							{#each data.dates as iso, i}
								{@const cell = propAri[rt.id]?.[iso]}
								{@const dState = cellDragState(rt.id, prop.id, i)}
								{@const wState = cellDrawState(rt.id, prop.id, i)}
								{@const sel = drawSel.selections.find(s => s.rowId === rt.id)}
								{@const inSel = sel && i >= sel.minCol && i <= sel.maxCol}
						<td style="width:{COL_W}px"
							class={['border-r border-border/20 px-0.5 py-1.5 text-center transition-colors',
								mode === 'edit' ? 'cursor-pointer' : 'cursor-crosshair',
								dState === 'selected' ? (mode === 'edit' ? 'bg-blue-100' : 'bg-teal-100') : dState === 'conflict' ? 'bg-red-100' :
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
											<div class="text-[8px] text-muted-foreground leading-none">/{cell.totalRooms}</div>
										{/if}
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</td>
							{/each}
						</tr>

						<!-- Rate row -->
						<tr class="border-b border-border/20 hover:bg-muted/5">
							<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">Rate / night</td>
							{#each data.dates as iso}
								{@const cell = propAri[rt.id]?.[iso]}
								<td style="width:{COL_W}px" class={['border-r border-border/20 px-0.5 py-1.5 text-center cursor-pointer transition-colors hover:bg-muted/40', cell ? cellBg(iso, cell) : ''].join(' ')} onclick={() => openPopover(rt.id, iso, undefined, 'rate')}>
									{#if cell}
										<span class={['font-mono text-[11px]', cell.overrideRateCents != null ? 'text-blue-700 font-bold' : ''].join(' ')} style={cell.seasonColour && !cell.overrideRateCents ? `color:${cell.seasonColour}; filter:brightness(0.6)` : ''}>
											{fmt(cell.effectiveRateCents)}
										</span>
										{#if cell.overrideRateCents != null}
											<div class="text-[8px] text-muted-foreground line-through leading-none">{fmt(cell.baseRateCents)}</div>
										{/if}
									{:else}<span class="text-muted-foreground">—</span>{/if}
								</td>
							{/each}
						</tr>

						<!-- Restrictions row -->
						<tr class="border-b-2 border-border hover:bg-muted/5">
							<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">Min / Flags</td>
							{#each data.dates as iso}
								{@const cell = propAri[rt.id]?.[iso]}
								<td style="width:{COL_W}px" class={['border-r border-border/20 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40', cell ? cellBg(iso, cell) : ''].join(' ')} onclick={() => openPopover(rt.id, iso, undefined, 'rate')}>
									{#if cell}
										<div class="flex flex-col items-center gap-0.5">
											<span class={['text-[9px] leading-none', cell.minNights > 1 ? 'font-medium text-amber-700' : 'text-muted-foreground/50'].join(' ')}>{cell.minNights}n</span>
											<div class="flex gap-0.5">
												{#if cell.closedToArrival}<span class="text-[8px] text-red-600 font-bold" title="Closed to arrival">CTA</span>{/if}
												{#if cell.closedToDeparture}<span class="text-[8px] text-orange-600 font-bold" title="Closed to departure">CTD</span>{/if}
											</div>
										</div>
									{:else}<span class="text-muted-foreground">—</span>{/if}
								</td>
							{/each}
						</tr>
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
					{#if cell?.totalRooms} · {cell.available}/{cell.totalRooms} avail{/if}
				</p>
			</div>
			<button onclick={closePopover} class="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0">×</button>
		</div>

	<!-- ── New Booking CTA (full width) ───────────────────────────────────── -->
	{#if popoverSource === 'avail' && mode === 'book'}
		<div class="px-4 pt-3 pb-2">
			{#if (cell?.available ?? 0) > 0 && !cell?.stopSell}
				<button
					onclick={() => {
						openBookingCard(popoverCell!.roomTypeId, rt?.name ?? '', popoverCell!.date, popoverCheckOut, popoverPropId, popoverPropName);
						closePopover();
					}}
					class="w-full rounded-lg bg-green-600 text-white py-2 text-sm font-semibold hover:bg-green-700 transition-colors"
				>+ New Booking{multiNight ? ` · ${popNights} nights` : ''}</button>
			{:else}
				<p class="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
					{cell?.stopSell ? 'Stop sell active — edit restrictions below to re-open.' : 'No availability — edit restrictions or increase inventory.'}
				</p>
			{/if}
		</div>
	{/if}

		<!-- ── Two-column body: Rates (left) + Occupancy (right) ──────────────── -->
		<div class="grid grid-cols-2 gap-0 px-4 pb-3 divide-x divide-border">

			<!-- Left: Rates -->
			<div class="pr-3 space-y-1 min-w-0">
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
					{multiNight ? 'Rates · tap to override' : 'Rate'}
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

		<!-- ── Override (full width below columns) ────────────────────────────── -->
		<div class="border-t border-border px-4 py-3 space-y-3">
			<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
				{#if multiNight}
					Override · {new Date(overrideDate + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
				{:else}
					Rate & Restrictions Override
				{/if}
			</p>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-xs text-muted-foreground font-medium">Rate ($/night)</label>
					<div class="flex items-center gap-2 mt-1">
						<span class="text-sm text-muted-foreground">$</span>
						<input type="number" min="0" step="1" bind:value={editRate} placeholder={overrideCell?.baseRateCents ? String(overrideCell.baseRateCents / 100) : 'Season rate'} class="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
						{#if editRate}<button onclick={() => editRate = ''} class="text-xs text-muted-foreground hover:text-foreground">✕</button>{/if}
					</div>
					{#if overrideCell?.baseRateCents}<p class="text-[10px] text-muted-foreground mt-0.5">Season: {fmt(overrideCell.baseRateCents)}</p>{/if}
				</div>
				<div>
					<label class="text-xs text-muted-foreground font-medium">Min nights</label>
					<input type="number" min="1" max="30" bind:value={editMin} placeholder={String(overrideCell?.baseMinNights ?? 1)} class="mt-1 w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
				</div>
			</div>
			<div class="flex flex-wrap gap-x-4 gap-y-1.5">
				<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" bind:checked={editStopSell} class="h-4 w-4 rounded border-input" /><span class="text-sm">Stop sell</span></label>
				<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" bind:checked={editCTA} class="h-4 w-4 rounded border-input" /><span class="text-sm">CTA</span></label>
				<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" bind:checked={editCTD} class="h-4 w-4 rounded border-input" /><span class="text-sm">CTD</span></label>
			</div>
			<div class="flex gap-2">
				<button onclick={saveOverride} disabled={savingCell} class="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">{savingCell ? 'Saving…' : 'Save override'}</button>
				{#if overrideCell?.hasOverride}<button onclick={clearOverride} disabled={savingCell} class="rounded-lg border border-border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">Clear</button>{/if}
			</div>
			<p class="text-[10px] text-muted-foreground text-center">Changes sync to Channex automatically</p>
		</div>
	</div>
{/if}

<!-- ── Bulk Edit Side Panel ──────────────────────────────────────────────── -->
{#if mode === 'edit' && editRange}
	<div class="fixed right-0 top-14 bottom-0 w-80 z-30 border-l border-border bg-background shadow-xl overflow-hidden flex flex-col">
		<!-- Header -->
		<div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-blue-600 text-white">
			<div class="flex-1 min-w-0">
				<p class="font-semibold text-sm">Bulk Rate Edit</p>
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
			<div>
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
			<div>
				<p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Min nights</p>
				<input type="number" min="1" max="30" bind:value={bulkMinNights} placeholder="No change"
					class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
			</div>

			<!-- Restrictions -->
			<div>
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

<!-- ── Legend floating panel ──────────────────────────────────────────────── -->
{#if legendOpen}
	<div class="fixed bottom-4 right-4 z-40 rounded-lg border border-border bg-background shadow-xl p-4 w-64 text-xs">
		<div class="flex items-center justify-between mb-3">
			<p class="font-semibold text-sm">Legend</p>
			<button onclick={() => legendOpen = false} class="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
		</div>
		<div class="space-y-3">
			<div>
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Availability count</p>
				<div class="space-y-1">
					<div class="flex items-center gap-2"><span class="text-emerald-700 font-semibold w-8 text-center">2+</span><span>Available</span></div>
					<div class="flex items-center gap-2"><span class="text-amber-600 font-semibold w-8 text-center">1</span><span>Last room</span></div>
					<div class="flex items-center gap-2"><span class="text-red-500 font-semibold w-8 text-center">0</span><span>Sold out</span></div>
					<div class="flex items-center gap-2"><span class="text-red-700 font-bold w-8 text-center text-[10px]">STOP</span><span>Stop sell — closed online</span></div>
				</div>
			</div>
			<div>
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cell background</p>
				<div class="space-y-1">
					<div class="flex items-center gap-2"><span class="inline-block w-5 h-3.5 rounded-sm bg-red-50 border border-red-200"></span><span>Stop sell / sold out</span></div>
					<div class="flex items-center gap-2"><span class="inline-block w-5 h-3.5 rounded-sm bg-blue-50 border border-blue-200"></span><span>Rate override active</span></div>
					<div class="flex items-center gap-2"><span class="inline-block w-5 h-3.5 rounded-sm bg-amber-50 border border-amber-200"></span><span>Today</span></div>
				</div>
			</div>
			<div>
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Restriction flags</p>
				<div class="space-y-1">
					<div class="flex items-center gap-2"><span class="text-red-600 font-bold w-8">CTA</span><span>Closed to Arrival</span></div>
					<div class="flex items-center gap-2"><span class="text-orange-600 font-bold w-8">CTD</span><span>Closed to Departure</span></div>
				</div>
			</div>
			<div>
				<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Modes</p>
				<div class="space-y-1">
					<div class="flex items-center gap-2"><span class="font-medium bg-foreground text-background rounded px-1 py-0.5 text-[10px]">Book</span><span>Click/drag to book rooms</span></div>
					<div class="flex items-center gap-2"><span class="font-medium bg-blue-600 text-white rounded px-1 py-0.5 text-[10px]">✎ Rates</span><span>Click/drag to bulk edit rates</span></div>
					<div class="flex items-center gap-2"><span class="font-medium bg-orange-500 text-white rounded px-1 py-0.5 text-[10px]">Group</span><span>Drag across room types for group</span></div>
				</div>
			</div>
		</div>
	</div>
{/if}

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
