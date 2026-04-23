<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		year: number;
		month: number;
		viewMode: 'grid' | 'date';
	};

	let { year, month, viewMode }: Props = $props();

	const MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	function monthHref(offsetMonths: number): string {
		let m = month + offsetMonths;
		let y = year;
		while (m < 1) { m += 12; y--; }
		while (m > 12) { m -= 12; y++; }
		const vm = viewMode === 'date' ? '&view=date' : '';
		return `/booking?month=${y}-${String(m).padStart(2, '0')}${vm}`;
	}

	function todayHref(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth() + 1;
		return `/booking?month=${y}-${String(m).padStart(2, '0')}`;
	}

	const isCurrentMonth = $derived(() => {
		const now = new Date();
		return year === now.getFullYear() && month === now.getMonth() + 1;
	});
</script>

<div class="border-border bg-background sticky top-14 z-40 border-b">
	<div class="flex items-center gap-2 px-4 py-2">
		<!-- Month navigation -->
		<div class="flex items-center gap-1">
			<Button href={monthHref(-1)} variant="ghost" size="sm" class="h-8 w-8 p-0">‹</Button>

			<span class="min-w-36 text-center text-sm font-medium">
				{MONTHS[month - 1]} {year}
			</span>

			<Button href={monthHref(1)} variant="ghost" size="sm" class="h-8 w-8 p-0">›</Button>
		</div>

		{#if !isCurrentMonth()}
			<Button href={todayHref()} variant="outline" size="sm" class="h-8 text-xs">
				Today
			</Button>
		{/if}

		<div class="ml-auto flex items-center gap-1">
			<!-- View toggle -->
			<Button
				href={`/booking?month=${year}-${String(month).padStart(2, '0')}`}
				variant={viewMode === 'grid' ? 'default' : 'ghost'}
				size="sm"
				class="h-8 text-xs"
			>
				Grid
			</Button>
			<Button
				href={`/booking?month=${year}-${String(month).padStart(2, '0')}&view=date`}
				variant={viewMode === 'date' ? 'default' : 'ghost'}
				size="sm"
				class="h-8 text-xs"
			>
				Today
			</Button>
		</div>
	</div>
</div>
