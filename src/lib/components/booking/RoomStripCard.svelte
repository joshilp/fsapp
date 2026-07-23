<script lang="ts">
	/**
	 * Reusable card for the "pick a room" step in OtaImportDialog and FindRoomDialog.
	 *
	 * Shows:
	 *  - Room number, property, bed notation, type name
	 *  - A ~24-day availability strip centred on the proposed stay
	 *  - Gap summary: "Before: Xd free · After: Yd free" to help with gap-filling decisions
	 *  - An Assign / Book button
	 */
	import { bedCompact } from '$lib/utils/room';
	import { Button } from '$lib/components/ui/button/index.js';

	export type NearbyBooking = {
		checkInDate: string;
		checkOutDate: string;
		guestName: string | null;
		channelName: string | null;
		status: string;
	};

	export type AvailableRoom = {
		id: string;
		roomNumber: string;
		propertyId: string;
		propertyName: string;
		numRooms: number;
		kingBeds: number;
		queenBeds: number;
		doubleBeds: number;
		hasHideabed: boolean;
		hasKitchen: boolean;
		configs: string[] | null;
		category: string | null;
		typeName: string | null;
		nearbyBookings: NearbyBooking[];
	};

	type Props = {
		room: AvailableRoom;
		checkIn: string;
		checkOut: string;
		actionLabel?: string;
		onAssign: (room: AvailableRoom) => void;
	};

	let { room, checkIn, checkOut, actionLabel = 'Assign →', onAssign }: Props = $props();

	// ─── Bed label (from shared utility) ─────────────────────────────────────

	const bedLabel = $derived(() => bedCompact(room));

	// ─── Strip helpers ────────────────────────────────────────────────────────

	const STRIP_PRE = 8;
	const STRIP_POST = 16;

	function addDays(iso: string, n: number): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + n);
		return d.toISOString().slice(0, 10);
	}

	function daysBetween(from: string, to: string): number {
		return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
	}

	// Build flat day array for the strip
	const stripDays = $derived(() => {
		const stripStart = addDays(checkIn, -STRIP_PRE);
		const totalDays = STRIP_PRE + daysBetween(checkIn, checkOut) + STRIP_POST;

		return Array.from({ length: totalDays }, (_, i) => {
			const iso = addDays(stripStart, i);
			const isProposed = iso >= checkIn && iso < checkOut;
			const dow = new Date(iso + 'T12:00:00').getDay();
			const isWeekend = dow === 0 || dow === 6;
			const booking = room.nearbyBookings.find(
				(b) => iso >= b.checkInDate && iso < b.checkOutDate
			) ?? null;
			return { iso, isProposed, isWeekend, booking };
		});
	});

	// Identify contiguous booking spans for label overlay
	const bookingSpans = $derived(() => {
		const days = stripDays();
		const spans: { startIdx: number; length: number; booking: NearbyBooking }[] = [];
		let i = 0;
		while (i < days.length) {
			const d = days[i];
			if (d.booking) {
				let j = i;
				while (j < days.length && days[j].booking === d.booking) j++;
				spans.push({ startIdx: i, length: j - i, booking: d.booking });
				i = j;
			} else {
				i++;
			}
		}
		return spans;
	});

	// Gap calculation — how many free days on each side of the proposed stay
	const gaps = $derived.by(() => {
		const nearby = room.nearbyBookings;
		const before = nearby
			.filter((b) => b.checkOutDate <= checkIn)
			.sort((a, b) => b.checkOutDate.localeCompare(a.checkOutDate))[0];
		const after = nearby
			.filter((b) => b.checkInDate >= checkOut)
			.sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))[0];
		return {
			before: before ? daysBetween(before.checkOutDate, checkIn) : null,
			after: after ? daysBetween(checkOut, after.checkInDate) : null
		};
	});

	// Channel → colour (matches booking grid)
	const CHANNEL_COLOURS: Record<string, string> = {
		Direct: '#14b8a6',
		Expedia: '#f59e0b',
		'Booking.com': '#2563eb'
	};
	function bookingColor(channelName: string | null): string {
		return CHANNEL_COLOURS[channelName ?? ''] ?? '#a855f7';
	}

	function nightCount(b: NearbyBooking): number {
		return daysBetween(b.checkInDate, b.checkOutDate);
	}
</script>

<div class="border border-border rounded-lg p-3 hover:bg-muted/10 transition-colors space-y-2">
	<!-- Room info row -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex items-baseline gap-2 flex-wrap">
				<span class="font-mono font-bold text-base">{room.roomNumber}</span>
				<span class="text-muted-foreground text-xs">{room.propertyName}</span>
				<span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{bedLabel()}</span>
				{#if room.typeName}
					<span class="text-muted-foreground text-xs truncate">{room.typeName}</span>
				{/if}
			</div>
		</div>
		<Button size="sm" variant="default" class="shrink-0" onclick={() => onAssign(room)}>
			{actionLabel}
		</Button>
	</div>

	<!-- Availability strip -->
	<div class="relative h-4">
		<!-- Day cells -->
		<div class="flex h-full rounded overflow-hidden gap-px">
			{#each stripDays() as day, i (i)}
				<div
					class="flex-1 h-full"
					class:opacity-90={day.isProposed}
					style={day.isProposed
						? 'background:#2dd4bf'
						: day.booking
							? `background:${bookingColor(day.booking.channelName)}; opacity:0.55`
							: day.isWeekend
								? 'background:hsl(var(--muted-foreground)/0.12)'
								: 'background:hsl(var(--muted-foreground)/0.06)'}
					title={day.iso}
				></div>
			{/each}
		</div>

		<!-- Booking span labels (overlaid) -->
		{#each bookingSpans() as span}
			{@const totalCells = stripDays().length}
			{@const pctLeft = (span.startIdx / totalCells) * 100}
			{@const pctWidth = (span.length / totalCells) * 100}
			{#if span.length >= 2}
				<div
					class="absolute top-0 h-full flex items-center overflow-hidden pointer-events-none"
					style="left:{pctLeft.toFixed(1)}%; width:{pctWidth.toFixed(1)}%"
				>
					<span class="text-white text-[9px] font-medium leading-none px-0.5 truncate drop-shadow">
						{span.booking.guestName ? span.booking.guestName.split(' ')[0] : '●'}·{nightCount(span.booking)}n
					</span>
				</div>
			{/if}
		{/each}
	</div>

	<!-- Gap summary -->
	<div class="flex items-center gap-4 text-[11px] text-muted-foreground">
		<span>
			Before:
			{#if gaps.before === null}
				<span class="text-green-600 font-medium">8d+ free</span>
			{:else if gaps.before >= 5}
				<span class="text-green-600 font-medium">{gaps.before}d free</span>
			{:else if gaps.before >= 2}
				<span class="text-amber-600 font-medium">{gaps.before}d free</span>
			{:else}
				<span class="text-muted-foreground">{gaps.before}d</span>
			{/if}
		</span>
		<span>
			After:
			{#if gaps.after === null}
				<span class="text-green-600 font-medium">16d+ free</span>
			{:else if gaps.after >= 5}
				<span class="text-green-600 font-medium">{gaps.after}d free</span>
			{:else if gaps.after >= 2}
				<span class="text-amber-600 font-medium">{gaps.after}d free</span>
			{:else}
				<span class="text-muted-foreground">{gaps.after}d</span>
			{/if}
		</span>
		<span class="ml-auto opacity-60">
			{#each [-STRIP_PRE, 0, daysBetween(checkIn, checkOut)] as offset, i}
				{#if i === 1}
					<span class="text-teal-500">▸ check-in</span>
				{/if}
			{/each}
		</span>
	</div>
</div>
