<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import type { ARICell } from './+page.server';

	let { data }: { data: PageData } = $props();

	// ─── Navigation ────────────────────────────────────────────────────────────
	const today = $derived(data.today);
	let activeProp = $state(data.activePropId);

	function navUrl(fromDate: string, prop?: string) {
		const p = prop ?? activeProp;
		return `/availability?from=${fromDate}&prop=${p}`;
	}

	function prevWindow() {
		const d = new Date(data.from + 'T12:00:00');
		d.setDate(d.getDate() - data.window);
		const f = d.toISOString().slice(0, 10);
		window.location.href = navUrl(f < today ? today : f);
	}

	function nextWindow() {
		const d = new Date(data.from + 'T12:00:00');
		d.setDate(d.getDate() + data.window);
		window.location.href = navUrl(d.toISOString().slice(0, 10));
	}

	// ─── Popover state ─────────────────────────────────────────────────────────
	type CellKey = { roomTypeId: string; date: string };
	let popoverCell = $state<CellKey | null>(null);
	let editRate = $state('');
	let editMin = $state('');
	let editStopSell = $state(false);
	let editCTA = $state(false);
	let editCTD = $state(false);
	let savingCell = $state(false);

	function openPopover(roomTypeId: string, date: string) {
		const cell = data.ariData[roomTypeId]?.[date];
		popoverCell = { roomTypeId, date };
		editRate = cell?.overrideRateCents != null ? String(cell.overrideRateCents / 100) : '';
		editMin = cell?.minNights != null && cell.minNights !== cell.baseMinNights
			? String(cell.minNights) : '';
		editStopSell = cell?.stopSell ?? false;
		editCTA = cell?.closedToArrival ?? false;
		editCTD = cell?.closedToDeparture ?? false;
	}

	function closePopover() { popoverCell = null; }

	async function saveOverride() {
		if (!popoverCell) return;
		savingCell = true;
		try {
			const body = {
				roomTypeId: popoverCell.roomTypeId,
				date: popoverCell.date,
				rateCents: editRate ? Math.round(parseFloat(editRate) * 100) : null,
				minNights: editMin ? parseInt(editMin) : null,
				stopSell: editStopSell,
				closedToArrival: editCTA,
				closedToDeparture: editCTD
			};
			const res = await fetch('/api/ari/override', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (res.ok) {
				toast.success('Override saved');
				closePopover();
				await invalidateAll();
			} else {
				toast.error('Save failed');
			}
		} finally {
			savingCell = false;
		}
	}

	async function clearOverride() {
		if (!popoverCell) return;
		savingCell = true;
		try {
			const res = await fetch('/api/ari/override', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ roomTypeId: popoverCell.roomTypeId, date: popoverCell.date })
			});
			if (res.ok) {
				toast.success('Override cleared');
				closePopover();
				await invalidateAll();
			} else {
				toast.error('Clear failed');
			}
		} finally {
			savingCell = false;
		}
	}

	// ─── Sync Channex ──────────────────────────────────────────────────────────
	let syncing = $state(false);
	let syncResult = $state('');

	// ─── Helpers ───────────────────────────────────────────────────────────────
	function fmt(cents: number | null): string {
		if (cents == null) return '—';
		return '$' + (cents / 100).toFixed(0);
	}

	function fmtDate(iso: string): { dow: string; day: string; month: string } {
		const d = new Date(iso + 'T12:00:00');
		const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
		return { dow, day: String(d.getDate()), month: d.toLocaleString('en-CA', { month: 'short' }) };
	}

	function isWeekend(iso: string): boolean {
		const dow = new Date(iso + 'T12:00:00').getDay();
		return dow === 0 || dow === 6;
	}

	function availClass(cell: ARICell): string {
		if (cell.stopSell) return 'text-red-700 font-bold';
		if (cell.available === 0) return 'text-red-500 font-semibold';
		if (cell.available === 1) return 'text-amber-600 font-semibold';
		return 'text-emerald-700 font-semibold';
	}

	function cellBg(iso: string, cell: ARICell): string {
		if (cell.stopSell) return 'bg-red-50';
		if (iso === today) return 'bg-amber-50/60';
		if (cell.hasOverride) return 'bg-blue-50/40';
		if (cell.seasonColour) return '';
		return '';
	}

	// Group dates by month for header
	const monthGroups = $derived.by(() => {
		const groups: { label: string; count: number }[] = [];
		let last = '';
		for (const d of data.dates) {
			const m = d.slice(0, 7);
			if (m !== last) { groups.push({ label: new Date(d + 'T12:00:00').toLocaleString('en-CA', { month: 'long', year: 'numeric' }), count: 1 }); last = m; }
			else groups[groups.length - 1].count++;
		}
		return groups;
	});

	const COL_W = 46; // px per date column
</script>

<svelte:head>
	<title>Availability Calendar</title>
</svelte:head>

<!-- Click-away to close popover -->
{#if popoverCell}
	<div class="fixed inset-0 z-20" role="presentation" onclick={closePopover}></div>
{/if}

<div class="flex min-h-screen flex-col">

	<!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
	<div class="sticky top-14 z-10 border-b bg-background/95 backdrop-blur">
		<div class="flex flex-wrap items-center gap-3 px-4 py-2">

			<h1 class="text-sm font-bold">Availability & Rates</h1>

			<!-- Property selector -->
			<div class="flex gap-1">
				{#each data.propertiesList as prop}
					<a href={navUrl(data.from, prop.id)}
						class={[
							'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
							activeProp === prop.id
								? 'bg-foreground text-background border-foreground'
								: 'border-border text-muted-foreground hover:border-foreground/40'
						].join(' ')}
					>{prop.name}</a>
				{/each}
			</div>

			<!-- Date navigation -->
			<div class="flex items-center gap-1 rounded-lg border px-1 text-xs">
				<button onclick={prevWindow} class="px-2 py-1 hover:bg-muted rounded disabled:opacity-40"
					disabled={data.from <= today}>← {data.window}d</button>
				<span class="px-2 text-muted-foreground font-mono">
					{new Date(data.from + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
					–
					{new Date(data.to + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
				</span>
				<button onclick={nextWindow} class="px-2 py-1 hover:bg-muted rounded">{data.window}d →</button>
			</div>

			<!-- Sync to Channex -->
			<form method="POST" action="?/syncChannex&prop={activeProp}"
				use:enhance={() => {
					syncing = true; syncResult = '';
					return async ({ result, update }) => {
						syncing = false;
						if (result.type === 'success') {
							const d = result.data as { synced: boolean; message: string };
							syncResult = d.message;
							if (d.synced) toast.success(d.message);
							else toast.error(d.message);
						} else if (result.type === 'failure') {
							const d = result.data as { error: string };
							toast.error(d.error ?? 'Sync failed');
						}
						await update();
					};
				}}
			>
				<button type="submit" disabled={syncing}
					class="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors">
					<span class="text-base leading-none">⇅</span>
					{syncing ? 'Syncing…' : 'Sync Channex'}
				</button>
			</form>

			<!-- Legend -->
			<div class="flex items-center gap-3 text-xs text-muted-foreground ml-auto">
				<span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300"></span> Override</span>
				<span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-300"></span> Today</span>
				<span class="flex items-center gap-1"><span class="text-red-600 font-bold text-xs">STOP</span> Stop sell</span>
			</div>
		</div>
	</div>

	<!-- ── Grid ─────────────────────────────────────────────────────────────── -->
	<div class="flex-1 overflow-auto">
		<table class="border-collapse text-xs" style="min-width: {150 + data.dates.length * COL_W}px">

			<!-- Month header row -->
			<thead>
				<tr class="bg-background sticky top-0 z-10 border-b border-border shadow-sm">
					<th class="sticky left-0 z-20 bg-background w-36 min-w-36 border-r border-border px-3 py-2 text-left font-semibold text-muted-foreground text-[10px] uppercase tracking-wide">
						Room Type
					</th>
					{#each monthGroups as mg}
						<th colspan={mg.count} class="border-r border-border/40 px-2 py-1.5 text-center font-semibold text-muted-foreground whitespace-nowrap">
							{mg.label}
						</th>
					{/each}
				</tr>

				<!-- Date row -->
				<tr class="bg-muted/30 sticky top-[33px] z-10 border-b border-border">
					<th class="sticky left-0 z-20 bg-muted/30 w-36 min-w-36 border-r border-border px-3 py-1 text-left"></th>
					{#each data.dates as iso}
						{@const fd = fmtDate(iso)}
						<th style="width:{COL_W}px; min-width:{COL_W}px"
							class={[
								'border-r border-border/30 px-0.5 py-1 text-center font-medium',
								iso === today ? 'bg-amber-100 text-amber-800' : isWeekend(iso) ? 'text-rose-600' : 'text-foreground'
							].join(' ')}
						>
							<div class="text-[9px] text-muted-foreground leading-none">{fd.dow}</div>
							<div class="text-[11px] font-bold leading-tight">{fd.day}</div>
						</th>
					{/each}
				</tr>
			</thead>

			<tbody>
				{#each data.roomTypesList as rt}
					<!-- Room type label row -->
					<tr class="bg-muted/20 border-t-2 border-border">
						<td class="sticky left-0 z-10 bg-muted/20 border-r border-border px-3 py-2 font-semibold" colspan={1 + data.dates.length}>
							<div class="flex items-center gap-2">
								<span class="font-mono text-[10px] bg-foreground/10 rounded px-1.5 py-0.5">{rt.category}</span>
								<span>{rt.name}</span>
								{#if rt.channexRoomTypeId}
									<span class="text-[9px] text-emerald-600 font-medium ml-1" title="Connected to Channex">⇅ Channex</span>
								{:else}
									<span class="text-[9px] text-muted-foreground ml-1" title="Not yet connected to Channex">No Channex ID</span>
								{/if}
							</div>
						</td>
					</tr>

					<!-- Available row -->
					<tr class="border-b border-border/20 hover:bg-muted/5">
						<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
							Available
						</td>
						{#each data.dates as iso}
							{@const cell = data.ariData[rt.id]?.[iso]}
							<td style="width:{COL_W}px"
								class={['border-r border-border/20 px-0.5 py-1.5 text-center cursor-pointer transition-colors hover:bg-muted/40', cellBg(iso, cell ?? { stopSell: false, available: 0, totalRooms: 0, hasOverride: false, seasonColour: null } as ARICell)].join(' ')}
								onclick={() => openPopover(rt.id, iso)}
								title="Click to edit {iso}"
							>
								{#if cell}
									<span class={availClass(cell)}>
										{cell.stopSell ? 'STOP' : cell.available}
									</span>
									<div class="text-[8px] text-muted-foreground leading-none">/{cell.totalRooms}</div>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
						{/each}
					</tr>

					<!-- Rate row -->
					<tr class="border-b border-border/20 hover:bg-muted/5">
						<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1.5 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
							Rate / night
						</td>
						{#each data.dates as iso}
							{@const cell = data.ariData[rt.id]?.[iso]}
							<td style="width:{COL_W}px"
								class={['border-r border-border/20 px-0.5 py-1.5 text-center cursor-pointer transition-colors hover:bg-muted/40', cellBg(iso, cell ?? { stopSell: false, available: 0, totalRooms: 0, hasOverride: false, seasonColour: null } as ARICell)].join(' ')}
								onclick={() => openPopover(rt.id, iso)}
							>
								{#if cell}
									<span class={['font-mono text-[11px]', cell.overrideRateCents != null ? 'text-blue-700 font-bold' : ''].join(' ')}
										style={cell.seasonColour && !cell.overrideRateCents ? `color:${cell.seasonColour}; filter:brightness(0.6)` : ''}
									>
										{fmt(cell.effectiveRateCents)}
									</span>
									{#if cell.overrideRateCents != null}
										<div class="text-[8px] text-muted-foreground line-through leading-none">{fmt(cell.baseRateCents)}</div>
									{/if}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
						{/each}
					</tr>

					<!-- Restrictions row -->
					<tr class="border-b-2 border-border hover:bg-muted/5">
						<td class="sticky left-0 z-10 bg-background border-r border-border px-3 py-1 text-muted-foreground text-[10px] font-medium uppercase tracking-wide whitespace-nowrap">
							Min / Flags
						</td>
						{#each data.dates as iso}
							{@const cell = data.ariData[rt.id]?.[iso]}
							<td style="width:{COL_W}px"
								class={['border-r border-border/20 px-0.5 py-1 text-center cursor-pointer transition-colors hover:bg-muted/40', cellBg(iso, cell ?? { stopSell: false, available: 0, totalRooms: 0, hasOverride: false, seasonColour: null } as ARICell)].join(' ')}
								onclick={() => openPopover(rt.id, iso)}
							>
								{#if cell}
									<div class="flex flex-col items-center gap-0.5">
										{#if cell.minNights > 1}
											<span class="text-[9px] font-medium text-amber-700 leading-none">{cell.minNights}n</span>
										{:else}
											<span class="text-[9px] text-muted-foreground/50 leading-none">1n</span>
										{/if}
										<div class="flex gap-0.5">
											{#if cell.closedToArrival}
												<span class="text-[8px] text-red-600 font-bold" title="Closed to arrival">CTA</span>
											{/if}
											{#if cell.closedToDeparture}
												<span class="text-[8px] text-orange-600 font-bold" title="Closed to departure">CTD</span>
											{/if}
										</div>
									</div>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
						{/each}
					</tr>
				{:else}
					<tr>
						<td colspan={1 + data.dates.length} class="px-4 py-8 text-center text-muted-foreground text-sm">
							No room types configured for this property.
							<a href="/settings" class="text-primary underline ml-1">Go to Settings → Room Types</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<!-- ── Edit Cell Popover ─────────────────────────────────────────────────────── -->
{#if popoverCell}
	{@const cell = data.ariData[popoverCell.roomTypeId]?.[popoverCell.date]}
	{@const rt = data.roomTypesList.find(r => r.id === popoverCell?.roomTypeId)}
	<div class="fixed z-30 rounded-xl border border-border bg-background shadow-xl p-4 w-72"
		style="top: 50%; left: 50%; transform: translate(-50%, -50%)"
		role="dialog" aria-label="Edit override"
	>
		<div class="mb-3 flex items-start justify-between">
			<div>
				<p class="font-semibold text-sm">{rt?.name}</p>
				<p class="text-xs text-muted-foreground">
					{new Date(popoverCell.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}
					{#if cell?.totalRooms}
						· {cell.available}/{cell.totalRooms} available
					{/if}
				</p>
			</div>
			<button onclick={closePopover} class="text-muted-foreground hover:text-foreground text-lg leading-none px-1">×</button>
		</div>

		<div class="space-y-3">
			<!-- Rate override -->
			<div>
				<label class="text-xs text-muted-foreground font-medium uppercase tracking-wide">
					Rate override ($/night)
				</label>
				<div class="flex items-center gap-2 mt-1">
					<span class="text-sm text-muted-foreground">$</span>
					<input type="number" min="0" step="1" bind:value={editRate}
						placeholder={cell?.baseRateCents ? String(cell.baseRateCents / 100) : 'Season rate'}
						class="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
					{#if editRate}
						<button onclick={() => editRate = ''} class="text-xs text-muted-foreground hover:text-foreground">✕</button>
					{/if}
				</div>
				{#if cell?.baseRateCents}
					<p class="text-[10px] text-muted-foreground mt-0.5">Season rate: {fmt(cell.baseRateCents)}</p>
				{/if}
			</div>

			<!-- Min nights override -->
			<div>
				<label class="text-xs text-muted-foreground font-medium uppercase tracking-wide">
					Min nights override
				</label>
				<input type="number" min="1" max="30" bind:value={editMin}
					placeholder={String(cell?.baseMinNights ?? 1)}
					class="mt-1 w-24 rounded border border-input bg-background px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
			</div>

			<!-- Restriction toggles -->
			<div class="space-y-2">
				<label class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Restrictions</label>

				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={editStopSell}
						class="h-4 w-4 rounded border-input" />
					<span class="text-sm">Stop sell — close to all channels</span>
				</label>

				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={editCTA}
						class="h-4 w-4 rounded border-input" />
					<span class="text-sm">Closed to arrival (CTA)</span>
				</label>

				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={editCTD}
						class="h-4 w-4 rounded border-input" />
					<span class="text-sm">Closed to departure (CTD)</span>
				</label>
			</div>
		</div>

		<div class="mt-4 flex gap-2">
			<button onclick={saveOverride} disabled={savingCell}
				class="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
				{savingCell ? 'Saving…' : 'Save override'}
			</button>
			{#if cell?.hasOverride}
				<button onclick={clearOverride} disabled={savingCell}
					class="rounded-lg border border-border px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
					title="Remove override, revert to season rate">
					Clear
				</button>
			{/if}
		</div>
		<p class="text-[10px] text-muted-foreground text-center mt-2">Changes sync to Channex automatically</p>
	</div>
{/if}
