<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
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
	function rtLabel(rt: { category: string; name: string }): string {
		if (labelMode === 'name') return rt.name.slice(0, 14);
		return rt.category; // short code, already compact
	}

	// ─── Cell size mode ───────────────────────────────────────────────────────
	const SIZE_MODE_KEY = 'rate-cal-size-mode';
	function loadSizeMode(): 's' | 'm' | 'l' | 'xl' {
		if (typeof localStorage === 'undefined') return 'm';
		return (localStorage.getItem(SIZE_MODE_KEY) as 's' | 'm' | 'l' | 'xl') || 'm';
	}
	let sizeMode = $state<'s' | 'm' | 'l' | 'xl'>(loadSizeMode());
	function setSizeMode(s: 's' | 'm' | 'l' | 'xl') {
		sizeMode = s;
		if (typeof localStorage !== 'undefined') localStorage.setItem(SIZE_MODE_KEY, s);
	}

	// ─── DOW rates panel state ────────────────────────────────────────────────
	let dowOpen  = $state<Record<string, boolean>>({});
	let dowEdits = $state<Record<string, (number|null)[]>>({});

	// ─── Year action dialogs ───────────────────────────────────────────────────
	let copyDialogOpen   = $state(false);
	let clearDialogOpen  = $state(false);
	let displayPopoverOpen = $state(false);
	let clearConfirmText = $state('');

	async function submitCopyYear() {
		copyingYear = true;
		try {
			const fd = new FormData();
			fd.append('propertyId', propertyId);
			fd.append('fromYear', String(year - 1));
			fd.append('toYear', String(year));
			const r = await fetch('?/copyYear', { method: 'POST', body: fd });
			if (r.ok) { copyDialogOpen = false; await invalidateAll(); }
			else toast.error('Copy failed');
		} catch { toast.error('Copy failed'); }
		finally { copyingYear = false; }
	}

	async function submitDeleteYear() {
		if (clearConfirmText !== String(year)) return;
		deletingYear = true;
		try {
			const fd = new FormData();
			fd.append('propertyId', propertyId);
			fd.append('year', String(year));
			const r = await fetch('?/deleteYear', { method: 'POST', body: fd });
			if (r.ok) { clearDialogOpen = false; clearConfirmText = ''; selectedSeason = null; await invalidateAll(); }
			else toast.error('Delete failed');
		} catch { toast.error('Delete failed'); }
		finally { deletingYear = false; }
	}

	function setLabelMode(m: 'code' | 'name' | 'none') {
		labelMode = m;
		if (typeof localStorage !== 'undefined') localStorage.setItem(LABEL_MODE_KEY, m);
	}
	const sz = $derived.by(() => {
		const s = sizeMode;
		return {
			// months-per-row (screen + print driven by same choice)
			grid:          s === 's' ? 'grid-cols-4' : s === 'l' ? 'grid-cols-2' : s === 'xl' ? 'grid-cols-1' : 'grid-cols-3',
			printGrid:     s === 's' ? 'print:grid-cols-4' : s === 'l' ? 'print:grid-cols-2' : s === 'xl' ? 'print:grid-cols-1' : 'print:grid-cols-3',
			gap:           s === 's' ? 'gap-3' : s === 'l' ? 'gap-6' : s === 'xl' ? 'gap-8' : 'gap-4',
			printGap:      s === 's' ? 'print:gap-1' : s === 'l' ? 'print:gap-3' : s === 'xl' ? 'print:gap-4' : 'print:gap-2',
			// cell minimum height when rates are visible
			cellH:         s === 's' ? 'min-h-6' : s === 'l' ? 'min-h-12' : s === 'xl' ? 'min-h-20' : 'min-h-9',
			// print cell height (no "print:" prefix — used inside the hidden print:flex div)
			printCellH:    s === 's' ? 'min-h-5' : s === 'l' ? 'min-h-10' : s === 'xl' ? 'min-h-16' : 'min-h-7',
			// font sizes — screen
			dayNum:        s === 's' ? 'text-[9px]' : s === 'l' ? 'text-[11px]' : s === 'xl' ? 'text-[14px]' : 'text-[10px]',
			label:         s === 's' ? 'text-[7px]' : s === 'l' ? 'text-[9px]' : s === 'xl' ? 'text-[11px]' : 'text-[8px]',
			rate:          s === 's' ? 'text-[8px]' : s === 'l' ? 'text-[11px]' : s === 'xl' ? 'text-[14px]' : 'text-[9px]',
			minBadge:      s === 'xl' ? 'text-[10px]' : s === 'l' ? 'text-[8px]' : 'text-[6px]',
			// font sizes — print
			printDayNum:   s === 's' ? 'text-[7pt]' : s === 'l' ? 'text-[9pt]' : s === 'xl' ? 'text-[12pt]' : 'text-[8pt]',
			printLabel:    s === 's' ? 'text-[5pt]' : s === 'l' ? 'text-[7pt]' : s === 'xl' ? 'text-[9pt]' : 'text-[6pt]',
			printRate:     s === 's' ? 'text-[6pt]' : s === 'l' ? 'text-[8pt]' : s === 'xl' ? 'text-[11pt]' : 'text-[7pt]',
			printMinBadge: s === 'xl' ? 'text-[8pt]' : s === 'l' ? 'text-[6pt]' : 'text-[5pt]',
		};
	});

	// ─── Derived: seasons + room types for current property ───────────────────
	const seasons      = $derived(data.seasonsList.filter((s) =>
		s.propertyId === propertyId &&
		s.startDate  <= `${year}-12-31` &&
		s.endDate    >= `${year}-01-01`
	));
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
		isManualOnly: boolean;
		hint: string | null;
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
			isManualOnly: false,
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

			<label class="flex items-center gap-2 text-sm cursor-pointer mt-1">
				<input type="checkbox" name="isManualOnly" value="1"
					checked={dragPopover.isManualOnly ?? false}
					onchange={(e) => { if (dragPopover) dragPopover.isManualOnly = (e.currentTarget as HTMLInputElement).checked; }}
					class="rounded" />
				<span class="text-sm">Staff only <span class="text-xs text-muted-foreground">(not shown on public booking page)</span></span>
			</label>

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

<!-- ── Copy year AlertDialog ─────────────────────────────────────────────── -->
<AlertDialog.Root bind:open={copyDialogOpen}>
	<AlertDialog.Content class="max-w-sm">
		<AlertDialog.Header>
			<AlertDialog.Title>Copy {year - 1} seasons into {year}?</AlertDialog.Title>
			<AlertDialog.Description>
				All seasons from <strong>{year - 1}</strong> will be duplicated into <strong>{year}</strong> with dates shifted by one year. Existing {year} seasons are kept — duplicates won't be created if the dates already exist.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={submitCopyYear}
				disabled={copyingYear}
				class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
			>{copyingYear ? 'Copying…' : `Copy from ${year - 1}`}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- ── Clear year AlertDialog (type-to-confirm) ──────────────────────────── -->
<AlertDialog.Root bind:open={clearDialogOpen}>
	<AlertDialog.Content class="max-w-sm">
		<AlertDialog.Header>
			<AlertDialog.Title>Clear {year} seasons?</AlertDialog.Title>
			<AlertDialog.Description>
				This will permanently delete <strong>all rate seasons for {year}</strong>. Room type rates will fall back to defaults. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="px-6 pb-2 space-y-2">
			<label class="text-sm text-muted-foreground">
				Type <strong class="text-foreground font-mono">{year}</strong> to confirm
			</label>
			<input
				type="text"
				bind:value={clearConfirmText}
				placeholder="Enter year"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive/50"
			/>
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => clearConfirmText = ''}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={submitDeleteYear}
				disabled={clearConfirmText !== String(year) || deletingYear}
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
			>{deletingYear ? 'Clearing…' : `Delete all ${year} seasons`}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<div class="flex min-h-screen items-start">
	<!-- ── Main calendar area ───────────────────────────────────────────────── -->
	<div class="flex-1 min-w-0 px-4 py-5">

		<!-- Toolbar -->
		<div class="no-print mb-4 space-y-2">

			<!-- Row 1: navigation + ⚙ Display popover -->
			<div class="flex flex-wrap items-center gap-2">
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

				<!-- Display popover (right-aligned) -->
				<div class="ml-auto">
					<Popover.Root bind:open={displayPopoverOpen}>
						<Popover.Trigger
							class="flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
						>⚙ Display</Popover.Trigger>

						<Popover.Content align="end" class="w-60 p-0 gap-0 print:hidden">
							<div class="p-4 space-y-4">

								<!-- Label format (only when rates visible) -->
								{#if hasVisibleRTs}
									<div>
										<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Label format</p>
										<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium">
											{#each [{ m: 'code', lbl: 'Code' }, { m: 'name', lbl: 'Name' }, { m: 'none', lbl: '$ only' }] as opt}
												<button
													onclick={() => setLabelMode(opt.m as 'code' | 'name' | 'none')}
													class={['flex-1 px-2 py-1.5 border-r border-input last:border-0 transition-colors',
														labelMode === opt.m ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'
													].join(' ')}
												>{opt.lbl}</button>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Cell size -->
								<div>
									<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cell size · print size</p>
									<div class="flex rounded-md border border-input overflow-hidden text-xs font-medium">
										{#each [{ s: 's', lbl: 'S', title: '4/row' }, { s: 'm', lbl: 'M', title: '3/row' }, { s: 'l', lbl: 'L', title: '2/row' }, { s: 'xl', lbl: 'XL', title: '1/row' }] as opt}
											<button
												onclick={() => setSizeMode(opt.s as 's' | 'm' | 'l' | 'xl')}
												title={opt.title}
												class={['flex-1 px-2 py-1.5 border-r border-input last:border-0 transition-colors',
													sizeMode === opt.s ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'
												].join(' ')}
											>{opt.lbl}</button>
										{/each}
									</div>
									<p class="text-[9px] text-muted-foreground mt-1">
										{sizeMode === 's' ? '4 months/row — compact overview' :
										 sizeMode === 'm' ? '3 months/row — balanced' :
										 sizeMode === 'l' ? '2 months/row — easy to read' :
										 '1 month/row — full page per month'}
									</p>
								</div>

								<!-- Print -->
								<button onclick={() => { displayPopoverOpen = false; window.print(); }}
									class="w-full rounded-md border px-3 py-1.5 text-sm hover:bg-muted text-left font-medium">
									🖨 Print calendar
								</button>
							</div>

							<!-- Divider + year actions -->
							<div class="border-t border-border px-4 py-3 space-y-1">
								<p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Year actions</p>

								<button
									onclick={() => copyDialogOpen = true}
									class="w-full rounded-md px-2.5 py-1.5 text-sm text-left hover:bg-muted transition-colors flex items-center gap-2"
								>📋 Copy from {year - 1}</button>

								<button
									onclick={() => { clearConfirmText = ''; clearDialogOpen = true; }}
									class="w-full rounded-md px-2.5 py-1.5 text-sm text-left hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
								>🗑 Clear {year} seasons</button>
							</div>
						</Popover.Content>
					</Popover.Root>
				</div>
			</div>

			<!-- Row 2: room-type toggles -->
			{#if roomTypes.length > 0}
				<div class="flex flex-wrap items-center gap-2">
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
	<div class="grid {sz.grid} {sz.gap} {sz.printGrid} {sz.printGap}"
			style={dragAnchor ? 'user-select:none' : ''}>

		<!-- Print-only repeat key — appears on the calendar page if it breaks from the cover header -->
		<div class="hidden print:block col-span-full border-b border-black/20 pb-1 mb-1">
			<div class="flex items-baseline justify-between">
				<span class="text-[7pt] font-bold">{printProperty?.name ?? ''} — Rate Calendar {year}</span>
				{#if hasVisibleRTs}
					<span class="text-[6pt] text-muted-foreground">
						{roomTypes.filter(rt => rtVisible[rt.id]).map(rt => rt.category).join(' · ')}
					</span>
				{/if}
			</div>
		</div>

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
								<div class={hasVisibleRTs ? `${sz.cellH} ${sz.printCellH}` : 'h-6 print:h-5'}></div>
								{:else}
									{@const style = dayStyle(cell.iso)}
									{@const isToday = cell.iso === today}
									{@const hasSeason = dayMap.has(cell.iso)}
									{@const cellSeason = dayMap.get(cell.iso)}
									{@const inDrag = dragAnchor !== null && dragDates.has(cell.iso)}
							<!-- Screen version -->
							<button
								class={['no-print w-full rounded text-[10px] font-medium leading-none transition-all hover:brightness-90 active:scale-95 flex flex-col items-center justify-start pt-0.5 pb-0.5 cursor-pointer relative',
									hasVisibleRTs ? sz.cellH : 'h-6',
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
									<span class={hasVisibleRTs ? `${sz.dayNum} font-bold leading-none mb-0.5` : ''}>{cell.day}</span>
									{#if hasVisibleRTs}
										{#each roomTypes.filter(rt => rtVisible[rt.id]) as rt, ri}
											{@const tier = cellSeason?.tiers.find(t => t.roomTypeId === rt.id)}
											{#if tier}
												<span class={['flex flex-col items-center leading-none w-full', ri % 2 === 0 ? 'opacity-100' : 'opacity-80'].join(' ')}>
													{#if labelMode !== 'none'}<span class="{sz.label} font-medium leading-tight truncate max-w-full">{rtLabel(rt)}</span>{/if}
													<span class="{sz.rate} font-bold leading-tight">{fmt(tier.nightlyRate)}</span>
												</span>
											{/if}
										{/each}
									{/if}
									{#if cellSeason?.minNights > 1}
										<span class="absolute bottom-0.5 right-0.5 {sz.minBadge} font-bold leading-none opacity-70">{cellSeason.minNights}n</span>
									{/if}
								</button>
							<!-- Print version -->
							<div
								class={['hidden print:flex flex-col items-center justify-start pt-0.5 w-full rounded font-medium leading-none relative',
									hasVisibleRTs ? `${sz.printCellH} pb-0.5` : 'h-5 justify-center',
									isToday ? 'ring-1 ring-black' : '',
									cellSeason?.minNights > 1 ? 'border-b-4 border-b-black/60' : ''
								].join(' ')}
									style={style || ''}
								>
									<span class={hasVisibleRTs ? `${sz.printDayNum} font-bold leading-none mb-px` : sz.printDayNum}>{cell.day}</span>
									{#if hasVisibleRTs}
										{#each roomTypes.filter(rt => rtVisible[rt.id]) as rt, ri}
											{@const tier = cellSeason?.tiers.find(t => t.roomTypeId === rt.id)}
											{#if tier}
												<span class={['flex flex-col items-center leading-none w-full', ri % 2 === 0 ? 'opacity-100' : 'opacity-80'].join(' ')}>
													{#if labelMode !== 'none'}<span class="{sz.printLabel} font-medium leading-tight">{rtLabel(rt)}</span>{/if}
													<span class="{sz.printRate} font-bold leading-tight">{fmt(tier.nightlyRate)}</span>
												</span>
											{/if}
										{/each}
									{/if}
									{#if cellSeason?.minNights > 1}
										<span class="absolute bottom-0.5 right-0.5 {sz.printMinBadge} font-bold leading-none opacity-70">{cellSeason.minNights}n</span>
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
				<label class="flex items-center gap-2 text-sm cursor-pointer">
					<input type="checkbox" name="isManualOnly" value="1"
						checked={s.isManualOnly}
						class="rounded" />
					<span>Staff only <span class="text-xs text-muted-foreground">(not shown on public booking page)</span></span>
				</label>
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
						{@const dowParsed = tier?.dowRates ? (() => { try { return JSON.parse(tier.dowRates); } catch { return null; } })() : null}
						{@const dowState = dowEdits[s.id + ':' + rt.id] ?? dowParsed ?? [null,null,null,null,null,null,null]}
						<form method="POST" action="?/upsertRateTier"
							use:enhance={() => {
								saving = true;
								return async ({ update }) => { saving = false; await update({ reset: false }); };
							}}
							class="border rounded-md p-2 space-y-1.5"
						>
							<input type="hidden" name="seasonId" value={s.id} />
							<input type="hidden" name="roomTypeId" value={rt.id} />
							<!-- DOW hidden inputs — always submitted -->
							{#each [0,1,2,3,4,5,6] as d}
								<input type="hidden" name={`dowRate${d}`} value={dowState[d] != null ? (dowState[d] / 100).toFixed(0) : ''} />
							{/each}
							<div class="flex items-center gap-2 flex-wrap">
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
								</div>
								<div class="flex items-center gap-1" title="Base occupancy (guests included in rate)">
									<span class="text-xs text-muted-foreground">Occ</span>
									<input name="baseOccupancy" type="number" min="1" max="10"
										value={tier?.baseOccupancy ?? 2}
										class="border-input bg-background w-12 rounded border px-1 py-1 text-xs font-mono text-right" />
								</div>
								<div class="flex items-center gap-1" title="Extra guest fee per night above base occupancy">
									<span class="text-xs text-muted-foreground">+$/extra</span>
									<input name="extraGuestFeeCents" type="number" min="0" step="0.01"
										value={tier?.extraGuestFeeCents ? (tier.extraGuestFeeCents / 100).toFixed(0) : ''}
										placeholder="0"
										class="border-input bg-background w-16 rounded border px-1 py-1 text-xs font-mono text-right" />
								</div>
								<button type="submit" class="rounded border px-2 py-1 text-xs hover:bg-muted" disabled={saving}>✓</button>
							</div>
							<!-- DOW rate editor (toggle) -->
							<div>
								<button type="button"
									onclick={() => { dowOpen = { ...dowOpen, [s.id+':'+rt.id]: !dowOpen[s.id+':'+rt.id] }; }}
									class="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
									{dowOpen[s.id+':'+rt.id] ? '▲' : '▼'}
									{#if dowParsed?.some((v: number|null) => v != null)}
										<span class="text-amber-600 font-medium">Weekday rates set</span>
									{:else}
										Weekday rates
									{/if}
								</button>
								{#if dowOpen[s.id+':'+rt.id]}
									<div class="mt-1.5 grid grid-cols-7 gap-1">
										{#each ['Su','Mo','Tu','We','Th','Fr','Sa'] as label, d}
											<div class="flex flex-col items-center gap-0.5">
												<span class="text-[9px] text-muted-foreground font-medium">{label}</span>
												<input
													type="number" min="0" step="1" placeholder="—"
													value={dowState[d] != null ? (dowState[d] / 100).toFixed(0) : ''}
													oninput={(e) => {
														const v = (e.target as HTMLInputElement).value;
														const cents = v ? Math.round(parseFloat(v) * 100) : null;
														const next = [...(dowEdits[s.id+':'+rt.id] ?? dowParsed ?? [null,null,null,null,null,null,null])];
														next[d] = cents && cents > 0 ? cents : null;
														dowEdits = { ...dowEdits, [s.id+':'+rt.id]: next };
													}}
													class="border-input bg-background w-full rounded border px-1 py-0.5 text-[10px] font-mono text-right"
												/>
											</div>
										{/each}
									</div>
									<p class="text-[9px] text-muted-foreground mt-1">Empty = use base rate. Fri/Sat overrides are common for weekend pricing.</p>
								{/if}
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
