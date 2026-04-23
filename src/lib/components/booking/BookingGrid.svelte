<script lang="ts">
	import type { GridData, DaySpan, BookingSpan as BookingSpanType } from '$lib/server/booking-queries';

	type Props = {
		grid: GridData;
		today: string; // "YYYY-MM-DD"
	};

	let { grid, today }: Props = $props();

	const { year, month, daysInMonth, rooms, propertyName } = $derived(grid);

	// Day numbers 1..daysInMonth
	const days = $derived(Array.from({ length: daysInMonth }, (_, i) => i + 1));

	// Today's day number if it's in this month
	const todayDay = $derived((): number | null => {
		const [ty, tm, td] = today.split('-').map(Number);
		if (ty === year && tm === month) return td;
		return null;
	});

	// Day-of-week label for header (Su Mo Tu ...)
	const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	function dayOfWeek(day: number): string {
		return DOW[new Date(year, month - 1, day).getDay()];
	}
	function isWeekend(day: number): boolean {
		const d = new Date(year, month - 1, day).getDay();
		return d === 0 || d === 6;
	}

	// Channel → colour
	const CHANNEL_COLOURS: Record<string, string> = {
		Direct: 'bg-teal-500',
		Expedia: 'bg-amber-500',
		'Booking.com': 'bg-blue-600'
	};
	function channelColour(name: string | null): string {
		return CHANNEL_COLOURS[name ?? ''] ?? 'bg-purple-500';
	}

	// Status dot colour
	function statusDot(status: string): string {
		if (status === 'checked_in') return 'bg-green-400';
		if (status === 'checked_out') return 'bg-muted-foreground';
		return 'bg-transparent';
	}
</script>

<div class="flex min-w-0 flex-1 flex-col">
	<!-- Property label -->
	<div class="bg-muted/40 border-border border-b px-3 py-1.5">
		<span class="text-sm font-semibold">{propertyName}</span>
		<span class="text-muted-foreground ml-2 text-xs">{rooms.length} rooms</span>
	</div>

	<!-- Scrollable grid -->
	<div class="overflow-x-auto">
		<table class="border-separate border-spacing-0 text-xs">
			<!-- Date header -->
			<thead>
				<tr>
					<!-- Sticky room/type columns -->
					<th
						class="border-border bg-background sticky left-0 z-20 border-b border-r px-2 py-1.5 text-left font-medium whitespace-nowrap"
						style="min-width:52px"
					>
						Room
					</th>
					<th
						class="border-border bg-background sticky z-20 border-b border-r px-1.5 py-1.5 text-left font-medium"
						style="left:52px; min-width:28px"
					>
						T
					</th>
					<!-- Day columns -->
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
						<!-- Room number — sticky -->
						<td
							class="border-border bg-background group-hover:bg-muted/30 sticky left-0 z-10 border-b border-r px-2 py-0 font-mono font-medium whitespace-nowrap"
							style="min-width:52px; height:32px"
						>
							{room.roomNumber}
						</td>
						<!-- Room type category — sticky -->
						<td
							class="border-border bg-background group-hover:bg-muted/30 sticky z-10 border-b border-r px-1 py-0 text-center"
							style="left:52px; min-width:28px"
						>
							{#if room.roomTypeCategory}
								<span class="text-muted-foreground font-medium">
									{room.roomTypeCategory}
								</span>
							{/if}
						</td>

						<!-- Day spans -->
						{#each room.spans as span (span.day)}
							{#if span.type === 'free'}
								<td
									class={[
										'border-border border-b border-r p-0',
										isWeekend(span.day) ? 'bg-muted/20' : '',
										todayDay() === span.day ? 'bg-primary/5' : ''
									].join(' ')}
									style="min-width:36px; width:36px; height:32px"
								>
									<!-- empty clickable cell — booking creation hook goes here -->
								</td>
							{:else}
								{@const s = span as BookingSpanType}
								<td
									colspan={s.length}
									class="border-border border-b border-r p-0"
									style="min-width:{s.length * 36}px; height:32px"
								>
									<div
										class={[
											'relative flex h-full items-center overflow-hidden px-1.5',
											channelColour(s.booking.channelName),
											'text-white'
										].join(' ')}
										style={s.overflowStart ? 'border-radius:0 4px 4px 0' : s.overflowEnd ? 'border-radius:4px 0 0 4px' : 'border-radius:4px'}
									>
										<!-- Left chevron for check-in (not overflow start) -->
										{#if !s.overflowStart}
											<span class="mr-0.5 shrink-0 opacity-70">›</span>
										{/if}

										<!-- Guest name + channel badge -->
										<span class="min-w-0 truncate text-[11px] font-medium leading-none">
											{s.booking.guestName ?? '—'}
										</span>

										{#if s.booking.channelName && s.booking.channelName !== 'Direct'}
											<span class="ml-1 shrink-0 rounded bg-black/20 px-1 py-0.5 text-[9px] font-bold uppercase leading-none">
												{s.booking.channelName === 'Expedia' ? 'E' : 'B'}
											</span>
										{/if}

										<!-- Status dot (checked_in = green) -->
										{#if s.booking.status === 'checked_in'}
											<span class="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-300"></span>
										{/if}

										<!-- Overflow end indicator -->
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
