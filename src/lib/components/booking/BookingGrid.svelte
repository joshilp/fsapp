<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BookingSummary, BookingSpan as BookingSpanType, GridData, GridRoom } from '$lib/server/booking-queries';
	import BookingDetailDialog from './BookingDetailDialog.svelte';
	import SlipFormDialog from './SlipFormDialog.svelte';

	type Channel = { id: string; name: string };
	type User = { id: string; name: string };

	type Props = {
		grid: GridData;
		today: string;
		channels: Channel[];
		users: User[];
		currentUserId: string;
	};

	let { grid, today, channels, users, currentUserId }: Props = $props();

	const { year, month, daysInMonth, rooms: allRooms, propertyName, propertyId } = $derived(grid);
	const days = $derived(Array.from({ length: daysInMonth }, (_, i) => i + 1));

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
	// Opaque pastel bg for sticky cells — makes rows scannable at a glance
	const HK_ROW_BG: Record<HkStatus, string> = {
		clean:        '#f0fdf4', // green-50
		dirty:        '#fdf4e4', // warm buff
		in_progress:  '#fefce8', // yellow-50
		out_of_order: '#fff1f2'  // rose-50 — clearly unavailable
	};
	// Faint tint on the full row so data cells carry the colour too
	const HK_ROW_TINT: Record<HkStatus, string> = {
		clean:        'rgba(34,  197, 94,  0.05)',
		dirty:        'rgba(146, 64,  14,  0.06)',
		in_progress:  'rgba(217, 119, 6,   0.06)',
		out_of_order: 'rgba(127, 29,  29,  0.08)'
	};

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

	// ─── Compact room info ─────────────────────────────────────────────────────

	function roomCompact(room: GridRoom): string {
		const parts: string[] = [];
		if (room.kingBeds > 0) parts.push(room.kingBeds === 1 ? '1K' : `${room.kingBeds}K`);
		if (room.queenBeds > 0) parts.push(room.queenBeds === 1 ? '1Q' : `${room.queenBeds}Q`);
		if (room.doubleBeds > 0) parts.push(room.doubleBeds === 1 ? '1D' : `${room.doubleBeds}D`);
		if (room.hasHideabed) parts.push('Sb');
		const beds = parts.join('+');
		return room.hasKitchen ? `${beds || '—'} ✦` : beds || '—';
	}

	function totalBeds(room: GridRoom): number {
		return room.kingBeds + room.queenBeds + room.doubleBeds + (room.hasHideabed ? 1 : 0);
	}

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

	// ─── Today highlight ──────────────────────────────────────────────────────

	const todayDay = $derived((): number | null => {
		const [ty, tm, td] = today.split('-').map(Number);
		return ty === year && tm === month ? td : null;
	});

	const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	function dayOfWeek(day: number) {
		return DOW[new Date(year, month - 1, day).getDay()];
	}
	function isWeekend(day: number) {
		const d = new Date(year, month - 1, day).getDay();
		return d === 0 || d === 6;
	}

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

	function dayToIso(d: number): string {
		if (d <= 0) {
			const pm = month === 1 ? 12 : month - 1;
			const py = month === 1 ? year - 1 : year;
			const daysInPrev = new Date(py, pm, 0).getDate();
			return `${py}-${String(pm).padStart(2, '0')}-${String(daysInPrev + d).padStart(2, '0')}`;
		}
		if (d > daysInMonth) {
			const nm = month === 12 ? 1 : month + 1;
			const ny = month === 12 ? year + 1 : year;
			return `${ny}-${String(nm).padStart(2, '0')}-${String(d - daysInMonth).padStart(2, '0')}`;
		}
		return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	// ─── Global mouseup — finalise drag ──────────────────────────────────────

	function onDocumentMouseUp() {
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

		slipDialog = {
			roomId: room.id,
			roomNumber: room.roomNumber,
			configs: room.configs,
			checkIn: dayToIso(dragRange.min),
			checkOut: dayToIso(dragRange.max + 1)
		};
		drag = null;
		slipOpen = true;
	}

	// ─── Touch: single-tap on a free cell ────────────────────────────────────

	function onCellTap(roomId: string, day: number) {
		const room = allRooms.find((r) => r.id === roomId);
		if (!room) return;
		slipDialog = {
			roomId: room.id,
			roomNumber: room.roomNumber,
			configs: room.configs,
			checkIn: dayToIso(day),
			checkOut: dayToIso(day + 1)
		};
		slipOpen = true;
	}

	// ─── Conflict banner ──────────────────────────────────────────────────────

	let conflictMessage = $state('');

	// ─── Detail dialog ────────────────────────────────────────────────────────

	let detailDialog = $state<{
		booking: BookingSummary;
		roomNumber: string;
	} | null>(null);
	let detailOpen = $state(false);

	function openDetail(booking: BookingSummary, roomNumber: string) {
		detailDialog = { booking, roomNumber };
		detailOpen = true;
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

		<!-- Filter chips -->
		<div class="flex flex-wrap gap-1.5">
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
				✦ Kitchen
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
		</div>
	</div>

	<!-- Housekeeping legend -->
	<div class="border-border flex items-center gap-3 border-b px-3 py-1 text-[10px] text-muted-foreground flex-wrap">
		<span class="font-medium">Housekeeping:</span>
		{#each HK_CYCLE as s}
			<span class="flex items-center gap-1.5">
				<span class="inline-block h-3.5 w-3 rounded-sm border border-black/10" style="background:{HK_ROW_BG[s]}"></span>
				<span class="inline-block h-2 w-2 rounded-full" style="background:{HK_COLORS[s]}"></span>
				{HK_LABELS[s]}
			</span>
		{/each}
		<span class="ml-auto opacity-60">Click dot to cycle</span>
	</div>

	<div class="overflow-x-auto">
		<table class="border-separate border-spacing-0 text-xs">
			<thead>
				<tr>
					<th
						class="border-border bg-background sticky left-0 z-20 border-b border-r px-2 py-1.5 text-left font-medium whitespace-nowrap"
						style="min-width:52px"
					>Room</th>
					<th
						class="border-border bg-background sticky z-20 border-b border-r px-1.5 py-1.5 text-left font-medium"
						style="left:52px; min-width:60px"
					>Beds</th>
					{#each days as day}
						<th
							class={[
								'border-border bg-background border-b border-r px-0 py-0 text-center font-medium',
								isWeekend(day) ? 'bg-muted/30' : '',
								todayDay() === day ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
							].join(' ')}
							style="min-width:36px; width:36px"
						>
							<div class="flex flex-col items-center py-0.5 leading-none">
								<span class="text-[10px]">{dayOfWeek(day)}</span>
								<span class={todayDay() === day ? 'font-bold' : ''}>{day}</span>
							</div>
						</th>
					{/each}
				</tr>
			</thead>

			<tbody>
			{#each rooms as room (room.id)}
				{@const hkStatus = (hkStatuses.get(room.id) ?? room.housekeepingStatus) as HkStatus}
				<tr class="group" style="background:{HK_ROW_TINT[hkStatus]}">
					<!-- Room number + HK dot -->
					<td
						class="border-border sticky left-0 z-10 border-b border-r px-2 py-0 whitespace-nowrap transition-colors"
						style="min-width:52px; height:32px; background:{HK_ROW_BG[hkStatus]}"
					>
						<div class="flex items-center gap-1">
							<span class="font-mono font-medium">{room.roomNumber}</span>
							<button
								title="{HK_LABELS[hkStatus]} — click to cycle"
								onclick={(e) => { e.stopPropagation(); cycleHkStatus(room.id, hkStatus); }}
								class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
								style="background:{HK_COLORS[hkStatus]}"
							></button>
						</div>
					</td>

					<!-- Compact room info + block button -->
					<td
						class="border-border sticky z-10 border-b border-r px-1 py-0 transition-colors"
						style="left:52px; min-width:60px; background:{HK_ROW_BG[hkStatus]}"
					>
						<div class="flex items-center justify-between gap-1">
							<span class="text-[10px] font-mono text-muted-foreground leading-none">{roomCompact(room)}</span>
							<button
								title="Block room for maintenance"
								onclick={(e) => { e.stopPropagation(); openBlock(room); }}
								class="opacity-25 hover:opacity-100 text-[10px] leading-none px-0.5 rounded hover:bg-muted transition-opacity"
							>🔧</button>
						</div>
					</td>

					{#each room.spans as span (span.day)}
						{#if span.type === 'free'}
							{@const state = cellInDrag(room.id, span.day)}
							<td
								class={[
									'border-border cursor-pointer border-b border-r p-0 transition-colors',
									isWeekend(span.day) ? 'bg-muted/20' : '',
									todayDay() === span.day ? 'bg-primary/5' : '',
									state === 'selected' ? 'bg-teal-100!' : '',
									state === 'conflict' ? 'bg-red-100!' : '',
									!state ? 'hover:brightness-95' : ''
								].join(' ')}
								style="min-width:36px; width:36px; height:32px"
								onmousedown={(e) => startDrag(e, room.id, span.day)}
								onmouseenter={() => updateDrag(room.id, span.day)}
								ontouchend={(e) => { e.preventDefault(); onCellTap(room.id, span.day); }}
							></td>
							{:else}
								{@const s = span as BookingSpanType}
								{@const inConflict = spanInDragConflict(room.id, s.day, s.length)}
								{@const isBlocked = s.booking.status === 'blocked'}
								<td
									colspan={s.length}
									class="border-border relative cursor-pointer border-b border-r p-0"
									style="min-width:{s.length * 36}px; height:32px"
									onmouseenter={() => updateDrag(room.id, s.day)}
									onclick={() => !drag && !isBlocked && openDetail(s.booking, room.roomNumber)}
								>
									{#if inConflict}
										<div class="absolute inset-0 z-10 rounded bg-red-400/60"></div>
									{/if}

									{#if isBlocked}
										<!-- Maintenance block: gray hatched -->
										<div
											class="relative flex h-full items-center overflow-hidden px-1.5 bg-slate-400 text-white opacity-80"
											style="border-radius:4px; background-image:repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,.08) 4px,rgba(0,0,0,.08) 8px)"
										>
											<span class="mr-1 text-[11px]">🔧</span>
											<span class="min-w-0 truncate text-[11px] font-medium leading-none">
												{s.booking.notes ?? 'Maintenance'}
											</span>
										</div>
									{:else}
										<div
											class={[
												'relative flex h-full items-center overflow-hidden px-1.5',
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

											<span class="min-w-0 truncate text-[11px] font-medium leading-none">
												{s.booking.guestName ?? '—'}
											</span>

											{#if s.booking.channelName && s.booking.channelName !== 'Direct'}
												<span class="ml-1 shrink-0 rounded bg-black/20 px-1 py-0.5 text-[9px] font-bold uppercase leading-none">
													{s.booking.channelName === 'Expedia' ? 'E' : 'B'}
												</span>
											{/if}

											{#if s.booking.status === 'checked_in'}
												<span class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-300"></span>
											{/if}

											{#if s.overflowEnd}
												<span class="ml-auto shrink-0 text-[9px] font-semibold opacity-80">over›</span>
											{:else}
												<span class="ml-0.5 shrink-0 opacity-70">‹</span>
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

<!-- Detail dialog -->
{#if detailDialog}
	<BookingDetailDialog
		bind:open={detailOpen}
		booking={detailDialog.booking}
		roomNumber={detailDialog.roomNumber}
		{propertyName}
		onClose={() => { detailDialog = null; }}
	/>
{/if}

<!-- Slip form dialog -->
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
