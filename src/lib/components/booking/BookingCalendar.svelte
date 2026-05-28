<script lang="ts">
	import type { CalendarDay } from '$routes/api/public/rate-calendar/+server';

	let {
		propertyId,
		today,
		accent = '#d97706',
		checkIn  = $bindable(),
		checkOut = $bindable()
	}: {
		propertyId: string;
		today: string;
		accent?: string;
		checkIn: string;
		checkOut: string;
	} = $props();

	// ── Calendar view state ───────────────────────────────────────────────────
	const todayDate  = new Date(today + 'T12:00:00');
	let viewYear  = $state(todayDate.getFullYear());
	let viewMonth = $state(todayDate.getMonth()); // 0-based

	const nextYear  = $derived(viewMonth === 11 ? viewYear + 1 : viewYear);
	const nextMonth = $derived(viewMonth === 11 ? 0 : viewMonth + 1);

	// ── Rate data cache ───────────────────────────────────────────────────────
	let calCache = $state(new Map<string, CalendarDay[]>());

	async function fetchMonth(y: number, m: number) {
		const key = `${y}-${String(m + 1).padStart(2, '0')}`;
		if (calCache.has(key)) return;
		try {
			const res = await fetch(`/api/public/rate-calendar?propertyId=${propertyId}&year=${y}&month=${m + 1}`);
			if (res.ok) {
				const data: CalendarDay[] = await res.json();
				const next = new Map(calCache);
				next.set(key, data);
				calCache = next;
			}
		} catch { /* ignore */ }
	}

	$effect(() => {
		fetchMonth(viewYear, viewMonth);
		fetchMonth(nextYear, nextMonth);
	});

	function getDayData(date: string): CalendarDay | undefined {
		const key = date.slice(0, 7);
		return calCache.get(key)?.find((d) => d.date === date);
	}

	// ── Date selection ────────────────────────────────────────────────────────
	let phase = $state<'checkin' | 'checkout'>('checkin');
	let hoverDate = $state<string | null>(null);

	function handleDay(date: string) {
		if (date < today) return;
		const d = getDayData(date);
		if (d?.stopSell) return;

		if (phase === 'checkin' || date <= checkIn) {
			checkIn = date;
			const next = new Date(date + 'T12:00:00');
			next.setDate(next.getDate() + (d?.minNights ?? 1));
			if (checkOut <= checkIn) checkOut = next.toISOString().slice(0, 10);
			phase = 'checkout';
		} else {
			checkOut = date;
			phase = 'checkin';
		}
	}

	function isInRange(date: string): boolean {
		const end = (phase === 'checkout' && hoverDate && hoverDate > checkIn) ? hoverDate : checkOut;
		return date > checkIn && date < end;
	}

	// ── Calendar grid helpers ─────────────────────────────────────────────────
	function weeksOf(y: number, m: number): (string | null)[][] {
		const days: (string | null)[] = [];
		const firstDow = new Date(y, m, 1).getDay();
		const total    = new Date(y, m + 1, 0).getDate();
		for (let i = 0; i < firstDow; i++) days.push(null);
		for (let d = 1; d <= total; d++) {
			days.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
		}
		while (days.length % 7 !== 0) days.push(null);
		const weeks: (string | null)[][] = [];
		for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
		return weeks;
	}

	function prevMonth() {
		if (viewMonth === 0) { viewYear--; viewMonth = 11; } else viewMonth--;
	}
	function nextMonthNav() {
		if (viewMonth === 11) { viewYear++; viewMonth = 0; } else viewMonth++;
	}

	const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

	function fmtFull(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<div class="w-full select-none">
	<!-- Nav header -->
	<div class="flex items-center justify-between mb-3">
		<button type="button" onclick={prevMonth}
			class="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors">
			‹
		</button>
		<span class="text-sm font-semibold text-stone-700">
			{MONTHS[viewMonth]} {viewYear} — {MONTHS[nextMonth]} {nextYear}
		</span>
		<button type="button" onclick={nextMonthNav}
			class="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 transition-colors">
			›
		</button>
	</div>

	<!-- Two months side by side (stacked on small screens) -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
		{#each [[viewYear, viewMonth], [nextYear, nextMonth]] as [y, m]}
			{@const weeks = weeksOf(y as number, m as number)}
			<div>
				<p class="text-xs font-semibold text-stone-500 text-center mb-2 uppercase tracking-wide">
					{MONTHS[m as number]} {y}
				</p>
				<!-- Day-of-week headers -->
				<div class="grid grid-cols-7 mb-1">
					{#each DAYS as day}
						<div class="text-center text-[10px] text-stone-400 font-medium py-1">{day}</div>
					{/each}
				</div>
				<!-- Weeks -->
				{#each weeks as week}
					<div class="grid grid-cols-7">
						{#each week as date}
							{#if date}
								{@const dd       = getDayData(date)}
								{@const isPast   = date < today}
								{@const isStopped = dd?.stopSell ?? false}
								{@const isCI     = date === checkIn}
								{@const isCO     = date === checkOut}
								{@const inRange  = isInRange(date)}
								{@const disabled = isPast || isStopped}
								<button
									type="button"
									{disabled}
									onclick={() => handleDay(date)}
									onmouseenter={() => { if (phase === 'checkout') hoverDate = date; }}
									onmouseleave={() => { hoverDate = null; }}
									class={[
										'flex flex-col items-center justify-center py-1.5 rounded-lg text-xs transition-colors',
										disabled ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer',
										inRange && !disabled ? 'bg-amber-50' : '',
										!isCI && !isCO && !disabled ? 'hover:bg-stone-100' : ''
									].join(' ')}
									style={isCI || isCO ? `background-color:${accent}; color:white; border-radius:8px;` : ''}
								>
									<span class="font-medium leading-none">{parseInt((date as string).slice(8))}</span>
									{#if dd?.lowestRateCents && !isStopped}
										<span class="text-[9px] leading-none mt-0.5 {isCI || isCO ? 'opacity-80' : 'text-stone-400'}">
											${Math.round(dd.lowestRateCents / 100)}
										</span>
									{:else if isStopped}
										<span class="text-[9px] leading-none mt-0.5 text-stone-300">—</span>
									{/if}
								</button>
							{:else}
								<div></div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>

	<!-- Selected range summary -->
	<div class="mt-4 flex items-center gap-3 rounded-xl bg-stone-50 border border-stone-100 px-4 py-3 text-sm">
		<button type="button" onclick={() => { phase = 'checkin'; }}
			class="flex-1 text-left {phase === 'checkin' ? 'font-semibold' : ''}">
			<span class="block text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">Check-in</span>
			<span class="text-stone-800">{fmtFull(checkIn)}</span>
		</button>
		<span class="text-stone-300 text-base">→</span>
		<button type="button" onclick={() => { phase = 'checkout'; }}
			class="flex-1 text-right {phase === 'checkout' ? 'font-semibold' : ''}">
			<span class="block text-[10px] uppercase tracking-wide text-stone-400 mb-0.5">Check-out</span>
			<span class="text-stone-800">{fmtFull(checkOut)}</span>
		</button>
	</div>

	{#if phase === 'checkout'}
		<p class="mt-2 text-center text-xs text-stone-400">Now click your check-out date</p>
	{:else}
		<p class="mt-2 text-center text-xs text-stone-400">Click a date to change check-in</p>
	{/if}
</div>
