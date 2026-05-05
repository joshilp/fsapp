<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		startDate: string; // YYYY-MM-DD — first column in view
		numDays: number;
		viewMode: 'grid' | 'today';
	};

	let { startDate, numDays, viewMode }: Props = $props();

	const MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];

	// ── Nav helpers ────────────────────────────────────────────────────────────

	function shiftDays(iso: string, n: number): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + n);
		return d.toISOString().slice(0, 10);
	}

	function shiftMonths(iso: string, n: number): string {
		const d = new Date(iso + 'T12:00:00');
		d.setMonth(d.getMonth() + n);
		// Snap to 1st of that month for month-step navigation
		d.setDate(1);
		return d.toISOString().slice(0, 10);
	}

	function gridHref(start: string): string {
		return `/booking?start=${start}`;
	}

	function todayHref(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = now.getMonth() + 1;
		return `/booking?start=${y}-${String(m).padStart(2, '0')}-01`;
	}

	// ── Display label ──────────────────────────────────────────────────────────

	const endDate = $derived.by(() => {
		const d = new Date(startDate + 'T12:00:00');
		d.setDate(d.getDate() + numDays - 1);
		return d.toISOString().slice(0, 10);
	});

	const windowLabel = $derived.by(() => {
		const sd = new Date(startDate + 'T12:00:00');
		const ed = new Date(endDate + 'T12:00:00');
		const sMonth = sd.getMonth();
		const eMonth = ed.getMonth();
		const year = sd.getFullYear();
		// If window starts on the 1st and stays within the same month → show "Month YYYY"
		if (sd.getDate() === 1 && sMonth === eMonth && sd.getFullYear() === ed.getFullYear()) {
			return `${MONTHS[sMonth]} ${year}`;
		}
		// Cross-month or offset start: show date range
		const fmt = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
		const yearSuffix = ` ${year}`;
		if (sMonth === eMonth) return `${fmt(sd)} – ${fmt(ed)}${yearSuffix}`;
		return `${fmt(sd)} – ${fmt(ed)}, ${ed.getFullYear()}`;
	});

	const isCurrentWindow = $derived.by(() => {
		const now = new Date();
		const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
		return startDate === firstOfMonth;
	});

	// ── Jump-to-date ──────────────────────────────────────────────────────────
	let jumpDate = $state('');
	function onJump() {
		if (/^\d{4}-\d{2}-\d{2}$/.test(jumpDate)) {
			window.location.href = gridHref(jumpDate);
		}
	}
</script>

<div class="border-border bg-background sticky top-14 z-40 border-b">
	<div class="flex flex-wrap items-center gap-2 px-4 py-2">

		<!-- Month / week / day navigation -->
		<div class="flex items-center">
			<Button href={gridHref(shiftMonths(startDate, -1))} variant="ghost" size="sm"
				class="h-8 w-8 p-0 text-muted-foreground" title="Previous month">‹‹</Button>
			<Button href={gridHref(shiftDays(startDate, -7))} variant="ghost" size="sm"
				class="h-8 w-8 p-0" title="Previous week">‹</Button>
			<Button href={gridHref(shiftDays(startDate, -1))} variant="ghost" size="sm"
				class="h-8 w-7 p-0 text-xs text-muted-foreground" title="Previous day">‹d</Button>

			<span class="min-w-44 text-center text-sm font-medium px-1 select-none">
				{windowLabel}
			</span>

			<Button href={gridHref(shiftDays(startDate, 1))} variant="ghost" size="sm"
				class="h-8 w-7 p-0 text-xs text-muted-foreground" title="Next day">d›</Button>
			<Button href={gridHref(shiftDays(startDate, 7))} variant="ghost" size="sm"
				class="h-8 w-8 p-0" title="Next week">›</Button>
			<Button href={gridHref(shiftMonths(startDate, 1))} variant="ghost" size="sm"
				class="h-8 w-8 p-0 text-muted-foreground" title="Next month">››</Button>
		</div>

		{#if !isCurrentWindow}
			<Button href={todayHref()} variant="outline" size="sm" class="h-8 text-xs">
				Today
			</Button>
		{/if}

		<!-- Jump to date -->
		<div class="flex items-center gap-1">
			<input
				type="date"
				bind:value={jumpDate}
				onchange={onJump}
				class="h-8 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground focus:text-foreground"
				title="Jump to date"
			/>
		</div>

		<div class="ml-auto flex items-center gap-1">
			<Button
				href={`/booking?start=${startDate}`}
				variant={viewMode === 'grid' ? 'default' : 'ghost'}
				size="sm"
				class="h-8 text-xs"
			>
				Grid
			</Button>
			<Button
				href={`/booking?start=${startDate}&view=today`}
				variant={viewMode === 'today' ? 'default' : 'ghost'}
				size="sm"
				class="h-8 text-xs"
			>
				Today
			</Button>
		</div>
	</div>
</div>
