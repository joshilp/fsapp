<script lang="ts">
	import type { BookingSummary, BookingSpan as BookingSpanType, GridData } from '$lib/server/booking-queries';
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

	const { year, month, daysInMonth, rooms, propertyName, propertyId } = $derived(grid);
	const days = $derived(Array.from({ length: daysInMonth }, (_, i) => i + 1));

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
			rooms.map((r) => [
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

		const room = rooms.find((r) => r.id === dragRange!.roomId);
		if (!room) { drag = null; return; }

		// checkOut = day AFTER the last selected night
		slipDialog = {
			roomId: room.id,
			roomNumber: room.roomNumber,
			checkIn: dayToIso(dragRange.min),
			checkOut: dayToIso(dragRange.max + 1)
		};
		drag = null;
		slipOpen = true;
	}

	// ─── Touch: single-tap on a free cell ────────────────────────────────────

	function onCellTap(roomId: string, day: number) {
		const room = rooms.find((r) => r.id === roomId);
		if (!room) return;
		slipDialog = {
			roomId: room.id,
			roomNumber: room.roomNumber,
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
		checkIn: string;
		checkOut: string;
	} | null>(null);
	let slipOpen = $state(false);
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
	<!-- Property label -->
	<div class="bg-muted/40 border-border border-b px-3 py-1.5">
		<span class="text-sm font-semibold">{propertyName}</span>
		<span class="text-muted-foreground ml-2 text-xs">{rooms.length} rooms</span>
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
						style="left:52px; min-width:28px"
					>T</th>
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
					<tr class="group">
						<td
							class="border-border bg-background group-hover:bg-muted/30 sticky left-0 z-10 border-b border-r px-2 py-0 font-mono font-medium whitespace-nowrap"
							style="min-width:52px; height:32px"
						>{room.roomNumber}</td>
						<td
							class="border-border bg-background group-hover:bg-muted/30 sticky z-10 border-b border-r px-1 py-0 text-center"
							style="left:52px; min-width:28px"
						>
							{#if room.roomTypeCategory}
								<span class="text-muted-foreground font-medium">{room.roomTypeCategory}</span>
							{/if}
						</td>

						{#each room.spans as span (span.day)}
							{#if span.type === 'free'}
								{@const state = cellInDrag(room.id, span.day)}
								<td
									class={[
										'border-border cursor-pointer border-b border-r p-0 transition-colors',
										isWeekend(span.day) ? 'bg-muted/20' : '',
										todayDay() === span.day ? 'bg-primary/5' : '',
										state === 'selected' ? 'bg-teal-100' : '',
										state === 'conflict' ? 'bg-red-100' : '',
										!state ? 'hover:bg-muted/40' : ''
									].join(' ')}
									style="min-width:36px; width:36px; height:32px"
									onmousedown={(e) => startDrag(e, room.id, span.day)}
									onmouseenter={() => updateDrag(room.id, span.day)}
									ontouchend={(e) => { e.preventDefault(); onCellTap(room.id, span.day); }}
								></td>
							{:else}
								{@const s = span as BookingSpanType}
								{@const inConflict = spanInDragConflict(room.id, s.day, s.length)}
								<td
									colspan={s.length}
									class="border-border relative cursor-pointer border-b border-r p-0"
									style="min-width:{s.length * 36}px; height:32px"
									onmouseenter={() => updateDrag(room.id, s.day)}
									onclick={() => !drag && openDetail(s.booking, room.roomNumber)}
								>
									<!-- Conflict overlay during drag -->
									{#if inConflict}
										<div class="absolute inset-0 z-10 rounded bg-red-400/60"></div>
									{/if}

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
		bind:checkIn={slipDialog.checkIn}
		bind:checkOut={slipDialog.checkOut}
		{channels}
		{users}
		{currentUserId}
	/>
{/if}
