<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ─── URL-driven state ─────────────────────────────────────────────────────
	const year       = $derived(data.year);
	const propertyId = $derived(data.activePropId);

	// ─── Panel state (reset when property changes) ────────────────────────────
	let selectedSeason = $state<typeof data.seasonsList[0] | null>(null);
	let panelMode = $state<'view' | 'edit'>('view');
	let saving = $state(false);
	let deleting = $state(false);
	let copyingYear = $state(false);
	let deletingYear = $state(false);

	$effect(() => {
		propertyId;
		selectedSeason = null;
		panelMode = 'view';
	});

	// ─── Room type rate overlays ──────────────────────────────────────────────
	let rtVisible = $state<Record<string, boolean>>({});
	const hasVisibleRTs = $derived(Object.values(rtVisible).some(Boolean));
	function toggleRT(id: string) { rtVisible[id] = !rtVisible[id]; }

	// ─── Label display mode ───────────────────────────────────────────────────
	const LABEL_MODE_KEY = 'rate-cal-label-mode';
	function loadLabelMode(): 'code' | 'name' | 'none' {
		if (typeof localStorage === 'undefined') return 'code';
		return (localStorage.getItem(LABEL_MODE_KEY) as 'code' | 'name' | 'none') || 'code';
	}
	let labelMode = $state<'code' | 'name' | 'none'>(loadLabelMode());
	function setLabelMode(m: 'code' | 'name' | 'none') {
		labelMode = m;
		if (typeof localStorage !== 'undefined') localStorage.setItem(LABEL_MODE_KEY, m);
	}
	function rtLabel(rt: { category: string; name: string }): string {
		if (labelMode === 'name') return rt.name.slice(0, 14);
		return rt.category; // short code, already compact
	}

	// ─── Derived: seasons + room types for current property ───────────────────
	const seasons      = $derived(data.seasonsList.filter((s) => s.propertyId === propertyId));
	const roomTypes    = $derived(data.roomTypesList.filter((rt) => rt.propertyId === propertyId));
	const printProperty = $derived(data.propertiesList.find(p => p.id === propertyId));

	// ─── Day → season map ─────────────────────────────────────────────────────
	const dayMap = $derived.by(() => {
		const m = new Map<string, typeof seasons[0]>();
		// Sort by date range length DESCENDING — longest seasons are written first,
		// then shorter (more specific) seasons overwrite them. Shortest range always wins.
		const sorted = [...seasons].sort((a, b) => {
			const lenA = new Date(a.endDate + 'T12:00:00').getTime() - new Date(a.startDate + 'T12:00:00').getTime();
			const lenB = new Date(b.endDate + 'T12:00:00').getTime() - new Date(b.startDate + 'T12:00:00').getTime();
			return lenB - lenA;
		});
		for (const s of sorted) {
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

	// ─── Calendar generation ──────────────────────────────────────────────────
	type CalDay = { iso: string; day: number; inMonth: boolean };
	type CalMonth = { name: string; weeks: CalDay[][] };

	const calMonths = $derived.by((): CalMonth[] => {
		const MONTH_NAMES = ['January','February','March','April','May','June',
			'July','August','September','October','November','December'];
		return MONTH_NAMES.map((name, mi) => {
			const firstDay = new Date(year, mi, 1);
			const lastDay = new Date(year, mi + 1, 0);
			const startPad = firstDay.getDay();
			const weeks: CalDay[][] = [];
			let week: CalDay[] = [];
			for (let i = 0; i < startPad; i++) {
				const d = new Date(year, mi, 1 - (startPad - i));
				week.push({ iso: d.toISOString().slice(0, 10), day: d.getDate(), inMonth: false });
			}
			for (let d = 1; d <= lastDay.getDate(); d++) {
				const iso = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				week.push({ iso, day: d, inMonth: true });
				if (week.length === 7) { weeks.push(week); week = []; }
			}
			while (week.length > 0 && week.length < 7) {
				week.push({ iso: '', day: 0, inMonth: false });
			}
			if (week.length) weeks.push(week);
			return { name, weeks };
		});
	});

	// ─── Helpers ──────────────────────────────────────────────────────────────
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

	// Nav URL helpers
	function navUrl(y: number, p?: string) {
		return `?year=${y}&prop=${p ?? propertyId}`;
	}

	// ─── Drag-to-create ──────────────────────────────────────────────────────
	const PALETTE = ['#fde68a','#bbf7d0','#bfdbfe','#fca5a5','#ddd6fe','#fed7aa','#a7f3d0','#e9d5ff','#c7d2fe'];

	function nextColour(): string {
		const used = new Set(seasons.map(s => s.colour));
		return PALETTE.find(c => !used.has(c)) ?? PALETTE[seasons.length % PALETTE.length];
	}

	function autoName(start: string, end: string): string {
		const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
		const s = new Date(start + 'T12:00:00');
		const e = new Date(end + 'T12:00:00');
		if (start === end) return `${MON[s.getMonth()]} ${s.getDate()}`;
		if (s.getMonth() === e.getMonth()) return `${MON[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
		return `${MON[s.getMonth()]} ${s.getDate()} – ${MON[e.getMonth()]} ${e.getDate()}`;
	}

	let dragAnchor = $state<string | null>(null);
	let dragTip    = $state<string | null>(null);
	let savingDrag = $state(false);

	const dragRange = $derived.by(() => {
		if (!dragAnchor || !dragTip) return null;
		const [a, b] = dragAnchor <= dragTip ? [dragAnchor, dragTip] : [dragTip, dragAnchor];
		return { start: a, end: b };
	});

	const dragDates = $derived.by(() => {
		if (!dragRange) return new Set<string>();
		const s = new Set<string>();
		let cur = new Date(dragRange.start + 'T12:00:00');
		const end = new Date(dragRange.end + 'T12:00:00');
		while (cur <= end) { s.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
		return s;
	});

	let dragPopover = $state<{
		start: string; end: string;
		name: string; colour: string;
		rate: string; minNights: string;
		hint: string | null; // describes the layer being overridden
	} | null>(null);

	function openCreate(start: string, end: string) {
		// Detect the current layer for the start date (what this new season will override)
		const underlying = dayMap.get(start);
		let hint: string | null = null;
		let prefillRate = '';
		let prefillMin = '1';
		if (underlying) {
			// Pre-fill from the underlying season's base rate, if set
			prefillRate = underlying.baseRateCents ? (underlying.baseRateCents / 100).toFixed(0) : '';
			prefillMin = underlying.minNights.toString();
			hint = `Overriding "${underlying.name}"${underlying.baseRateCents ? ` · $${(underlying.baseRateCents / 100).toFixed(0)}/night` : ''}`;
		}
		dragPopover = {
			start, end,
			name: autoName(start, end),
			colour: nextColour(),
			rate: prefillRate,
			minNights: prefillMin,
			hint
		};
		selectedSeason = null;
		panelMode = 'view';
	}

	function handleDocMouseUp() {
		if (!dragAnchor) return;
		const dr = dragRange;
		if (dr) {
			const isSingleCell = dr.start === dr.end;
			if (isSingleCell) {
				const s = dayMap.get(dr.start);
				if (s) { selectedSeason = s; panelMode = 'view'; dragPopover = null; }
				else openCreate(dr.start, dr.end);
			} else {
				openCreate(dr.start, dr.end);
			}
		}
		dragAnchor = null;
		dragTip = null;
	}
</script>

<svelte:document onmouseup={handleDocMouseUp} />

<svelte:head>
	<title>Rate Calendar {year}</title>
</svelte:head>

<style>
	@media print {
		.no-print { display: none !important; }
		.print-full { break-inside: avoid; }
		:global(body) { font-size: 9pt; }
		* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
		@page { margin: 0.35in; size: letter landscape; }
	}
</style>

<!-- Drag-to-create popover -->
{#if dragPopover}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
		role="dialog" aria-modal="true"
		onmousedown={(e) => { if (e.target === e.currentTarget) dragPopover = null; }}>
		<div class="bg-background border border-border rounded-xl shadow-2xl p-5 w-80 space-y-3"
			onmousedown={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between">
				<h3 class="font-semibold text-sm">New Rate Season</h3>
				<button type="button" onclick={() => { dragPopover = null; }}
					class="text-muted-foreground hover:text-foreground text-lg leading-none px-1">✕</button>
			</div>
			{#if dragPopover.hint}
				<p class="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
					{dragPopover.hint}
				</p>
			{/if}

			<form method="POST" action="?/upsertSeason"
				use:enhance={() => {
					savingDrag = true;
					return async ({ update }) => { savingDrag = false; dragPopover = null; await update(); };
				}}
				class="space-y-3"
			>
				<input type="hidden" name="propertyId" value={propertyId} />
				<input type="hidden" name="sortOrder" value="0" />

				<div class="flex flex-col gap-1">
					<label for="dp-name" class="text-xs text-muted-foreground">Season name</label>
					<input id="dp-name" name="name" bind:value={dragPopover.name} required
						class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label for="dp-start" class="text-xs text-muted-foreground">Start</label>
						<input id="dp-start" name="startDate" type="date" bind:value={dragPopover.start} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
					<div class="flex flex-col gap-1">
						<label for="dp-end" class="text-xs text-muted-foreground">End</label>
						<input id="dp-end" name="endDate" type="date" bind:value={dragPopover.end} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div class="flex flex-col gap-1">
						<label for="dp-rate" class="text-xs text-muted-foreground">Base rate / night</label>
						<div class="flex items-center gap-1">
							<span class="text-xs text-muted-foreground">$</span>
							<input id="dp-rate" name="baseRateCents" type="number" min="0" step="1"
								bind:value={dragPopover.rate}
								placeholder="100"
								class="border-input bg-background rounded border px-2 py-1.5 text-sm font-mono w-full" />
						</div>
					</div>
					<div class="flex flex-col gap-1">
						<label for="dp-min" class="text-xs text-muted-foreground">Min nights</label>
						<input id="dp-min" name="minNights" type="number" min="1" max="14"
							bind:value={dragPopover.minNights}
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label class="text-xs text-muted-foreground">Colour</label>
					<div class="flex items-center gap-2 flex-wrap">
						<input type="color" name="colour" bind:value={dragPopover.colour}
							class="h-7 w-9 rounded border cursor-pointer shrink-0" />
						{#each PALETTE as c}
							<button type="button"
								onclick={() => { if (dragPopover) dragPopover.colour = c; }}
								class={['h-5 w-5 rounded border-2 transition-all shrink-0',
									dragPopover.colour === c ? 'border-foreground scale-110' : 'border-transparent hover:border-foreground/40'
								].join(' ')}
								style="background:{c}"
							></button>
						{/each}
					</div>
				</div>

				<div class="flex gap-2 pt-1">
					<button type="submit" disabled={savingDrag}
						class="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
						{savingDrag ? 'Saving…' : 'Create Season'}
					</button>
					<button type="button" onclick={() => { dragPopover = null; }}
						class="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<div class="flex min-h-screen items-start">

	<!-- ── Main calendar area ───────────────────────────────────────────────── -->
	<div class="flex-1 min-w-0 px-4 py-5">

		<!-- Toolbar -->
		<div class="no-print mb-4 flex flex-wrap items-center gap-3">
			<h1 class="text-lg font-bold">Rate Calendar</h1>

			<!-- Year nav -->
			<div class="flex items-center gap-0.5 rounded-lg border px-1">
				<a href={navUrl(year - 1)} class="px-2 py-1 text-sm hover:bg-muted rounded">‹</a>
				<span class="px-2 text-sm font-semibold">{year}</span>
				<a href={navUrl(year + 1)} class="px-2 py-1 text-sm hover:bg-muted rounded">›</a>
			</div>

			<!-- Property selector -->
			{#if data.propertiesList.length > 1}
				<select
					class="rounded border border-input bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
					onchange={(e) => goto(navUrl(year, (e.target as HTMLSelectElement).value))}>
					{#each data.propertiesList as prop}
						<option value={prop.id} selected={propertyId === prop.id}>{prop.name}</option>
					{/each}
				</select>
			{:else}
				<span class="text-xs font-semibold">{data.propertiesList[0]?.name ?? ''}</span>
			{/if}

			<!-- Copy from previous year -->
			<form method="POST" action="?/copyYear"
				use:enhance={() => {
					copyingYear = true;
					return async ({ update }) => { copyingYear = false; await update(); };
				}}
			>
				<input type="hidden" name="propertyId" value={propertyId} />
				<input type="hidden" name="fromYear" value={year - 1} />
				<input type="hidden" name="toYear" value={year} />
				<button type="submit" disabled={copyingYear}
					class="rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
					title="Copy all seasons from {year - 1} into {year}, shifting dates by one year">
					{copyingYear ? 'Copying…' : `Copy from ${year - 1}`}
				</button>
			</form>

			<!-- Clear current year -->
			<form method="POST" action="?/deleteYear"
				use:enhance={({ cancel }) => {
					if (!confirm(`Delete ALL ${year} seasons for this property? This cannot be undone.`)) {
						cancel();
						return;
					}
					deletingYear = true;
					return async ({ update }) => { deletingYear = false; selectedSeason = null; await update(); };
				}}
			>
				<input type="hidden" name="propertyId" value={propertyId} />
				<input type="hidden" name="year" value={year} />
				<button type="submit" disabled={deletingYear}
					class="rounded-md border border-destructive/40 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/5 disabled:opacity-50"
					title="Delete all {year} seasons for this property">
					{deletingYear ? 'Clearing…' : `Clear ${year}`}
				</button>
			</form>

			<!-- Room type rate toggles -->
			{#if roomTypes.length > 0}
				<div class="flex items-center gap-1.5 flex-wrap">
					<span class="text-xs text-muted-foreground">Show rates:</span>
					{#each roomTypes as rt}
						<button
							onclick={() => toggleRT(rt.id)}
							class={['rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
								rtVisible[rt.id] ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-foreground/40'
							].join(' ')}
						>{rt.category}: {rt.name}</button>
					{/each}
					{#if hasVisibleRTs}
						<button onclick={() => rtVisible = {}} class="text-xs text-muted-foreground hover:text-foreground">✕ Clear</button>
					{/if}
				</div>
			{/if}

			<!-- Label mode -->
			{#if hasVisibleRTs}
				<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium" title="Label format in cells">
					{#each [{ m: 'code', lbl: 'Code' }, { m: 'name', lbl: 'Name' }, { m: 'none', lbl: '$ only' }] as opt}
						<button
							onclick={() => setLabelMode(opt.m as 'code' | 'name' | 'none')}
							class={['px-2 py-1 border-r border-input last:border-0 transition-colors',
								labelMode === opt.m ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'
							].join(' ')}
						>{opt.lbl}</button>
					{/each}
				</div>
			{/if}

			<button
				onclick={() => window.print()}
				class="ml-auto rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
			>Print</button>

			<a href="/settings" class="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 no-print">
				Settings →
			</a>
		</div>

		<!-- Drag hint -->
		<p class="no-print mb-3 text-xs text-muted-foreground">
			<strong>Click</strong> a day to select a season · <strong>Drag</strong> across days to create a new season
		</p>

		<!-- Season legend -->
		{#if seasons.length > 0}
			<div class="no-print mb-4 flex flex-wrap gap-2">
				{#each seasons as s}
					<button
						onclick={() => { selectedSeason = s; panelMode = 'view'; dragPopover = null; }}
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

	<!-- Print-only header: property, year, rate legend ──────────────────────── -->
	<div class="hidden print:block mb-4">
		<div class="flex items-baseline justify-between border-b pb-1 mb-2">
			<div>
				<h1 class="text-base font-bold">{printProperty?.name ?? ''} — Rate Calendar {year}</h1>
				{#if hasVisibleRTs}
					<p class="text-[8pt] text-muted-foreground mt-0.5">
						Showing: {roomTypes.filter(rt => rtVisible[rt.id]).map(rt => rt.name).join(', ')}
					</p>
				{/if}
			</div>
			<span class="text-[8pt] text-muted-foreground">{new Date().toLocaleDateString()}</span>
		</div>
		<!-- Season legend with per-room-type rates -->
		{#if seasons.length > 0}
			{@const printRoomTypes = hasVisibleRTs ? roomTypes.filter(rt => rtVisible[rt.id]) : roomTypes}
			<div class="flex flex-wrap gap-x-4 gap-y-1">
				{#each [...seasons].sort((a,b) => a.sortOrder - b.sortOrder) as s}
					<div class="flex items-center gap-1.5 text-[7.5pt]">
						<span class="inline-block h-3 w-3 rounded-sm border border-black/10 shrink-0"
							style="background:{s.colour}"></span>
						<span class="font-semibold">{s.name}</span>
						{#if s.minNights > 1}<span class="text-[6.5pt] opacity-60">{s.minNights}n min</span>{/if}
						<span class="opacity-60 text-[6.5pt]">
							({#each printRoomTypes as rt, i}{#if i > 0} · {/if}{rt.category}: ${s.tiers.find(t => t.roomTypeId === rt.id) ? ((s.tiers.find(t => t.roomTypeId === rt.id)!.nightlyRate) / 100).toFixed(0) : '–'}{/each})
						</span>
					</div>
				{/each}
			</div>
			<!-- Room type key — bold active types, grey out inactive when filtered -->
			<div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[7pt]">
				{#each roomTypes as rt}
					{@const active = !hasVisibleRTs || rtVisible[rt.id]}
					<span class={active ? 'text-foreground' : 'opacity-30'}>
						<strong>{rt.category}</strong> = {rt.name}{#if hasVisibleRTs && rtVisible[rt.id]} ✓{/if}
					</span>
				{/each}
				<span class="text-muted-foreground ml-2">· <span class="inline-block border-b-4 border-b-black/50 px-1">__</span> = min night stay applies</span>
			</div>
		{/if}
	</div>

	<!-- 12-month grid -->
	<div class="grid grid-cols-3 gap-4 xl:grid-cols-4 print:grid-cols-4 print:gap-2"
			style={dragAnchor ? 'user-select:none' : ''}>
			{#each calMonths as month}
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
									<div class={hasVisibleRTs ? 'min-h-8 print:min-h-7' : 'h-6 print:h-5'}></div>
								{:else}
									{@const style = dayStyle(cell.iso)}
									{@const isToday = cell.iso === today}
									{@const hasSeason = dayMap.has(cell.iso)}
									{@const cellSeason = dayMap.get(cell.iso)}
									{@const inDrag = dragAnchor !== null && dragDates.has(cell.iso)}
								<!-- Screen version -->
								<button
									class={['no-print w-full rounded text-[10px] font-medium leading-none transition-all hover:brightness-90 active:scale-95 flex flex-col items-center justify-start pt-0.5 pb-0.5 cursor-pointer relative',
										hasVisibleRTs ? 'min-h-8' : 'h-6',
										isToday ? 'ring-2 ring-primary ring-offset-1' : '',
										!hasSeason ? 'text-foreground hover:bg-muted' : '',
										selectedSeason && dayMap.get(cell.iso)?.id === selectedSeason.id ? 'ring-1 ring-black/40' : '',
										inDrag && !hasSeason ? 'bg-primary/20 ring-1 ring-primary' : '',
										inDrag && hasSeason ? 'brightness-110 ring-1 ring-primary' : '',
										cellSeason?.minNights > 1 ? 'border-b-4 border-b-black/50' : ''
									].join(' ')}
										style={style || ''}
										onmousedown={(e) => { if (e.button === 0 && cell.iso) { e.preventDefault(); dragAnchor = cell.iso; dragTip = cell.iso; } }}
										onmouseover={() => { if (dragAnchor && cell.iso) dragTip = cell.iso; }}
									>
										<span class={hasVisibleRTs ? 'text-[9px] font-bold leading-none mb-0.5' : ''}>{cell.day}</span>
										{#if hasVisibleRTs}
											{#each roomTypes.filter(rt => rtVisible[rt.id]) as rt, ri}
												{@const tier = cellSeason?.tiers.find(t => t.roomTypeId === rt.id)}
												{#if tier}
													<span class={['flex flex-col items-center leading-none w-full', ri % 2 === 0 ? 'opacity-100' : 'opacity-70'].join(' ')}>
														{#if labelMode !== 'none'}<span class="text-[7px] font-medium leading-tight truncate max-w-full">{rtLabel(rt)}</span>{/if}
														<span class="text-[8px] font-bold leading-tight">{fmt(tier.nightlyRate)}</span>
													</span>
												{/if}
											{/each}
										{/if}
										{#if cellSeason?.minNights > 1}
											<span class="absolute bottom-0.5 right-0.5 text-[6px] font-bold leading-none opacity-70">{cellSeason.minNights}n</span>
										{/if}
									</button>
								<!-- Print version -->
								<div
									class={['hidden print:flex flex-col items-center justify-start pt-0.5 w-full rounded font-medium leading-none relative',
										hasVisibleRTs ? 'min-h-7 pb-0.5' : 'h-5 justify-center',
										isToday ? 'ring-1 ring-black' : '',
										cellSeason?.minNights > 1 ? 'border-b-4 border-b-black/60' : ''
									].join(' ')}
										style={style || ''}
									>
										<span class={hasVisibleRTs ? 'text-[7pt] font-bold leading-none mb-px' : 'text-[7pt]'}>{cell.day}</span>
										{#if hasVisibleRTs}
											{#each roomTypes.filter(rt => rtVisible[rt.id]) as rt, ri}
												{@const tier = cellSeason?.tiers.find(t => t.roomTypeId === rt.id)}
												{#if tier}
													<span class={['flex flex-col items-center leading-none w-full', ri % 2 === 0 ? 'opacity-100' : 'opacity-70'].join(' ')}>
														{#if labelMode !== 'none'}<span class="text-[5pt] font-medium leading-tight">{rtLabel(rt)}</span>{/if}
														<span class="text-[6pt] font-bold leading-tight">{fmt(tier.nightlyRate)}</span>
													</span>
												{/if}
											{/each}
										{/if}
										{#if cellSeason?.minNights > 1}
											<span class="absolute bottom-0.5 right-0.5 text-[5pt] font-bold leading-none opacity-70">{cellSeason.minNights}n</span>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					{/each}

					<!-- Season colour bar under each month -->
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
	<div class="no-print sticky top-14 h-[calc(100vh-3.5rem)] w-80 shrink-0 overflow-y-auto border-l bg-background p-4">

		{#if selectedSeason}
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
							selectedSeason = data.seasonsList.find(x => x.id === s.id) ?? null;
						};
					}}
					class="space-y-3 mb-4"
				>
					<input type="hidden" name="id" value={s.id} />
					<input type="hidden" name="propertyId" value={s.propertyId} />
					<input type="hidden" name="sortOrder" value={s.sortOrder} />

					<div class="flex flex-col gap-1">
						<label for="edit-name" class="text-xs text-muted-foreground">Name</label>
						<input id="edit-name" name="name" value={s.name} required
							class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="flex flex-col gap-1">
							<label for="edit-start" class="text-xs text-muted-foreground">Start</label>
							<input id="edit-start" name="startDate" type="date" value={s.startDate}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
						<div class="flex flex-col gap-1">
							<label for="edit-end" class="text-xs text-muted-foreground">End</label>
							<input id="edit-end" name="endDate" type="date" value={s.endDate}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div class="flex flex-col gap-1">
							<label for="edit-colour" class="text-xs text-muted-foreground">Colour</label>
							<input id="edit-colour" type="color" name="colour" value={s.colour}
								class="h-8 w-full rounded border cursor-pointer" />
						</div>
						<div class="flex flex-col gap-1">
							<label for="edit-min" class="text-xs text-muted-foreground">Min nights</label>
							<input id="edit-min" name="minNights" type="number" min="1" max="14" value={s.minNights}
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
					</div>
					<div class="flex flex-col gap-1">
						<label for="edit-base" class="text-xs text-muted-foreground">Base rate (optional)</label>
						<div class="flex items-center gap-1">
							<span class="text-xs text-muted-foreground">$</span>
							<input id="edit-base" name="baseRateCents" type="number" min="0" step="1"
								value={s.baseRateCents ? (s.baseRateCents / 100).toFixed(0) : ''}
								placeholder="e.g. 100"
								class="border-input bg-background w-24 rounded border px-2 py-1.5 text-sm font-mono" />
							<span class="text-xs text-muted-foreground">/night</span>
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
				<div class="mb-2 flex flex-wrap gap-1 text-xs">
					{#if s.minNights > 1}
						<span class="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 font-medium">{s.minNights}-night minimum</span>
					{/if}
					{#if s.baseRateCents}
						<span class="rounded bg-primary/10 text-primary px-1.5 py-0.5 font-medium font-mono">
							Base ${(s.baseRateCents / 100).toFixed(0)}/night
						</span>
					{/if}
				</div>

				{#if s.baseRateCents}
					<!-- Upcharge mode -->
					<form method="POST" action="?/upsertAllTiersAtBase"
						use:enhance={() => {
							saving = true;
							return async ({ update }) => { saving = false; await update({ reset: false }); };
						}}
						class="mb-3"
					>
						<input type="hidden" name="seasonId" value={s.id} />
						<input type="hidden" name="propertyId" value={s.propertyId} />
						<button type="submit" disabled={saving}
							class="w-full rounded border px-2 py-1 text-xs hover:bg-muted">
							{saving ? 'Saving…' : `Reset all to $${(s.baseRateCents / 100).toFixed(0)}`}
						</button>
					</form>
					<div class="space-y-2">
						{#each roomTypes as rt}
							{@const tier = s.tiers.find(t => t.roomTypeId === rt.id)}
							{@const upcharge = tier ? tier.nightlyRate - s.baseRateCents : 0}
							<form method="POST" action="?/upsertRateTier"
								use:enhance={() => {
									saving = true;
									return async ({ update }) => { saving = false; await update({ reset: false }); };
								}}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="seasonId" value={s.id} />
								<input type="hidden" name="roomTypeId" value={rt.id} />
								<input type="hidden" name="baseRateCents" value={s.baseRateCents} />
								<div class="flex-1 min-w-0">
									<span class="text-xs font-medium">{rt.category}: {rt.name}</span>
									{#if tier}
										<span class="text-[10px] text-muted-foreground ml-1">= ${(tier.nightlyRate / 100).toFixed(0)}/night</span>
									{/if}
								</div>
								<div class="flex items-center gap-1">
									<span class="text-xs text-muted-foreground">+$</span>
									<input
										name="upcharge"
										type="number"
										step="1"
										value={(upcharge / 100).toFixed(0)}
										placeholder="0"
										class="border-input bg-background w-16 rounded border px-2 py-1 text-sm font-mono text-right"
									/>
									<button type="submit" class="rounded border px-2 py-1 text-xs hover:bg-muted" disabled={saving}>✓</button>
								</div>
							</form>
						{/each}
						{#if roomTypes.length === 0}
							<p class="text-xs text-muted-foreground">No room types configured for this property.</p>
						{/if}
					</div>
				{:else}
					<!-- Direct rate mode -->
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
			{/if}

		{:else}
			<!-- Empty state -->
			<div class="py-8 text-center space-y-2">
				<p class="text-muted-foreground text-sm font-medium">No season selected</p>
				<p class="text-muted-foreground text-xs">
					Drag across days on the calendar to create a season, or click an existing coloured day to edit it.
				</p>
				{#if seasons.length === 0}
					<p class="text-xs text-primary mt-3">
						Tip: use <strong>Copy from {year - 1}</strong> in the toolbar if you already have {year - 1} seasons set up.
					</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
