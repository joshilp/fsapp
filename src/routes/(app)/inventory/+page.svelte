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

	// ─── Drag-to-book ──────────────────────────────────────────────────────────
	const dragSel = new DragSelect();
	type InvDrawExtra = { roomTypeId: string; roomTypeName: string; propertyId: string; propertyName: string };
	const drawSel = new DrawSelect<InvDrawExtra>();
	let drawMode  = $state(false);
	let dragMoved = $state(false);

	function toggleDrawMode() { drawMode = !drawMode; if (!drawMode) drawSel.clear(); }

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
		if (!drawMode) return null;
		const r = drawSel.activeRange;
		if (!r || r.rowId !== roomTypeId || colIdx < r.minCol || colIdx > r.maxCol) return null;
		return hasConflictInRange(roomTypeId, propId, r.minCol, r.maxCol) ? 'drawing-conflict' : 'drawing';
	}

	function onAvailMouseDown(e: MouseEvent, roomTypeId: string, colIdx: number) {
		e.preventDefault(); dragMoved = false;
		if (drawMode) drawSel.startGesture(roomTypeId, colIdx);
		else dragSel.start(roomTypeId, colIdx);
	}

	function onAvailMouseEnter(roomTypeId: string, colIdx: number) {
		if (drawMode) {
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
		if (drawMode) {
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

	function openPopover(roomTypeId: string, checkIn: string, checkOut?: string) {
		if (!roomTypeId || !checkIn) return;
		const prop = findRtProp(roomTypeId);
		if (!prop) return;
		const ari = Object.values(data.propData).reduce<Record<string, Record<string, ARICell>>>((a, p) => ({ ...a, ...p.ariData }), {});
		const cell = ari[roomTypeId]?.[checkIn];
		popoverCell     = { roomTypeId, date: checkIn };
		popoverCheckOut = checkOut ?? addDaysLocal(checkIn, 1);
		popoverPropId   = prop.id;
		popoverPropName = prop.name;
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
				<div class="flex gap-1">
					{#each data.propertiesList as prop}
						<a href={navUrl(data.from, prop.id)}
							class={['rounded-full border px-3 py-1 text-xs font-medium transition-colors', activeProp === prop.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-foreground/40'].join(' ')}
						>{prop.name}</a>
					{/each}
				</div>
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

			<!-- Draw mode -->
			<button onclick={toggleDrawMode}
				class={['rounded border px-2.5 py-1 text-xs font-medium transition-colors', drawMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-background text-muted-foreground border-input hover:border-orange-400'].join(' ')}
			>✎ Draw</button>

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

			<div class="flex items-center gap-3 text-xs text-muted-foreground ml-auto">
				<span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-teal-100 border border-teal-400"></span> Click/drag→book</span>
				<span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300"></span> Override</span>
				<span class="flex items-center gap-1 text-red-600 font-bold">STOP</span>
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
								<div class="text-[8px] normal-case font-normal opacity-60 mt-0.5">drag to book</div>
							</td>
							{#each data.dates as iso, i}
								{@const cell = propAri[rt.id]?.[iso]}
								{@const dState = cellDragState(rt.id, prop.id, i)}
								{@const wState = cellDrawState(rt.id, prop.id, i)}
								{@const sel = drawSel.selections.find(s => s.rowId === rt.id)}
								{@const inSel = sel && i >= sel.minCol && i <= sel.maxCol}
							<td style="width:{COL_W}px"
								class={['border-r border-border/20 px-0.5 py-1.5 text-center cursor-crosshair transition-colors',
									dState === 'selected' ? 'bg-teal-100' : dState === 'conflict' ? 'bg-red-100' :
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
								<td style="width:{COL_W}px" class={['border-r border-border/20 px-0.5 py-1.5 text-center cursor-pointer transition-colors hover:bg-muted/40', cell ? cellBg(iso, cell) : ''].join(' ')} onclick={() => openPopover(rt.id, iso)}>
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
								<td style="width:{COL_W}px" class={['border-r border-border/20 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40', cell ? cellBg(iso, cell) : ''].join(' ')} onclick={() => openPopover(rt.id, iso)}>
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
		<div class="px-4 pt-3 pb-2">
			<button
				onclick={() => {
					openBookingCard(popoverCell!.roomTypeId, rt?.name ?? '', popoverCell!.date, popoverCheckOut, popoverPropId, popoverPropName);
					closePopover();
				}}
				class="w-full rounded-lg bg-green-600 text-white py-2 text-sm font-semibold hover:bg-green-700 transition-colors"
			>+ New Booking{multiNight ? ` · ${popNights} nights` : ''}</button>
		</div>

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
