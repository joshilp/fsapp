<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data }: { data: PageData } = $props();

	// ── Trigger form state ────────────────────────────────────────────────────
	let event      = $state<'booking_new' | 'booking_cancel'>('booking_new');
	let propId     = $state(data.properties[0]?.id ?? '');
	let rtId       = $state('');
	let checkIn    = $state('');
	let checkOut   = $state('');
	let guestName  = $state('Test Guest');
	let guestEmail = $state('test@example.com');
	let guestPhone = $state('');
	let otaName    = $state('Booking.com');
	let adults     = $state(2);
	let notes      = $state('');
	let otaRef     = $state('');

	let triggering = $state(false);
	let triggerResult = $state<{ ok: boolean; payload: unknown; result: unknown } | null>(null);

	// Log state
	let log       = $state(data.log);
	let logBusy   = $state(false);
	let expanded  = $state<string | null>(null);

	// Filter room types to selected property
	const propRoomTypes = $derived(data.roomTypes.filter(rt => rt.propertyId === propId));
	const selRt = $derived(propRoomTypes.find(rt => rt.id === rtId));

	// When property changes, reset room type
	$effect(() => {
		if (propRoomTypes.length) rtId = propRoomTypes[0].id;
		else rtId = '';
	});

	async function refreshLog() {
		logBusy = true;
		try {
			const r = await fetch('/api/dev/channex-log');
			if (r.ok) log = await r.json();
		} finally { logBusy = false; }
	}

	async function clearLog() {
		logBusy = true;
		await fetch('/api/dev/channex-log', { method: 'DELETE' });
		log = [];
		logBusy = false;
	}

	async function fireTrigger() {
		const prop = data.properties.find(p => p.id === propId);
		if (!prop) { toast.error('Select a property.'); return; }
		if (!rtId)  { toast.error('Select a room type.'); return; }
		if (!checkIn || !checkOut) { toast.error('Set check-in and check-out dates.'); return; }

		triggering = true;
		triggerResult = null;
		try {
			// Pass Channex IDs if configured, otherwise the trigger endpoint uses internal IDs
			const r = await fetch('/api/dev/channex-trigger', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					event,
					// Channex IDs (real — used if configured in Settings)
					channexPropertyId: prop.channexPropertyId || null,
					channexRoomTypeId: selRt?.channexRoomTypeId || null,
					channexRatePlanId: selRt?.channexRatePlanId || null,
					// Internal IDs (dev fallback — used when Channex IDs are not set)
					propertyId: propId,
					roomTypeId: rtId,
					// Booking details
					checkIn, checkOut,
					guestName, guestEmail: guestEmail || null, guestPhone: guestPhone || null,
					adults, otaName, notes: notes || null, otaRef: otaRef || null
				})
			});
			const d = await r.json();
			triggerResult = d;
			if (d.ok) {
				toast.success(`Webhook fired — ${event} processed`);
				await invalidateAll();
				await refreshLog();
			} else {
				toast.error(`Webhook returned ${d.status}: ${JSON.stringify(d.result)}`);
			}
		} catch (e) {
			toast.error('Network error firing webhook');
		} finally { triggering = false; }
	}

	function fmtTs(iso: string) {
		return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function today() {
		return new Date().toISOString().slice(0, 10);
	}
	function nextWeek() {
		const d = new Date(); d.setDate(d.getDate() + 7);
		return d.toISOString().slice(0, 10);
	}

	// Default dates
	if (!checkIn)  checkIn  = today();
	if (!checkOut) checkOut = nextWeek();
</script>

<div class="mx-auto max-w-5xl px-4 py-6 space-y-6">

	<!-- Header -->
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight">Channex Dev Simulator</h1>
			<p class="text-sm text-muted-foreground mt-0.5">Test ARI sync and inbound booking webhooks without a live Channex account.</p>
		</div>
		<div class="flex items-center gap-2">
			{#if data.isMockMode}
				<span class="rounded-full bg-green-100 border border-green-300 px-3 py-0.5 text-xs font-semibold text-green-800">MOCK MODE ON</span>
			{:else}
				<span class="rounded-full bg-amber-100 border border-amber-300 px-3 py-0.5 text-xs font-semibold text-amber-800">LIVE MODE</span>
				<p class="text-xs text-muted-foreground">Set <code class="bg-muted px-1 rounded">CHANNEX_MOCK=true</code> in .env to enable mock mode.</p>
			{/if}
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">

		<!-- ── Left: Webhook trigger ─────────────────────────────────────────── -->
		<div class="space-y-4">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fire Test Webhook</h2>

			<div class="rounded-lg border border-border bg-card p-4 space-y-3">

				<!-- Event type -->
				<div class="flex gap-2">
					{#each (['booking_new', 'booking_cancel'] as const) as ev}
						<button type="button" onclick={() => event = ev}
							class={['flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
								event === ev
									? 'bg-foreground text-background border-foreground'
									: 'bg-background text-muted-foreground border-border hover:border-foreground/30'
							].join(' ')}>
							{ev === 'booking_new' ? 'New Booking' : 'Cancel Booking'}
						</button>
					{/each}
				</div>

				<!-- Property + Room type -->
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Property</label>
						<select bind:value={propId} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
							{#each data.properties as p}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
						{#if data.properties.find(p => p.id === propId)?.channexPropertyId}
							<p class="text-[10px] text-green-600 mt-0.5">✓ Channex ID set</p>
						{:else}
							<p class="text-[10px] text-muted-foreground mt-0.5">Using internal ID (mock only)</p>
						{/if}
					</div>
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Room Type</label>
						<select bind:value={rtId} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
							{#each propRoomTypes as rt}
								<option value={rt.id}>{rt.name}</option>
							{/each}
						</select>
						{#if selRt?.channexRoomTypeId}
							<p class="text-[10px] text-green-600 mt-0.5">✓ Channex ID set</p>
						{:else}
							<p class="text-[10px] text-muted-foreground mt-0.5">Using internal ID (mock only)</p>
						{/if}
					</div>
				</div>

				<!-- Dates -->
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Check-in</label>
						<input type="date" bind:value={checkIn} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
					</div>
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Check-out</label>
						<input type="date" bind:value={checkOut} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
					</div>
				</div>

				<!-- Guest -->
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Guest name</label>
						<input type="text" bind:value={guestName} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
					</div>
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">OTA source</label>
						<select bind:value={otaName} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
							{#each ['Booking.com', 'Expedia', 'Airbnb', 'Google Hotels', 'Test OTA'] as ota}
								<option value={ota}>{ota}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Email (optional)</label>
						<input type="email" bind:value={guestEmail} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
					</div>
					<div>
						<label class="mb-1 block text-xs text-muted-foreground">Adults</label>
						<input type="number" min="1" max="10" bind:value={adults} class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
					</div>
				</div>
				<div>
					<label class="mb-1 block text-xs text-muted-foreground">OTA ref # (leave blank to auto-generate)</label>
					<input type="text" bind:value={otaRef} placeholder="e.g. BDC-1234567" class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
				</div>

				<button type="button" onclick={fireTrigger} disabled={triggering}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
					{triggering ? 'Firing…' : `🔫 Fire ${event === 'booking_new' ? 'new booking' : 'cancellation'} webhook`}
				</button>

				{#if triggerResult}
					<div class={['rounded-md border p-3 text-xs', triggerResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'].join(' ')}>
						{#if triggerResult.ok}
							<p class="font-semibold">✓ Webhook accepted</p>
						{:else}
							<p class="font-semibold">✗ Webhook rejected (status {(triggerResult as { ok: boolean; status?: number }).status})</p>
						{/if}
						<details class="mt-1">
							<summary class="cursor-pointer text-[10px] opacity-70">Show raw payload</summary>
							<pre class="mt-1 overflow-auto text-[10px]">{JSON.stringify(triggerResult.payload, null, 2)}</pre>
						</details>
					</div>
				{/if}
			</div>
		</div>

		<!-- ── Right: ARI push log ──────────────────────────────────────────── -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">ARI Push Log <span class="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{log.length}</span></h2>
				<div class="flex gap-2">
					<button type="button" onclick={refreshLog} disabled={logBusy}
						class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">↻ Refresh</button>
					<button type="button" onclick={clearLog} disabled={logBusy || log.length === 0}
						class="text-xs text-red-600 hover:text-red-800 disabled:opacity-40">Clear</button>
				</div>
			</div>

			{#if !data.isMockMode}
				<div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
					⚠ Mock mode is off — ARI pushes go to the real Channex API and won't appear here. Set <code class="bg-amber-100 px-1 rounded">CHANNEX_MOCK=true</code> to log them locally.
				</div>
			{/if}

			{#if log.length === 0}
				<p class="text-sm text-muted-foreground italic">No ARI pushes yet. Update a rate or availability in the Inventory grid to see them here.</p>
			{:else}
				<div class="space-y-2">
					{#each log as entry}
						<div class="rounded-lg border border-border bg-card text-xs">
							<button type="button"
								onclick={() => expanded = expanded === entry.id ? null : entry.id}
								class="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/40">
								<div class="flex items-center gap-2">
									<span class="font-mono text-muted-foreground">{fmtTs(entry.timestamp)}</span>
									<span class="font-semibold">{(entry.updates as unknown[]).length} update{(entry.updates as unknown[]).length === 1 ? '' : 's'}</span>
								</div>
								<span class="text-muted-foreground">{expanded === entry.id ? '▲' : '▼'}</span>
							</button>
							{#if expanded === entry.id}
								<div class="border-t border-border px-3 py-2">
									<pre class="overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(entry.updates, null, 2)}</pre>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

	</div>
</div>
