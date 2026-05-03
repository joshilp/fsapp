<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ─── State ────────────────────────────────────────────────────────────────
	let year = $state(data.year);
	let propertyId = $state(data.propertiesList[0]?.id ?? '');
	let selectedSeason = $state<typeof data.seasonsList[0] | null>(null);
	let panelMode = $state<'view' | 'edit' | 'create'>('view');
	let createStart = $state('');
	let createEnd = $state('');
	let saving = $state(false);
	let deleting = $state(false);

	// ─── Derived: seasons for current property ─────────────────────────────
	const seasons = $derived(data.seasonsList.filter((s) => s.propertyId === propertyId));
	const roomTypes = $derived(data.roomTypesList.filter((rt) => rt.propertyId === propertyId));

	// ─── Day → season map (rebuilt when seasons or year change) ───────────
	const dayMap = $derived.by(() => {
		const m = new Map<string, typeof seasons[0]>();
		for (const s of seasons) {
			// Only map days that fall within the displayed year
			const start = s.startDate > `${year}-01-01` ? s.startDate : `${year}-01-01`;
			const end = s.endDate < `${year}-12-31` ? s.endDate : `${year}-12-31`;
			if (start > end) continue;
			let cur = new Date(start + 'T12:00:00');
			const endD = new Date(end + 'T12:00:00');
			while (cur <= endD) {
				m.set(cur.toISOString().slice(0, 10), s);
				cur.setDate(cur.getDate() + 1);
			}
		}
		return m;
	});

	// ─── Calendar generation ───────────────────────────────────────────────
	type CalDay = { iso: string; day: number; inMonth: boolean };
	type CalMonth = { name: string; weeks: CalDay[][] };

	const calMonths = $derived.by((): CalMonth[] => {
		const MONTH_NAMES = ['January','February','March','April','May','June',
			'July','August','September','October','November','December'];
		return MONTH_NAMES.map((name, mi) => {
			const firstDay = new Date(year, mi, 1);
			const lastDay = new Date(year, mi + 1, 0);
			// Start grid on Sunday
			const startPad = firstDay.getDay(); // 0=Sun
			const weeks: CalDay[][] = [];
			let week: CalDay[] = [];

			// Padding days from prev month
			for (let i = 0; i < startPad; i++) {
				const d = new Date(year, mi, 1 - (startPad - i));
				week.push({ iso: d.toISOString().slice(0, 10), day: d.getDate(), inMonth: false });
			}

			for (let d = 1; d <= lastDay.getDate(); d++) {
				const iso = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				week.push({ iso, day: d, inMonth: true });
				if (week.length === 7) { weeks.push(week); week = []; }
			}
			// Trailing padding
			while (week.length > 0 && week.length < 7) {
				week.push({ iso: '', day: 0, inMonth: false });
			}
			if (week.length) weeks.push(week);
			return { name, weeks };
		});
	});

	// ─── Helpers ──────────────────────────────────────────────────────────
	const today = new Date().toISOString().slice(0, 10);

	function fmt(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

	function textColour(hex: string): string {
		if (!hex || hex.length < 7) return '#000';
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#1a1a1a' : '#ffffff';
	}

	function dayStyle(iso: string): string {
		if (!iso) return '';
		const s = dayMap.get(iso);
		if (!s) return '';
		return `background:${s.colour};color:${textColour(s.colour)}`;
	}

	function clickDay(iso: string) {
		if (!iso) return;
		const s = dayMap.get(iso);
		if (s) {
			selectedSeason = s;
			panelMode = 'view';
		} else {
			createStart = iso;
			createEnd = iso;
			selectedSeason = null;
			panelMode = 'create';
		}
	}

	// Colour-bar spans: compute contiguous runs per month row for the legend strip
	function seasonRuns(weeks: CalDay[][]): { iso: string; season: typeof seasons[0] }[] {
		const seen = new Set<string>();
		const runs: { iso: string; season: typeof seasons[0] }[] = [];
		for (const week of weeks) {
			for (const d of week) {
				if (!d.inMonth || !d.iso) continue;
				const s = dayMap.get(d.iso);
				if (s && !seen.has(s.id)) { seen.add(s.id); runs.push({ iso: d.iso, season: s }); }
			}
		}
		return runs;
	}
</script>

<svelte:head>
	<title>Rate Calendar {year}</title>
</svelte:head>

<style>
	@media print {
		.no-print { display: none !important; }
		.print-full { break-inside: avoid; }
		:global(body) { font-size: 9pt; }
		/* Force background colors to print */
		* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
		@page { margin: 0.4in; size: letter landscape; }
	}
</style>

<div class="flex min-h-screen">

	<!-- ── Main calendar area ───────────────────────────────────────────────── -->
	<div class="flex-1 min-w-0 px-4 py-5">

		<!-- Toolbar -->
		<div class="no-print mb-4 flex flex-wrap items-center gap-3">
			<h1 class="text-lg font-bold">Rate Calendar</h1>

			<!-- Year nav -->
			<div class="flex items-center gap-1 rounded-lg border px-1">
				<a href="?year={year - 1}&prop={propertyId}"
					class="px-2 py-1 text-sm hover:bg-muted rounded">‹</a>
				<span class="px-2 text-sm font-semibold">{year}</span>
				<a href="?year={year + 1}&prop={propertyId}"
					class="px-2 py-1 text-sm hover:bg-muted rounded">›</a>
			</div>

			<!-- Property selector -->
			<div class="flex items-center gap-2">
				{#each data.propertiesList as prop}
					<button
						onclick={() => { propertyId = prop.id; selectedSeason = null; }}
						class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors {propertyId === prop.id ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}"
					>{prop.name}</button>
				{/each}
			</div>

			<button
				onclick={() => window.print()}
				class="ml-auto rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
			>🖨 Print</button>

			<a href="/settings#pricing" class="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 no-print">
				Settings →
			</a>
		</div>

		<!-- Season legend -->
		{#if seasons.length > 0}
			<div class="no-print mb-4 flex flex-wrap gap-2">
				{#each seasons as s}
					<button
						onclick={() => { selectedSeason = s; panelMode = 'view'; }}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity {selectedSeason?.id === s.id ? 'ring-2 ring-offset-1 ring-foreground' : 'hover:opacity-80'}"
						style="background:{s.colour};color:{textColour(s.colour)};border-color:{s.colour}"
					>
						<span>{s.name}</span>
						<span class="opacity-70">{s.startDate.slice(5)} – {s.endDate.slice(5)}</span>
						{#if s.minNights > 1}<span class="rounded bg-black/20 px-1">{s.minNights}+ nights</span>{/if}
					</button>
				{/each}
			</div>
		{/if}

		<!-- 12-month grid -->
		<div class="grid grid-cols-3 gap-4 xl:grid-cols-4 print:grid-cols-4 print:gap-2">
			{#each calMonths as month, mi}
				<div class="print-full">
					<!-- Month heading -->
					<div class="mb-1 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-[8pt]">
						{month.name}
					</div>

					<!-- Day-of-week header -->
					<div class="mb-px grid grid-cols-7 text-center text-[9px] text-muted-foreground print:text-[7pt]">
						{#each ['S','M','T','W','T','F','S'] as d}
							<div class="py-0.5">{d}</div>
						{/each}
					</div>

					<!-- Weeks -->
					{#each month.weeks as week}
						<div class="grid grid-cols-7 gap-px mb-px">
							{#each week as cell}
								{#if !cell.inMonth}
									<div class="h-6 print:h-5"></div>
								{:else}
									{@const style = dayStyle(cell.iso)}
									{@const isToday = cell.iso === today}
									{@const hasSeason = dayMap.has(cell.iso)}
									<button
										class="no-print h-6 w-full rounded text-[10px] font-medium leading-none transition-all hover:brightness-90 active:scale-95
											{isToday ? 'ring-2 ring-primary ring-offset-1' : ''}
											{!hasSeason ? 'text-foreground hover:bg-muted' : ''}
											{selectedSeason && dayMap.get(cell.iso)?.id === selectedSeason.id ? 'ring-1 ring-black/40' : ''}"
										style={style || ''}
										onclick={() => clickDay(cell.iso)}
									>{cell.day}</button>
									<!-- Print version: static div -->
									<div
										class="hidden print:flex h-5 w-full items-center justify-center rounded text-[7pt] font-medium leading-none
											{isToday ? 'ring-1 ring-black' : ''}"
										style={style || ''}
									>{cell.day}</div>
								{/if}
							{/each}
						</div>
					{/each}

					<!-- Season colour bar under each month (print hint) -->
					<div class="mt-1 flex gap-0.5 flex-wrap">
						{#each seasonRuns(month.weeks) as run}
							<span class="rounded px-1 text-[8px] leading-none py-0.5 print:text-[6pt]"
								style="background:{run.season.colour};color:{textColour(run.season.colour)}">
								{run.season.name.split(/[\s–\-]/)[0]}
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- ── Side panel ──────────────────────────────────────────────────────── -->
	<div class="no-print border-l w-80 shrink-0 overflow-y-auto bg-background p-4">

		{#if panelMode === 'create'}
			<!-- Create new season -->
			<h2 class="mb-3 font-semibold text-sm">New Season</h2>
			<form method="POST" action="?/upsertSeason"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => { saving = false; panelMode = 'view'; await update(); };
				}}
				class="space-y-3"
			>
				<input type="hidden" name="propertyId" value={propertyId} />
				<input type="hidden" name="sortOrder" value="0" />

				<div class="flex flex-col gap-1">
					<label class="text-xs text-muted-foreground">Season name</label>
					<input name="name" required placeholder="e.g. Easter Long Weekend"
						class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label class="text-xs text-muted-foreground">Start</label>
						<input name="startDate" type="date" bind:value={createStart} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
					<div class="flex flex-col gap-1">
						<label class="text-xs text-muted-foreground">End</label>
						<input name="endDate" type="date" bind:value={createEnd} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label class="text-xs text-muted-foreground">Colour</label>
						<input type="color" name="colour" value="#fde68a"
							class="h-8 w-full rounded border cursor-pointer" />
					</div>
					<div class="flex flex-col gap-1">
						<label class="text-xs text-muted-foreground">Min nights</label>
						<input name="minNights" type="number" min="1" max="14" value="1"
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
				</div>

				<!-- Rates per room type -->
				<div class="border-t pt-3">
					<p class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Nightly Rates</p>
					<p class="text-xs text-muted-foreground mb-2">You can set rates after saving.</p>
				</div>

				<div class="flex gap-2 pt-1">
					<button type="submit" disabled={saving}
						class="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
						{saving ? 'Saving…' : 'Create Season'}
					</button>
					<button type="button" onclick={() => { panelMode = 'view'; selectedSeason = null; }}
						class="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
				</div>
			</form>

		{:else if selectedSeason}
			<!-- View / Edit season -->
			{@const s = selectedSeason}

			<!-- Season header -->
			<div class="mb-3 flex items-center gap-2">
				<div class="h-4 w-4 rounded-sm shrink-0" style="background:{s.colour}"></div>
				<div class="min-w-0">
					<p class="font-semibold text-sm truncate">{s.name}</p>
					<p class="text-xs text-muted-foreground">{s.startDate} → {s.endDate}</p>
				</div>
				<button onclick={() => { panelMode = panelMode === 'edit' ? 'view' : 'edit'; }}
					class="ml-auto shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-muted">
					{panelMode === 'edit' ? 'Cancel' : 'Edit'}
				</button>
			</div>

			{#if panelMode === 'edit'}
				<!-- Edit season form -->
				<form method="POST" action="?/upsertSeason"
					use:enhance={() => {
						saving = true;
						return async ({ update }) => {
							saving = false;
							panelMode = 'view';
							await update();
							// Re-select season with updated data
							selectedSeason = data.seasonsList.find(x => x.id === s.id) ?? null;
						};
					}}
					class="space-y-3 mb-4"
				>
					<input type="hidden" name="id" value={s.id} />
					<input type="hidden" name="propertyId" value={s.propertyId} />
					<input type="hidden" name="sortOrder" value={s.sortOrder} />

					<div class="flex flex-col gap-1">
						<label class="text-xs text-muted-foreground">Name</label>
						<input name="name" value={s.name} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Start</label>
							<input name="startDate" type="date" value={s.startDate}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">End</label>
							<input name="endDate" type="date" value={s.endDate}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Colour</label>
							<input type="color" name="colour" value={s.colour}
								class="h-8 w-full rounded border cursor-pointer" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Min nights</label>
							<input name="minNights" type="number" min="1" max="14" value={s.minNights}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
					</div>
					<button type="submit" disabled={saving}
						class="w-full rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
						{saving ? 'Saving…' : 'Save Changes'}
					</button>
				</form>

				<!-- Delete -->
				<form method="POST" action="?/deleteSeason"
					use:enhance={() => {
						deleting = true;
						return async ({ update }) => { deleting = false; selectedSeason = null; panelMode = 'view'; await update(); };
					}}
				>
					<input type="hidden" name="id" value={s.id} />
					<button type="submit" disabled={deleting}
						class="w-full rounded-md border border-destructive/50 text-destructive px-3 py-1.5 text-sm hover:bg-destructive/5">
						{deleting ? 'Deleting…' : 'Delete Season'}
					</button>
				</form>
			{:else}
				<!-- Rate table (view + inline edit) -->
				<div class="mb-2 text-xs text-muted-foreground">
					{#if s.minNights > 1}
						<span class="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 font-medium">{s.minNights}-night minimum</span>
					{/if}
				</div>

				<div class="space-y-2">
					{#each roomTypes as rt}
						{@const tier = s.tiers.find(t => t.roomTypeId === rt.id)}
						<form method="POST" action="?/upsertRateTier"
							use:enhance={() => {
								saving = true;
								return async ({ update }) => { saving = false; await update({ reset: false }); };
							}}
							class="flex items-center gap-2"
						>
							<input type="hidden" name="seasonId" value={s.id} />
							<input type="hidden" name="roomTypeId" value={rt.id} />
							<div class="flex-1 min-w-0">
								<span class="text-xs font-medium">{rt.category}: {rt.name}</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-xs text-muted-foreground">$</span>
								<input
									name="nightlyRate"
									type="number"
									min="0"
									step="1"
									value={tier ? (tier.nightlyRate / 100).toFixed(0) : ''}
									placeholder="—"
									class="border-input bg-background w-20 rounded border px-2 py-1 text-sm font-mono text-right"
								/>
								<button type="submit" class="rounded border px-2 py-1 text-xs hover:bg-muted" disabled={saving}>✓</button>
							</div>
						</form>
					{/each}
					{#if roomTypes.length === 0}
						<p class="text-xs text-muted-foreground">No room types configured for this property.</p>
					{/if}
				</div>
			{/if}

		{:else}
			<!-- Empty state -->
			<div class="text-center py-12">
				<p class="text-muted-foreground text-sm">Click any day to view or edit its season.</p>
				<p class="text-muted-foreground text-xs mt-1">Click an uncoloured day to create a new season.</p>
			</div>
		{/if}
	</div>
</div>
