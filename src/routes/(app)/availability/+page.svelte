<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Group rooms by property
	const properties = $derived(() => {
		const map = new Map<string, { name: string; rooms: typeof data.rooms }>();
		for (const r of data.rooms) {
			if (!map.has(r.propertyId)) map.set(r.propertyId, { name: r.propertyName, rooms: [] });
			map.get(r.propertyId)!.rooms.push(r);
		}
		return [...map.values()];
	});

	// Index bookings by roomId for O(1) lookup
	const bookingsByRoom = $derived(() => {
		const m = new Map<string, typeof data.bookings>();
		for (const b of data.bookings) {
			if (!b.roomId) continue;
			if (!m.has(b.roomId)) m.set(b.roomId, []);
			m.get(b.roomId)!.push(b);
		}
		return m;
	});

	// Compute CSS grid column positions for a booking
	function bookingCols(b: { checkInDate: string; checkOutDate: string }) {
		const start = Math.max(0, dayDiff(data.startDate, b.checkInDate));
		const end   = Math.min(data.days.length, dayDiff(data.startDate, b.checkOutDate));
		if (start >= data.days.length || end <= 0) return null;
		// +2 because col 1 is room label
		return { colStart: start + 2, colEnd: end + 2 };
	}

	function dayDiff(a: string, b: string): number {
		return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
	}

	function isToday(iso: string) { return iso === data.today; }
	function isWeekend(iso: string) {
		const dow = new Date(iso + 'T12:00:00').getDay();
		return dow === 0 || dow === 6;
	}

	function fmtDay(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString('en-CA', { weekday: 'short' }).slice(0, 2);
	}
	function fmtDayNum(iso: string) {
		return parseInt(iso.slice(8));
	}
	function fmtMonth(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short' });
	}
	function fmtDateRange(start: string, end: string) {
		const s = new Date(start + 'T12:00:00');
		const e = new Date(end   + 'T12:00:00');
		e.setDate(e.getDate() - 1); // last night, not checkout day
		return s.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
		       ' – ' +
		       e.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	const STATUS_STYLES: Record<string, string> = {
		confirmed:   'bg-blue-500   text-white',
		checked_in:  'bg-emerald-500 text-white',
		checked_out: 'bg-stone-400  text-white',
		reserved:    'bg-amber-400  text-white',
	};
	function statusStyle(s: string) {
		return STATUS_STYLES[s] ?? 'bg-violet-500 text-white';
	}

	const CELL_W = 44; // px per day column
	const LABEL_W = 148; // px for room label column
	const ROW_H  = 48;  // px per room row
	const HEADER_H = 56; // px for header row
</script>

<svelte:head>
	<title>Availability Calendar</title>
</svelte:head>

<div class="h-screen flex flex-col overflow-hidden">
	<!-- Top bar -->
	<div class="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0 gap-4">
		<div>
			<h1 class="text-lg font-bold text-stone-900">Availability Calendar</h1>
			<p class="text-xs text-stone-500">{fmtDateRange(data.startDate, data.endDate)}</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="?offset={data.prevOffset}"
				class="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50 transition-colors">
				← Prev
			</a>
			<a href="/availability"
				class="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50 transition-colors">
				Today
			</a>
			<a href="?offset={data.nextOffset}"
				class="rounded-lg border border-stone-200 px-3 py-1.5 text-sm hover:bg-stone-50 transition-colors">
				Next →
			</a>
		</div>
		<!-- Legend -->
		<div class="hidden sm:flex items-center gap-3 text-xs">
			{#each [['confirmed','bg-blue-500'],['checked_in','bg-emerald-500'],['checked_out','bg-stone-400'],['reserved','bg-amber-400']] as [label, cls]}
				<span class="flex items-center gap-1.5">
					<span class="inline-block w-2.5 h-2.5 rounded-sm {cls}"></span>
					<span class="text-stone-500">{label.replace('_',' ')}</span>
				</span>
			{/each}
		</div>
	</div>

	<!-- Grid area — horizontally and vertically scrollable -->
	<div class="flex-1 overflow-auto">
		{#each properties() as prop}
			{#if properties().length > 1}
				<div class="px-3 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide bg-stone-50 border-b sticky top-0 z-30">
					{prop.name}
				</div>
			{/if}

			<div
				class="relative"
				style="
					display: grid;
					grid-template-columns: {LABEL_W}px repeat({data.days.length}, {CELL_W}px);
					min-width: {LABEL_W + data.days.length * CELL_W}px;
				"
			>
				<!-- ── Header row ── -->
				<div
					class="sticky left-0 z-20 bg-white border-b border-r border-stone-200 flex items-end pb-2 px-3"
					style="grid-column: 1; grid-row: 1; height: {HEADER_H}px;"
				>
					<span class="text-xs font-semibold text-stone-400">ROOM</span>
				</div>

				{#each data.days as day, di}
					<div
						class="border-b border-r border-stone-200 flex flex-col items-center justify-end pb-1.5 text-center
							{isToday(day) ? 'bg-blue-50' : isWeekend(day) ? 'bg-stone-50' : 'bg-white'}"
						style="grid-column: {di + 2}; grid-row: 1; height: {HEADER_H}px;"
					>
						<span class="text-[10px] text-stone-400 leading-none">{fmtDay(day)}</span>
						<span class="text-sm font-bold leading-tight {isToday(day) ? 'text-blue-600' : 'text-stone-800'}">{fmtDayNum(day)}</span>
						<span class="text-[10px] text-stone-400 leading-none">{fmtMonth(day)}</span>
					</div>
				{/each}

				<!-- ── Room rows ── -->
				{#each prop.rooms as room, ri}
					{@const rowIdx = ri + 2}
					{@const roomBookings = bookingsByRoom().get(room.id) ?? []}

					<!-- Room label (sticky) -->
					<div
						class="sticky left-0 z-10 bg-white border-b border-r border-stone-200 px-3 flex flex-col justify-center"
						style="grid-column: 1; grid-row: {rowIdx}; height: {ROW_H}px;"
					>
						<span class="text-sm font-semibold text-stone-800 leading-tight">Rm {room.roomNumber}</span>
						<span class="text-[11px] text-stone-400 leading-tight truncate">{room.roomTypeName}</span>
					</div>

					<!-- Day background cells -->
					{#each data.days as day, di}
						<div
							class="border-b border-r border-stone-100
								{isToday(day) ? 'bg-blue-50/50' : isWeekend(day) ? 'bg-stone-50/50' : ''}"
							style="grid-column: {di + 2}; grid-row: {rowIdx}; height: {ROW_H}px;"
						></div>
					{/each}

					<!-- Booking blocks (overlaid on day cells) -->
					{#each roomBookings as b}
						{@const cols = bookingCols(b)}
						{#if cols}
							<a
								href="/booking/{b.id}"
								class="flex items-center px-2 rounded-md text-xs font-medium truncate shadow-sm transition-opacity hover:opacity-80 z-10"
								style="
									grid-column: {cols.colStart} / {cols.colEnd};
									grid-row: {rowIdx};
									height: {ROW_H - 8}px;
									margin: 4px 1px;
									align-self: center;
								"
								class:bg-blue-500={b.status === 'confirmed'}
								class:bg-emerald-500={b.status === 'checked_in'}
								class:bg-stone-400={b.status === 'checked_out'}
								class:bg-amber-400={b.status === 'reserved'}
								class:bg-violet-500={!['confirmed','checked_in','checked_out','reserved'].includes(b.status)}
								class:text-white={true}
								title="{b.guestName} · {b.checkInDate} → {b.checkOutDate}"
							>
								{b.guestName}
							</a>
						{/if}
					{/each}
				{/each}
			</div>
		{/each}

		{#if data.rooms.length === 0}
			<div class="flex items-center justify-center h-40 text-stone-400 text-sm">
				No active rooms found. Add rooms in Settings.
			</div>
		{/if}
	</div>
</div>
