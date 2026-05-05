<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BookingSummary, BookingSpan as BookingSpanType, FreeSpan, GridData, GridRoom } from '$lib/server/booking-queries';
	import { bedSlots, totalBeds } from '$lib/utils/room';
	import BookingCard from './BookingCard.svelte';
	import BookingDetailDialog from './BookingDetailDialog.svelte';
	import SlipFormDialog from './SlipFormDialog.svelte';

	type Channel = { id: string; name: string };
	type User    = { id: string; name: string };

	// Extra client-side span types for ghost bars and drawn selections
	type GhostSpan = { type: 'ghost'; day: number; length: number };
	type DrawSpan  = { type: 'draw';  day: number; length: number };
	type EffSpan   = FreeSpan | BookingSpanType | GhostSpan | DrawSpan;

	type GroupRoom = { roomId: string; roomNumber: string; checkIn: string; checkOut: string; roomConfigs: string[] };

	type Props = {
		grid: GridData;
		today: string;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		// Lifted state — shared across grids from parent page
		filterCheckIn?: string;
		filterCheckOut?: string;
		drawMode?: boolean;
		/** Called when this grid's draw selections change so parent can collect them */
		onDrawSelectionsChange?: (sels: DrawSel[]) => void;
		/** Called when operator wants to book a cross-property group (goes to page-level card) */
		onGroupBook?: (rooms: GroupRoom[]) => void;
	};

	let {
		grid, today, channels, users, currentUserId,
		filterCheckIn = $bindable(''),
		filterCheckOut = $bindable(''),
		drawMode = $bindable(false),
		onDrawSelectionsChange,
		onGroupBook,
	}: Props = $props();

	const { startDate, numDays, rooms: allRooms, propertyName, propertyId } = $derived(grid);
	const days = $derived(Array.from({ length: numDays }, (_, i) => i + 1));

	// ─── Housekeeping status dot ───────────────────────────────────────────────

	// Track statuses locally so dot updates feel instant
	let hkStatuses = $state<Map<string, string>>(new Map());
	$effect(() => {
		const m = new Map<string, string>();
		for (const r of allRooms) m.set(r.id, r.housekeepingStatus);
		hkStatuses = m;
	});

	const HK_CYCLE = ['clean', 'dirty', 'in_progress', 'out_of_order'] as const;
	type HkStatus = (typeof HK_CYCLE)[number];

	const HK_COLORS: Record<HkStatus, string> = {
		clean:        '#22c55e', // green
		dirty:        '#92400e', // dark amber-brown
		in_progress:  '#d97706', // amber
		out_of_order: '#7f1d1d'  // near-black dark red
	};
	const HK_LABELS: Record<HkStatus, string> = {
		clean:        'Clean',
		dirty:        'Dirty',
		in_progress:  'In progress',
		out_of_order: 'Out of order'
	};
	// Convert a hex colour to an rgba tint for cell backgrounds
	function hexTint(hex: string, alpha: number): string {
		if (!hex || !hex.startsWith('#') || hex.length < 7) return '';
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r},${g},${b},${alpha})`;
	}

	// Nightly rate in cents for a room type on a given day
	function dayRate(roomTypeId: string | null, day: number): number | null {
		if (!roomTypeId) return null;
		return grid.dayRates[day]?.rateByTypeId[roomTypeId] ?? null;
	}

	async function cycleHkStatus(roomId: string, current: string) {
		const idx = HK_CYCLE.indexOf(current as HkStatus);
		const next = HK_CYCLE[(idx + 1) % HK_CYCLE.length];
		hkStatuses = new Map(hkStatuses).set(roomId, next);
		await fetch(`/api/rooms/${roomId}/status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: next })
		});
	}

	// ─── Room bed slots (imported from $lib/utils/room) ───────────────────────
	// bedSlots(room) → 6 fixed slots [BR, K, Q, D, HB, Kit]
	// totalBeds(room) → sleeping capacity for filter logic

	// ─── Chip filters ─────────────────────────────────────────────────────────

	let filterKitchen = $state(false);
	let filterBeds = $state<0 | 1 | 2 | 3>(0); // 0=all, 1=1 bed, 2=2 beds, 3=3+
	let filterAvailable = $state(false);

	const rooms = $derived(
		allRooms.filter((r) => {
			if (filterKitchen && !r.hasKitchen) return false;
			if (filterBeds === 1 && totalBeds(r) !== 1) return false;
			if (filterBeds === 2 && totalBeds(r) !== 2) return false;
			if (filterBeds === 3 && totalBeds(r) < 3) return false;
			if (filterAvailable) {
				const hasBooking = r.spans.some((s) => s.type === 'booking' && (s as BookingSpanType).booking.status !== 'blocked');
				if (hasBooking) return false;
			}
			return true;
		})
	);

	// ─── Day-rate helpers ─────────────────────────────────────────────────────

	// Background for a free cell: drag/draw state overrides pricing tint
	function freeCellBg(
		roomTypeId: string | null,
		day: number,
		dragState: 'selected' | 'conflict' | null,
		drawState: 'drawing' | 'drawing-conflict' | null
	): string {
		if (dragState === 'selected') return 'rgb(204 251 241)'; // teal-100
		if (dragState === 'conflict') return 'rgb(254 202 202)'; // red-100
		if (drawState === 'drawing') return 'rgb(254 215 170)'; // orange-100
		if (drawState === 'drawing-conflict') return 'rgb(254 202 202)';
		const dr = grid.dayRates[day];
		if (!dr) return isWeekend(day) ? 'rgba(0,0,0,0.04)' : '';
		const alpha = isWeekend(day) ? 0.22 : 0.15;
		return hexTint(dr.colour, alpha);
	}

	// ─── Rolling-window date helpers ─────────────────────────────────────────

	/** startDate as a stable millisecond value for offset arithmetic */
	const startMs = $derived(new Date(startDate + 'T12:00:00').getTime());

	/** Convert ISO date string → 1-indexed day number within the window */
	function dateToDay(iso: string): number {
		return Math.round((new Date(iso + 'T12:00:00').getTime() - startMs) / 86400000) + 1;
	}

	const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	function dayDate(d: number): Date {
		const dt = new Date(startMs + (d - 1) * 86400000);
		return dt;
	}
	function dayOfWeek(d: number): string { return DOW[dayDate(d).getDay()]; }
	function dayOfMonth(d: number): number { return dayDate(d).getDate(); }
	/** Short month label (e.g. "Apr") — returned only for first visible day of each calendar month */
	function colMonthLabel(d: number): string | null {
		const dt = dayDate(d);
		return (dt.getDate() === 1 || d === 1)
			? dt.toLocaleDateString('en-CA', { month: 'short' })
			: null;
	}
	function isWeekend(d: number): boolean {
		const day = dayDate(d).getDay();
		return day === 0 || day === 6;
	}

	const todayDay = $derived.by((): number | null => {
		const diff = Math.round((new Date(today + 'T12:00:00').getTime() - startMs) / 86400000) + 1;
		return diff >= 1 && diff <= numDays ? diff : null;
	});

	// ─── Channel colours ──────────────────────────────────────────────────────

	const CHANNEL_COLOURS: Record<string, string> = {
		Direct: 'bg-teal-500',
		Expedia: 'bg-amber-500',
		'Booking.com': 'bg-blue-600'
	};
	function channelColour(name: string | null) {
		return CHANNEL_COLOURS[name ?? ''] ?? 'bg-purple-500';
	}

	// ─── Occupied days per room (for drag conflict detection) ─────────────────

	const occupiedByRoom = $derived(
		new Map(
			allRooms.map((r) => [
				r.id,
				new Set(
					r.spans
						.filter((s) => s.type === 'booking')
						.flatMap((s) => Array.from({ length: s.length }, (_, i) => s.day + i))
				)
			])
		)
	);

	// ─── Drag state ───────────────────────────────────────────────────────────

	let drag = $state<{ roomId: string; startDay: number; currentDay: number } | null>(null);

	const dragRange = $derived(
		drag
			? {
					roomId: drag.roomId,
					min: Math.min(drag.startDay, drag.currentDay),
					max: Math.max(drag.startDay, drag.currentDay)
				}
			: null
	);

	const dragHasConflict = $derived(
		dragRange !== null &&
			(() => {
				const occupied = occupiedByRoom.get(dragRange.roomId);
				if (!occupied) return false;
				for (let d = dragRange.min; d <= dragRange.max; d++) {
					if (occupied.has(d)) return true;
				}
				return false;
			})()
	);

	function cellInDrag(roomId: string, day: number): 'selected' | 'conflict' | null {
		if (!dragRange || dragRange.roomId !== roomId) return null;
		if (day < dragRange.min || day > dragRange.max) return null;
		return dragHasConflict ? 'conflict' : 'selected';
	}

	function spanInDragConflict(roomId: string, spanDay: number, length: number): boolean {
		if (!dragRange || dragRange.roomId !== roomId) return false;
		return spanDay <= dragRange.max && spanDay + length - 1 >= dragRange.min;
	}

	function startDrag(e: MouseEvent, roomId: string, day: number) {
		e.preventDefault();
		drag = { roomId, startDay: day, currentDay: day };
	}

	function updateDrag(roomId: string, day: number) {
		if (drag && drag.roomId === roomId) {
			drag = { ...drag, currentDay: day };
		}
	}

	// ─── Date ISO helpers ─────────────────────────────────────────────────────

	/** Convert window-relative day number → ISO date string */
	function dayToIso(d: number): string {
		const dt = new Date(startMs + (d - 1) * 86400000);
		return dt.toISOString().slice(0, 10);
	}

	// ─── Global mouseup — finalise drag or draw ──────────────────────────────

	function onDocumentMouseUp() {
		if (drawMode) {
			finalizeDrawSelection();
			return;
		}
		if (!drag || !dragRange) {
			drag = null;
			return;
		}

		if (dragHasConflict) {
			conflictMessage = 'That room is already booked for part of that range.';
			setTimeout(() => (conflictMessage = ''), 3000);
			drag = null;
			return;
		}

		const room = allRooms.find((r) => r.id === dragRange!.roomId);
		if (!room) { drag = null; return; }

		openNewCard(room.id, dayToIso(dragRange.min), dayToIso(dragRange.max + 1));
		drag = null;
	}

	// ─── Touch: single-tap on a free cell ────────────────────────────────────

	function onCellTap(roomId: string, day: number) {
		openNewCard(roomId, dayToIso(day), dayToIso(day + 1));
	}

	// ─── Conflict banner ──────────────────────────────────────────────────────

	let conflictMessage = $state('');

	// ─── Booking Card (unified — replaces SlipFormDialog + BookingDetailDialog) ─

	let cardOpen        = $state(false);
	let cardNewBooking  = $state<{ propertyId: string; propertyName: string; roomId: string; roomNumber: string; roomConfigs: string[]; checkIn: string; checkOut: string } | null>(null);
	let cardBookingId   = $state<string | null>(null);

	function openNewCard(roomId: string, checkIn: string, checkOut: string) {
		const room = allRooms.find((r) => r.id === roomId);
		if (!room) return;
		cardNewBooking = {
			propertyId,
			propertyName,
			roomId: room.id,
			roomNumber: room.roomNumber,
			roomConfigs: room.configs ?? [],
			checkIn,
			checkOut
		};
		cardBookingId = null;
		cardGroupRooms = null;
		cardOpen = true;
	}

	function openExistingCard(bookingId: string) {
		cardBookingId = bookingId;
		cardNewBooking = null;
		cardGroupRooms = null;
		cardOpen = true;
	}

	// ─── Group card (draw mode) ───────────────────────────────────────────────

	let cardGroupRooms = $state<GroupRoom[] | null>(null);

	function openGroupCard(rooms_: GroupRoom[]) {
		if (rooms_.length === 1) {
			openNewCard(rooms_[0].roomId, rooms_[0].checkIn, rooms_[0].checkOut);
			drawSelections = [];
			return;
		}
		// If parent provided a handler (cross-property group), delegate up
		if (onGroupBook) {
			onGroupBook(rooms_);
			drawSelections = [];
			drawMode = false;
			return;
		}
		cardGroupRooms = rooms_;
		cardNewBooking = null;
		cardBookingId = null;
		cardOpen = true;
		drawSelections = [];
	}

	// ─── Ghost bars ───────────────────────────────────────────────────────────

	// filterCheckIn and filterCheckOut are now $bindable props (lifted to page level)

	const ghostMap = $derived.by((): Map<string, { startDay: number; endDay: number }> => {
		if (!filterCheckIn || !filterCheckOut || filterCheckIn >= filterCheckOut) return new Map();
		const ciDay = dateToDay(filterCheckIn);
		const coDay = dateToDay(filterCheckOut) - 1; // last occupied day (checkout day is free)
		const visStart = Math.max(1, ciDay);
		const visEnd   = Math.min(numDays, coDay);
		if (visStart > visEnd) return new Map();
		const result = new Map<string, { startDay: number; endDay: number }>();
		for (const room of rooms) {
			const occ = occupiedByRoom.get(room.id);
			if (!occ) { result.set(room.id, { startDay: visStart, endDay: visEnd }); continue; }
			let conflict = false;
			for (let d = visStart; d <= visEnd; d++) { if (occ.has(d)) { conflict = true; break; } }
			if (!conflict) result.set(room.id, { startDay: visStart, endDay: visEnd });
		}
		return result;
	});

	// ─── Draw mode ────────────────────────────────────────────────────────────

	// drawMode is now a $bindable prop (lifted to page level)

	export type DrawSel = { roomId: string; roomNumber: string; startDay: number; endDay: number; configs: string[] | null; propertyId: string; propertyName: string };

	let drawSelections = $state<DrawSel[]>([]);
	let activeDraw     = $state<{ roomId: string; startDay: number; currentDay: number } | null>(null);

	// Notify parent whenever selections change
	$effect(() => {
		onDrawSelectionsChange?.(drawSelections);
	});

	function toggleDrawMode() {
		drawMode = !drawMode;
		if (!drawMode) { drawSelections = []; activeDraw = null; }
	}

	function cellInDraw(roomId: string, day: number): 'drawing' | 'drawing-conflict' | null {
		if (!drawMode || !activeDraw || activeDraw.roomId !== roomId) return null;
		const min = Math.min(activeDraw.startDay, activeDraw.currentDay);
		const max = Math.max(activeDraw.startDay, activeDraw.currentDay);
		if (day < min || day > max) return null;
		const occ = occupiedByRoom.get(roomId);
		return (occ && occ.has(day)) ? 'drawing-conflict' : 'drawing';
	}

	function finalizeDrawSelection() {
		if (!activeDraw) return;
		const { roomId, startDay, currentDay } = activeDraw;
		const minDay = Math.min(startDay, currentDay);
		const maxDay = Math.max(startDay, currentDay);
		const occ = occupiedByRoom.get(roomId);
		let hasConflict = false;
		if (occ) for (let d = minDay; d <= maxDay; d++) { if (occ.has(d)) { hasConflict = true; break; } }
		const room = allRooms.find((r) => r.id === roomId);
		if (!hasConflict && room) {
			drawSelections = [
				...drawSelections.filter((s) => s.roomId !== roomId),
				{ roomId, roomNumber: room.roomNumber, startDay: minDay, endDay: maxDay, configs: room.configs, propertyId, propertyName }
			];
		} else {
			conflictMessage = 'Room already booked for part of that range.';
			setTimeout(() => (conflictMessage = ''), 3000);
		}
		activeDraw = null;
	}

	// Click a ghost bar: in draw mode → add to selections, else open booking card
	function onGhostClick(roomId: string) {
		const ghost = ghostMap.get(roomId);
		if (!ghost) return;
		if (drawMode) {
			const room = allRooms.find((r) => r.id === roomId);
			if (room) {
				drawSelections = [
					...drawSelections.filter((s) => s.roomId !== roomId),
					{ roomId, roomNumber: room.roomNumber, startDay: ghost.startDay, endDay: ghost.endDay, configs: room.configs, propertyId, propertyName }
				];
			}
		} else {
			openNewCard(roomId, dayToIso(ghost.startDay), dayToIso(ghost.endDay + 1));
		}
	}

	// ─── Effective display spans per room (merges ghost/draw into free cells) ──

	function getDisplaySpans(room: GridRoom): EffSpan[] {
		const drawSel = drawSelections.find((s) => s.roomId === room.id);
		const ghost   = ghostMap.get(room.id);
		const overlay = drawSel
			? { type: 'draw'  as const, startDay: drawSel.startDay, endDay: drawSel.endDay }
			: ghost
			? { type: 'ghost' as const, startDay: ghost.startDay,   endDay: ghost.endDay }
			: null;
		if (!overlay) return room.spans as EffSpan[];

		const result: EffSpan[] = [];
		let injected = false;
		for (const span of room.spans) {
			if (span.type === 'free' && span.day >= overlay.startDay && span.day <= overlay.endDay) {
				if (!injected) {
					result.push({ type: overlay.type, day: overlay.startDay, length: overlay.endDay - overlay.startDay + 1 });
					injected = true;
				}
				// skip remaining free cells covered by overlay colspan
			} else {
				result.push(span as EffSpan);
			}
		}
		return result;
	}

	// ─── Detail dialog ────────────────────────────────────────────────────────

	let detailDialog = $state<{
		booking: BookingSummary;
		roomNumber: string;
		room: GridRoom;
	} | null>(null);
	let detailOpen = $state(false);

	function openDetail(booking: BookingSummary, room: GridRoom) {
		openExistingCard(booking.id);
	}

	// ─── Slip form dialog ─────────────────────────────────────────────────────

	let slipDialog = $state<{
		roomId: string;
		roomNumber: string;
		configs: string[] | null;
		checkIn: string;
		checkOut: string;
	} | null>(null);
	let slipOpen = $state(false);

	// ─── Block dialog ─────────────────────────────────────────────────────────

	let blockDialog = $state<{ roomId: string; roomNumber: string } | null>(null);
	let blockOpen = $state(false);
	let blockCheckIn = $state(today);
	let blockCheckOut = $state(today);
	let blockNotes = $state('');
	let blockError = $state('');

	function openBlock(room: GridRoom) {
		blockDialog = { roomId: room.id, roomNumber: room.roomNumber };
		blockCheckIn = String(today);
		blockCheckOut = advanceDay(String(today));
		blockNotes = '';
		blockError = '';
		blockOpen = true;
	}

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	function onBlockCheckInChange() {
		if (blockCheckOut <= blockCheckIn) {
			blockCheckOut = advanceDay(blockCheckIn);
		}
	}
</script>

<!-- Global mouseup listener for drag release -->
<svelte:document onmouseup={onDocumentMouseUp} />

<!-- Conflict flash message -->
{#if conflictMessage}
	<div class="bg-destructive/90 text-destructive-foreground rounded-md px-3 py-2 text-sm font-medium shadow">
		{conflictMessage}
	</div>
{/if}

<div class="flex min-w-0 flex-1 flex-col" class:select-none={drag !== null}>
	<!-- Property label + chip filters -->
	<div class="bg-muted/40 border-border border-b px-3 py-2 space-y-2">
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold">{propertyName}</span>
			<span class="text-muted-foreground text-xs">{rooms.length}/{allRooms.length} rooms</span>
		</div>

		<!-- Filter chips row 1: bed count / kitchen / available / draw mode -->
		<div class="flex flex-wrap gap-1.5 items-center">
			<!-- Bed count chips -->
			{#each ([0, 1, 2, 3] as const) as n}
				<button
					onclick={() => { filterBeds = n; }}
					class={[
						'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
						filterBeds === n
							? 'bg-foreground text-background border-foreground'
							: 'bg-background text-muted-foreground border-border hover:border-foreground/40'
					].join(' ')}
				>
					{n === 0 ? 'All beds' : n === 3 ? '3+ beds' : `${n} bed`}
				</button>
			{/each}

			<!-- Kitchen chip -->
			<button
				onclick={() => { filterKitchen = !filterKitchen; }}
				class={[
					'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
					filterKitchen
						? 'bg-amber-500 text-white border-amber-500'
						: 'bg-background text-muted-foreground border-border hover:border-amber-400'
				].join(' ')}
			>
				Kit
			</button>

			<!-- Available chip -->
			<button
				onclick={() => { filterAvailable = !filterAvailable; }}
				class={[
					'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
					filterAvailable
						? 'bg-teal-500 text-white border-teal-500'
						: 'bg-background text-muted-foreground border-border hover:border-teal-400'
				].join(' ')}
			>
				Available only
			</button>

			<span class="text-border mx-1">|</span>

			<!-- Draw mode toggle -->
			<button
				onclick={toggleDrawMode}
				class={[
					'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
					drawMode
						? 'bg-orange-500 text-white border-orange-500'
						: 'bg-background text-muted-foreground border-border hover:border-orange-400'
				].join(' ')}
				title="Draw mode: drag across rooms to select multiple date ranges"
			>
				✎ Draw
			</button>
		</div>

		<!-- Filter row 2: date range (ghost bars) -->
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground">Show available:</span>
			<input type="date" bind:value={filterCheckIn}
				oninput={() => { if (filterCheckOut && filterCheckOut <= filterCheckIn) filterCheckOut = ''; }}
				class="h-7 rounded border border-input bg-background px-2 text-xs"
				placeholder="Check-in" />
			<span class="text-xs text-muted-foreground">→</span>
			<input type="date" bind:value={filterCheckOut}
				class="h-7 rounded border border-input bg-background px-2 text-xs"
				placeholder="Check-out" />
			{#if filterCheckIn || filterCheckOut}
				<button onclick={() => { filterCheckIn = ''; filterCheckOut = ''; }}
					class="text-xs text-muted-foreground hover:text-foreground">✕ Clear</button>
				{#if ghostMap.size > 0}
					<span class="text-xs text-teal-700 font-medium">{ghostMap.size} room{ghostMap.size === 1 ? '' : 's'} available</span>
				{:else if filterCheckIn && filterCheckOut}
					<span class="text-xs text-muted-foreground">No rooms free for that range</span>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Legend bar -->
	<div class="border-border flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1 text-xs text-muted-foreground">
		<!-- Channel colours -->
		<span class="font-medium">Booking source:</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-3 rounded-sm bg-teal-500"></span>Direct
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-3 rounded-sm bg-amber-500"></span>Expedia
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-3 rounded-sm bg-blue-600"></span>Booking.com
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-3 rounded-sm bg-purple-500"></span>Other OTA
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-1.5 w-1.5 rounded-full bg-green-300 ring-1 ring-green-600/30"></span>Checked in
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-3 rounded-sm bg-gray-400 opacity-60" style="background-image:repeating-linear-gradient(45deg,transparent,transparent 2px,rgba(0,0,0,.2) 2px,rgba(0,0,0,.2) 4px)"></span>Block
		</span>

		<span class="mx-2 text-border">|</span>

		<!-- Housekeeping -->
		<span class="font-medium">Housekeeping:</span>
		{#each HK_CYCLE as s}
			<span class="flex items-center gap-1">
				<span class="inline-block h-[5px] w-[5px] rounded-full" style="background:{HK_COLORS[s]}"></span>
				{HK_LABELS[s]}
			</span>
		{/each}
		<span class="mx-2 text-border">|</span>
	<span class="font-medium">Payment:</span>
	<span class="flex items-center gap-1">
		<span class="inline-block rounded bg-red-500/80 px-[3px] py-0.5 text-[9px] font-bold text-white">$?</span>Unpaid
	</span>
	<span class="flex items-center gap-1">
		<span class="inline-block rounded bg-yellow-400/90 px-[3px] py-0.5 text-[9px] font-bold text-stone-900">½$</span>Partial
	</span>
	<span class="flex items-center gap-1">
		<span class="inline-block rounded bg-green-500/70 px-[3px] py-0.5 text-[9px] font-bold text-white">✓$</span>Paid
	</span>
	<span class="flex items-center gap-1">
		<span class="inline-block rounded bg-white/25 ring-1 ring-black/20 px-[3px] py-0.5 text-[9px] font-bold">G</span>Group booking
	</span>
	<span class="ml-auto opacity-60">Dot in cell corner · click room dot to cycle</span>
	</div>

	<div class="overflow-x-auto">
		<table class="border-separate border-spacing-0 text-xs">
			<thead>
				<tr>
				<th
				class="border-border bg-background sticky left-0 z-20 border-b border-r px-2 py-1.5 text-left font-medium whitespace-nowrap"
				style="min-width:172px; width:172px"
				>Room</th>
					{#each days as day}
						<th
							class={[
								'border-border bg-background border-b border-r px-0 py-0 text-center font-medium',
								isWeekend(day) ? 'bg-muted/30' : '',
								todayDay === day ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
							].join(' ')}
							style="min-width:48px; width:48px"
						>
							<div class="flex flex-col items-center py-0.5 leading-none gap-px">
								{#if colMonthLabel(day)}
									<span class="text-[9px] font-bold uppercase tracking-wide opacity-60">{colMonthLabel(day)}</span>
								{/if}
								<span class="text-xs">{dayOfWeek(day)}</span>
								<span class={todayDay === day ? 'font-bold' : ''}>{dayOfMonth(day)}</span>
							</div>
						</th>
					{/each}
				</tr>
			</thead>

			<tbody>
		{#each rooms as room (room.id)}
			{@const hkStatus = (hkStatuses.get(room.id) ?? room.housekeepingStatus) as HkStatus}
			<tr class="group">
				<!-- Room info column -->
				<td
				class="border-border bg-background sticky left-0 z-10 border-b border-r px-2 py-0.5"
				style="min-width:172px; width:172px"
				>
					<div class="flex items-center gap-1 leading-none">
						<span class="font-mono font-bold text-sm">{room.roomNumber}</span>
					<span class="text-muted-foreground/70 text-xs truncate flex-1 leading-none">
						{room.roomTypeName ?? ''}
					</span>
						<button
							title="{HK_LABELS[hkStatus]} — click to cycle"
							onclick={(e) => { e.stopPropagation(); cycleHkStatus(room.id, hkStatus); }}
							class="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
							style="background:{HK_COLORS[hkStatus]}"
						></button>
						<button
							title="Block room for maintenance"
							onclick={(e) => { e.stopPropagation(); openBlock(room); }}
							class="shrink-0 text-xs leading-none px-0.5 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
						>···</button>
					</div>
					<div class="mt-0.5 grid leading-none" style="grid-template-columns:repeat(6,1fr)">
					{#each bedSlots(room) as slot}
						<span class="text-xs font-mono text-muted-foreground/70">{slot}</span>
					{/each}
					</div>
				</td>

				<!-- Day cells: merge ghost/draw overlays into free spans -->
				{#each getDisplaySpans(room) as span (span.day)}
					{#if span.type === 'free'}
						{@const dragState = cellInDrag(room.id, span.day)}
						{@const drawState = cellInDraw(room.id, span.day)}
						{@const rate = dayRate(room.roomTypeId, span.day)}
						<td
							class={[
								'border-border relative cursor-pointer border-b border-r p-0 transition-[filter]',
								todayDay === span.day && !dragState ? 'ring-1 ring-inset ring-primary/30' : '',
								!dragState && !drawState ? 'hover:brightness-90' : ''
							].join(' ')}
							style="min-width:48px; width:48px; height:50px; background:{freeCellBg(room.roomTypeId, span.day, dragState, drawState)}"
							onmousedown={(e) => { if (drawMode) { e.preventDefault(); activeDraw = { roomId: room.id, startDay: span.day, currentDay: span.day }; } else { startDrag(e, room.id, span.day); } }}
							onmouseenter={() => { if (drawMode && activeDraw && activeDraw.roomId === room.id) { activeDraw = { ...activeDraw, currentDay: span.day }; } else if (!drawMode) { updateDrag(room.id, span.day); } }}
							ontouchend={(e) => { e.preventDefault(); onCellTap(room.id, span.day); }}
						>
							<span class="pointer-events-none absolute top-0.5 right-0.5 h-[5px] w-[5px] rounded-full opacity-70"
								style="background:{HK_COLORS[hkStatus]}"></span>
							{#if rate !== null}
								<span class="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium leading-none select-none text-foreground/45">
									${Math.round(rate / 100)}
								</span>
							{/if}
						</td>

					{:else if span.type === 'ghost'}
						<!-- Ghost bar: available room for filter date range -->
						<td
							colspan={span.length}
							class="border-border relative cursor-pointer border-b border-r p-0"
							style="min-width:{span.length * 48}px; height:50px"
							onclick={() => onGhostClick(room.id)}
							title={drawMode ? 'Click to add to draw selection' : 'Click to book this room'}
						>
							<div class="flex h-full items-center justify-center gap-1 rounded border-2 border-dashed border-teal-400 bg-teal-50/80 px-2 text-teal-700 hover:bg-teal-100 transition-colors mx-px">
								<span class="text-xs font-medium">✓ Available</span>
								{#if span.length > 2}
									<span class="text-[10px] opacity-70">{span.length}n</span>
								{/if}
							</div>
						</td>

					{:else if span.type === 'draw'}
						<!-- Draw selection bar (finalised) -->
						{@const drawSel = drawSelections.find(s => s.roomId === room.id)}
						<td
							colspan={span.length}
							class="border-border relative border-b border-r p-0"
							style="min-width:{span.length * 48}px; height:50px"
						>
							<div class="flex h-full items-center gap-1 rounded border-2 border-orange-400 bg-orange-100 px-2 text-orange-800 mx-px">
								<span class="text-xs font-semibold">Rm {room.roomNumber}</span>
								{#if span.length > 2}
									<span class="text-[10px] opacity-70">{span.length}n</span>
								{/if}
								<button type="button"
									onclick={() => { drawSelections = drawSelections.filter(s => s.roomId !== room.id); }}
									class="ml-auto text-orange-400 hover:text-orange-700 text-sm leading-none">×</button>
							</div>
						</td>

					{:else}
						{@const s = span as BookingSpanType}
						{@const inConflict = spanInDragConflict(room.id, s.day, s.length)}
						{@const isBlocked = s.booking.status === 'blocked'}
						<td
							colspan={s.length}
							class="border-border relative cursor-pointer border-b border-r p-0"
							style="min-width:{s.length * 48}px; height:50px"
							onmouseenter={() => updateDrag(room.id, s.day)}
							onclick={() => !drag && !isBlocked && openDetail(s.booking, room)}
						>
							{#if inConflict}
								<div class="absolute inset-0 z-10 rounded bg-red-400/60"></div>
							{/if}

							{#if isBlocked}
								<div
									class="relative flex h-full items-center overflow-hidden px-1.5 bg-slate-400 text-white opacity-80"
									style="border-radius:4px; background-image:repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,.08) 4px,rgba(0,0,0,.08) 8px)"
								>
								<span class="mr-1 text-xs">🔧</span>
								<span class="min-w-0 truncate text-xs font-medium leading-none">
										{s.booking.notes ?? 'Maintenance'}
									</span>
								</div>
							{:else}
							<div
								class={[
									'relative flex h-full items-center overflow-hidden pl-1.5',
									s.overflowEnd ? 'pr-4' : 'pr-3',
									channelColour(s.booking.channelName),
									'text-white'
								].join(' ')}
								style={s.overflowStart
									? 'border-radius:0 4px 4px 0'
									: s.overflowEnd
										? 'border-radius:4px 0 0 4px'
										: 'border-radius:4px'}
							>
								{#if !s.overflowStart}
									<span class="mr-0.5 shrink-0 opacity-70">›</span>
								{/if}

						<span class="min-w-0 truncate text-xs font-medium leading-none">
							{s.booking.guestName ?? '—'}
						</span>

						{#if s.booking.channelName && s.booking.channelName !== 'Direct'}
							<span class="ml-1 shrink-0 rounded bg-black/20 px-1 py-0.5 text-[10px] font-bold uppercase leading-none">
									{s.booking.channelName === 'Expedia' ? 'E' : 'B'}
								</span>
							{/if}

						<!-- Group badge -->
						{#if s.booking.groupId}
							<span class="ml-1 shrink-0 rounded bg-white/25 px-1 py-0.5 text-[10px] font-bold leading-none"
								title="Group: {s.booking.groupName ?? 'Group booking'}">G</span>
						{/if}

			{#if s.booking.status === 'checked_in'}
								<span class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-300"></span>
							{/if}

							<!-- Payment status badge: suppress $? for group rooms (payment may be on another room) -->
						{#if s.booking.groupId}
							<!-- Group rooms: only show paid ✓ if this specific room has been paid; otherwise silent -->
							{#if s.booking.paymentStatus === 'paid'}
								<span class="ml-auto shrink-0 rounded bg-green-500/70 px-[3px] py-0.5 text-[10px] font-bold leading-none text-white" title="Paid">✓$</span>
							{:else if s.booking.paymentStatus === 'partial'}
								<span class="ml-auto shrink-0 rounded bg-yellow-400/90 px-[3px] py-0.5 text-[10px] font-bold leading-none text-stone-900" title="Partially paid">½$</span>
							{/if}
						{:else}
							{#if s.booking.paymentStatus === 'unpaid'}
								<span class="ml-auto shrink-0 rounded bg-red-500/80 px-[3px] py-0.5 text-[10px] font-bold leading-none text-white" title="Unpaid">$?</span>
							{:else if s.booking.paymentStatus === 'partial'}
								<span class="ml-auto shrink-0 rounded bg-yellow-400/90 px-[3px] py-0.5 text-[10px] font-bold leading-none text-stone-900" title="Partially paid">½$</span>
							{:else if s.booking.paymentStatus === 'paid'}
								<span class="ml-auto shrink-0 rounded bg-green-500/70 px-[3px] py-0.5 text-[10px] font-bold leading-none text-white" title="Paid">✓$</span>
							{/if}
						{/if}

								{#if s.overflowEnd}
									<span class="absolute right-0.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold opacity-80">›</span>
								{:else}
									<span class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-70">‹</span>
								{/if}
								</div>
								{/if}
							</td>
					{/if}
				{/each}
			</tr>
		{/each}
		</tbody>
		</table>
	</div>
</div>

<!-- Unified booking card (new + existing + group) -->
<BookingCard
	bind:open={cardOpen}
	bookingId={cardBookingId ?? undefined}
	newBooking={cardNewBooking ?? undefined}
	groupRooms={cardGroupRooms ?? undefined}
	{channels}
	{users}
	{currentUserId}
	{today}
	{propertyName}
/>

<!-- Detail dialog (kept for OTA import flow until fully migrated) -->
{#if detailDialog}
	<BookingDetailDialog
		bind:open={detailOpen}
		booking={detailDialog.booking}
		roomNumber={detailDialog.roomNumber}
		room={detailDialog.room}
		{propertyName}
		onClose={() => { detailDialog = null; }}
	/>
{/if}

<!-- Slip form dialog (kept for OTA import flow) -->
{#if slipDialog}
	<SlipFormDialog
		bind:open={slipOpen}
		{propertyId}
		{propertyName}
		roomId={slipDialog.roomId}
		roomNumber={slipDialog.roomNumber}
		roomConfigs={slipDialog.configs}
		bind:checkIn={slipDialog.checkIn}
		bind:checkOut={slipDialog.checkOut}
		{channels}
		{users}
		{currentUserId}
	/>
{/if}

<!-- Block dialog -->
{#if blockOpen && blockDialog}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
		<div class="bg-background rounded-lg shadow-xl p-5 w-80 space-y-4">
			<div class="flex items-center justify-between">
				<h3 class="font-semibold text-sm">Block Room {blockDialog.roomNumber}</h3>
				<button onclick={() => { blockOpen = false; blockDialog = null; }} class="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
			</div>

			<form
				method="POST"
				action="?/createBlock"
				use:enhance={() => {
					return ({ result }) => {
						if (result.type === 'success') {
							blockOpen = false;
							blockDialog = null;
							location.reload();
						} else if (result.type === 'failure') {
							blockError = (result.data as { error?: string })?.error ?? 'Error';
						}
					};
				}}
				class="space-y-3"
			>
				<input type="hidden" name="propertyId" value={propertyId} />
				<input type="hidden" name="roomId" value={blockDialog.roomId} />

				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="block text-xs text-muted-foreground mb-0.5" for="blockCheckIn">From</label>
					<input id="blockCheckIn" type="date" name="checkIn" bind:value={blockCheckIn}
						oninput={onBlockCheckInChange}
						class="w-full border rounded px-2 py-1 text-sm border-input bg-background" />
					</div>
					<div>
						<label class="block text-xs text-muted-foreground mb-0.5" for="blockCheckOut">To</label>
						<input id="blockCheckOut" type="date" name="checkOut" bind:value={blockCheckOut}
							class="w-full border rounded px-2 py-1 text-sm border-input bg-background" />
					</div>
				</div>

				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="blockNotes">Reason (optional)</label>
					<input id="blockNotes" type="text" name="notes" bind:value={blockNotes}
						placeholder="e.g. Plumbing repair"
						class="w-full border rounded px-2 py-1 text-sm border-input bg-background" />
				</div>

				{#if blockError}
					<p class="text-destructive text-xs">{blockError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-1">
					<button type="button" onclick={() => { blockOpen = false; blockDialog = null; }}
						class="rounded border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
					<button type="submit"
						class="rounded bg-slate-600 text-white px-3 py-1.5 text-xs hover:bg-slate-700">Block Room</button>
				</div>
			</form>
		</div>
	</div>
{/if}
