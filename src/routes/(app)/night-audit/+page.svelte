<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let running = $state(false);
	let auditNotes = $state('');

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
		});
	}

	function fmtCents(cents: number | null) {
		if (cents == null) return '—';
		return '$' + (cents / 100).toFixed(2);
	}

	function navUrl(propId: string, date = data.auditDate) {
		const p = new URLSearchParams({ prop: propId, date });
		return '?' + p.toString();
	}

	const today = new Date().toISOString().slice(0, 10);
	const isToday = data.auditDate === today;

	function prevDate(iso: string) {
		const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
	}
	function nextDate(iso: string) {
		const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
	}
</script>

<svelte:head>
	<title>Night Audit</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-6 space-y-6">

	<!-- Header -->
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-xl font-bold">Night Audit</h1>

		{#if data.allProperties.length > 1}
			<select
				class="rounded border border-input bg-background px-2 py-1 text-sm"
				onchange={(e) => goto(navUrl((e.target as HTMLSelectElement).value))}
			>
				{#each data.allProperties as p}
					<option value={p.id} selected={p.id === data.propId}>{p.name}</option>
				{/each}
			</select>
		{/if}

		<!-- Date nav -->
		<div class="flex items-center gap-1 rounded-lg border px-1">
			<a href={navUrl(data.propId, prevDate(data.auditDate))} class="px-2 py-1 text-sm hover:bg-muted rounded">‹</a>
			<span class="px-2 text-sm font-semibold">{fmtDate(data.auditDate)}</span>
			{#if data.auditDate < today}
				<a href={navUrl(data.propId, nextDate(data.auditDate))} class="px-2 py-1 text-sm hover:bg-muted rounded">›</a>
			{/if}
		</div>

		{#if !isToday}
			<a href={navUrl(data.propId, today)} class="text-xs text-primary hover:underline">→ Today</a>
		{/if}
	</div>

	<!-- Already-run banner -->
	{#if data.todayAudit}
		<div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
			✅ Audit run for this date
			{#if data.todayAudit.notes}· <em>{data.todayAudit.notes}</em>{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 md:grid-cols-3">

		<!-- Arrivals -->
		<div class="rounded-xl border p-4 space-y-3">
			<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
				↓ Arrivals
				<span class="ml-auto rounded-full bg-blue-100 text-blue-800 text-xs font-bold px-2">{data.arrivals.length}</span>
			</h2>
			{#if data.arrivals.length === 0}
				<p class="text-xs text-muted-foreground">None</p>
			{:else}
				<div class="space-y-1.5">
					{#each data.arrivals as b}
						<div class="text-sm flex items-center gap-2">
							{#if b.room}
								<span class="text-xs font-mono bg-muted px-1 rounded">Rm {b.room.roomNumber}</span>
							{/if}
							<span class="truncate">{b.guest?.name ?? '—'}</span>
							<span class="ml-auto text-xs rounded px-1 py-0.5
								{b.status === 'checked_in' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
								{b.status === 'checked_in' ? 'In' : 'Pending'}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Departures -->
		<div class="rounded-xl border p-4 space-y-3">
			<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
				↑ Departures
				<span class="ml-auto rounded-full bg-orange-100 text-orange-800 text-xs font-bold px-2">{data.departures.length}</span>
			</h2>
			{#if data.departures.length === 0}
				<p class="text-xs text-muted-foreground">None</p>
			{:else}
				<div class="space-y-1.5">
					{#each data.departures as b}
						<div class="text-sm flex items-center gap-2">
							{#if b.room}
								<span class="text-xs font-mono bg-muted px-1 rounded">Rm {b.room.roomNumber}</span>
							{/if}
							<span class="truncate">{b.guest?.name ?? '—'}</span>
							<span class="ml-auto text-xs rounded px-1 py-0.5
								{b.status === 'checked_out' ? 'bg-gray-100 text-gray-600' : 'bg-orange-100 text-orange-700'}">
								{b.status === 'checked_out' ? 'Done' : 'Due'}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- In-house count -->
		<div class="rounded-xl border p-4 space-y-3">
			<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">In-house</h2>
			<p class="text-4xl font-bold">{data.inHouse.length}</p>
			<p class="text-xs text-muted-foreground">guests currently checked in</p>
		</div>
	</div>

	<!-- In-house charge preview -->
	{#if data.inHouse.length > 0}
		<div class="rounded-xl border overflow-hidden">
			<div class="px-4 py-3 border-b bg-muted/30">
				<h2 class="text-sm font-semibold">Tonight's Room Charges</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Running the audit will post these as individual line items.</p>
			</div>
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b text-xs text-muted-foreground">
						<th class="px-4 py-2 text-left">Room</th>
						<th class="px-4 py-2 text-left">Guest</th>
						<th class="px-4 py-2 text-left">Dates</th>
						<th class="px-4 py-2 text-right">Tonight</th>
						<th class="px-4 py-2 text-center">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.inHouse as b}
						<tr class="border-b last:border-0 hover:bg-muted/20">
							<td class="px-4 py-2 font-mono text-xs">
								{b.room ? 'Rm ' + b.room.roomNumber : '—'}
							</td>
							<td class="px-4 py-2 truncate max-w-[140px]">{b.guest?.name ?? '—'}</td>
							<td class="px-4 py-2 text-xs text-muted-foreground">
								{b.checkInDate} → {b.checkOutDate}
							</td>
							<td class="px-4 py-2 text-right font-mono font-medium">
								{fmtCents(b.nightlyRateCents)}
							</td>
							<td class="px-4 py-2 text-center">
								{#if b.alreadyPosted}
									<span class="text-[10px] rounded bg-green-100 text-green-700 px-1.5 py-0.5">Posted</span>
								{:else}
									<span class="text-[10px] rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">Pending</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Run audit form -->
	{#if !data.todayAudit}
		<form method="POST" action="?/runAudit"
			use:enhance={() => {
				running = true;
				return async ({ result, update }) => {
					running = false;
					if (result.type === 'success') {
						toast.success('Night audit complete');
					} else {
						const err = (result as { type: 'failure'; data?: { error?: string } }).data?.error ?? 'Audit failed';
						toast.error(err);
					}
					await update();
				};
			}}
			class="rounded-xl border p-4 space-y-4 bg-muted/10"
		>
			<input type="hidden" name="propId" value={data.propId} />
			<input type="hidden" name="auditDate" value={data.auditDate} />

			<div class="flex flex-col gap-1.5">
				<label for="audit-notes" class="text-sm font-medium">Notes (optional)</label>
				<input id="audit-notes" name="notes" type="text"
					bind:value={auditNotes}
					placeholder="e.g. All guests balanced, no issues"
					class="border-input bg-background rounded border px-3 py-1.5 text-sm w-full max-w-md" />
			</div>

			<div class="flex items-center gap-3">
				<button type="submit" disabled={running}
					class="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
					{running ? 'Running…' : `✓ Run Night Audit · ${fmtDate(data.auditDate)}`}
				</button>
				<p class="text-xs text-muted-foreground">
					Posts tonight's room charges and marks this date as audited.
				</p>
			</div>
		</form>
	{/if}

	<!-- Audit history -->
	{#if data.pastRuns.length > 0}
		<div class="space-y-2">
			<h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Audits</h2>
			<div class="rounded-xl border overflow-hidden divide-y">
				{#each data.pastRuns as run}
					<div class="px-4 py-2.5 flex items-center gap-3 text-sm">
						<span class="font-medium">{fmtDate(run.auditDate)}</span>
						{#if run.notes}<span class="text-muted-foreground text-xs flex-1 truncate">{run.notes}</span>{/if}
						<span class="ml-auto text-xs text-muted-foreground">
							{new Date(run.createdAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

</div>
