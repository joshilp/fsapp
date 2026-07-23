<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	type Props = {
		open: boolean;
		bookingId: string;
		onClose?: () => void;
		onOpenEditModal?: (id: string) => void;
	};

	let { open = $bindable(false), bookingId, onClose, onOpenEditModal }: Props = $props();

	// ─── Data fetching ────────────────────────────────────────────────────────
	let apiData = $state<any | null>(null);
	let loading = $state(false);
	let fetchError = $state('');

	$effect(() => {
		if (open && !apiData && !loading) {
			loading = true;
			fetchError = '';
			fetch(`/api/booking/${bookingId}/checkin-data`)
				.then((r) => r.json())
				.then((d) => { apiData = d; })
				.catch((e) => { fetchError = String(e); })
				.finally(() => { loading = false; });
		}
		if (!open) { apiData = null; }
	});

	// ─── Form state ──────────────────────────────────────────────────────────
	type RateLine = { id: string; label: string; qty: string; unit: string; total: string };
	type TaxLine = { id: string; presetId: string; label: string; total: string };

	let rateLines = $state<RateLine[]>([]);
	let taxLines = $state<TaxLine[]>([]);
	let guestPhone = $state('');
	let guestEmail = $state('');
	let guestStreet = $state('');
	let guestCity = $state('');
	let guestProvince = $state('');
	let guestCountry = $state('Canada');
	let vehicleMake = $state('');
	let vehicleColour = $state('');
	let vehiclePlate = $state('');
	let numAdults = $state('1');
	let numChildren = $state('0');
	let otaRef = $state('');
	let notes = $state('');
	let paymentAmount = $state('');
	let paymentMethod = $state('card');
	let submitting = $state(false);
	let submitError = $state('');

	$effect(() => {
		if (!apiData) return;
		const { booking } = apiData;
		const guest = booking.guest;
		const existingRates = booking.lineItems?.filter((li: any) => li.type === 'rate' || li.type === 'extra') ?? [];
		const existingTaxes = booking.lineItems?.filter((li: any) => li.type === 'tax') ?? [];
		const n = nightCount(booking.checkInDate, booking.checkOutDate);
		rateLines = existingRates.length > 0
			? existingRates.map((li: any) => ({
				id: crypto.randomUUID(),
				label: li.label,
				qty: li.quantity != null ? String(li.quantity) : '',
				unit: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : '',
				total: (li.totalAmount / 100).toFixed(2)
			}))
			: [{ id: crypto.randomUUID(), label: '', qty: String(n), unit: '', total: '' }];
		taxLines = existingTaxes.map((li: any) => ({
			id: crypto.randomUUID(), presetId: '', label: li.label, total: (li.totalAmount / 100).toFixed(2)
		}));
		guestPhone = guest?.phone ?? '';
		guestEmail = guest?.email ?? '';
		guestStreet = guest?.street ?? '';
		guestCity = guest?.city ?? '';
		guestProvince = guest?.provinceState ?? '';
		guestCountry = guest?.country ?? 'Canada';
		vehicleMake = booking.vehicleMake ?? '';
		vehicleColour = booking.vehicleColour ?? '';
		vehiclePlate = booking.vehiclePlate ?? '';
		numAdults = String(booking.numAdults ?? 1);
		numChildren = String(booking.numChildren ?? 0);
		otaRef = booking.otaConfirmationNumber ?? '';
		notes = booking.notes ?? '';
		// Compute initial balance from raw data — avoids reading reactive rateLines/taxLines
		const rawRateTotal = existingRates.reduce((s: number, li: any) => s + li.totalAmount / 100, 0);
		const rawTaxTotal = existingTaxes.reduce((s: number, li: any) => s + li.totalAmount / 100, 0);
		const paid = (booking.paymentEvents ?? []).reduce((s: number, pe: any) => s + pe.amount / 100, 0);
		const initialBalance = Math.max(0, rawRateTotal + rawTaxTotal - paid);
		paymentAmount = initialBalance > 0 ? initialBalance.toFixed(2) : '';
	});

	// ─── Calculations ─────────────────────────────────────────────────────────
	function nightCount(ci: string, co: string) {
		return Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
	}

	const rateSubtotal = $derived(rateLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const taxTotal = $derived(taxLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const grandTotal = $derived(rateSubtotal + taxTotal);
	const paymentsReceived = $derived(
		(apiData?.booking.paymentEvents ?? []).reduce((s: number, pe: any) => s + pe.amount / 100, 0)
	);
	const balanceDue = $derived(Math.max(0, grandTotal - paymentsReceived));

	function fmt(n: number) { return n.toFixed(2); }

	function addRateLine() {
		rateLines = [...rateLines, { id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }];
	}
	function removeRateLine(id: string) { rateLines = rateLines.filter((l) => l.id !== id); }
	function addTaxLine() {
		taxLines = [...taxLines, { id: crypto.randomUUID(), presetId: '', label: '', total: '' }];
	}
	function removeTaxLine(id: string) { taxLines = taxLines.filter((l) => l.id !== id); }

	function applyPreset(line: TaxLine, presetId: string) {
		const preset = apiData?.taxPresets.find((p: any) => p.id === presetId);
		if (!preset) return;
		line.presetId = presetId;
		line.label = preset.label;
		line.total = fmt((rateSubtotal * preset.ratePercent) / 100);
	}

	function recalcRateTotal(line: RateLine) {
		const q = parseFloat(line.qty);
		const u = parseFloat(line.unit);
		if (!isNaN(q) && !isNaN(u)) line.total = fmt(q * u);
	}

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short', month: 'short', day: 'numeric'
		});
	}

	type DayCell = { date: number; inStay: boolean };
	function buildDayGrid(checkIn: string, checkOut: string): DayCell[][] {
		const stayDates = new Set<string>();
		const cur = new Date(checkIn + 'T12:00:00');
		const co = new Date(checkOut + 'T12:00:00');
		while (cur < co) { stayDates.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
		const start = new Date(checkIn + 'T12:00:00');
		start.setDate(start.getDate() - start.getDay());
		const end = new Date(checkOut + 'T12:00:00');
		end.setDate(end.getDate() + (6 - end.getDay()));
		const weeks: DayCell[][] = [];
		const d = new Date(start);
		while (d <= end) {
			const week: DayCell[] = [];
			for (let i = 0; i < 7; i++) {
				week.push({ date: d.getDate(), inStay: stayDates.has(d.toISOString().slice(0, 10)) });
				d.setDate(d.getDate() + 1);
			}
			weeks.push(week);
		}
		return weeks;
	}

	// Reactive title / description for CustomDialog header
	const dialogTitle = $derived(
		apiData
			? `${apiData.booking.status === 'checked_in' ? 'Registration Card' : 'Check In'} — Room ${apiData.booking.room?.roomNumber}`
			: 'Check In'
	);
	const dialogDesc = $derived(
		apiData ? `${apiData.booking.room?.property?.name ?? ''} · ${apiData.booking.guest?.name ?? ''}` : ''
	);
</script>

<CustomDialog
	bind:open
	title={dialogTitle}
	description={dialogDesc}
	interactOutsideBehavior="ignore"
	dialogClass="sm:max-w-2xl max-h-[92vh]"
>
	{#snippet actions()}
		{#if apiData && onOpenEditModal}
			<Button variant="ghost" size="sm" class="text-xs h-7"
				onclick={() => { open = false; onOpenEditModal?.(bookingId); }}>
				Edit dates/room
			</Button>
		{/if}
		{#if apiData}
			<a href="/booking/{bookingId}/print" target="_blank">
				<Button variant="outline" size="sm" class="text-xs h-7">🖨 Print</Button>
			</a>
		{/if}
	{/snippet}

	{#snippet content()}
		{#if loading}
			<div class="flex items-center justify-center py-16">
				<div class="text-muted-foreground text-sm">Loading…</div>
			</div>
		{:else if fetchError}
			<div class="text-destructive text-sm py-8 text-center">{fetchError}</div>
		{:else if apiData}
			{@const booking = apiData.booking}
			{@const guest = booking.guest}
			{@const priorStay = apiData.priorStay}
			{@const taxPresets = apiData.taxPresets}
			{@const nights = nightCount(booking.checkInDate, booking.checkOutDate)}
			{@const dayGrid = buildDayGrid(booking.checkInDate, booking.checkOutDate)}

			<!-- Prior stay banner -->
			{#if priorStay}
				<div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
					<p class="font-semibold">↩ Continuation — guest moved from Room {priorStay.roomNumber}</p>
					<p class="text-amber-800">
						Prior: <strong>Rm {priorStay.roomNumber}</strong>
						· {priorStay.checkInDate} → {priorStay.checkOutDate}
						{#if priorStay.chargesCents > 0}
							· Prior charges: <strong>${(priorStay.chargesCents / 100).toFixed(2)}</strong>
						{:else}
							· <span class="italic">No prior charges yet</span>
						{/if}
					</p>
				</div>
			{/if}

			<!-- Header summary card -->
			<div class="bg-card border-border mb-4 rounded-lg border p-4 shadow-sm">
				<div class="flex items-start justify-between">
					<div>
						<p class="font-semibold">{guest?.name ?? '—'}
							{#if booking.channel?.name && booking.channel.name !== 'Direct'}
								<span class="ml-2 bg-amber-100 text-amber-800 rounded px-2 py-0.5 text-xs font-semibold">{booking.channel.name}</span>
							{/if}
						</p>
						<p class="text-muted-foreground text-sm">
							{formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)} · {nights} night{nights === 1 ? '' : 's'}
						</p>
					</div>
				</div>
				<!-- Day grid -->
				<div class="mt-3">
					<div class="mb-1 grid grid-cols-7 gap-0.5 text-center">
						{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as dow}
							<div class="text-muted-foreground text-[10px] font-medium">{dow}</div>
						{/each}
					</div>
					{#each dayGrid as week}
						<div class="mb-0.5 grid grid-cols-7 gap-0.5 text-center">
							{#each week as cell}
								<div class="rounded py-0.5 text-xs {cell.inStay ? 'bg-teal-500 font-semibold text-white' : 'text-muted-foreground'}">{cell.date}</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>

			{#if submitError}
				<div class="mb-3 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{submitError}</div>
			{/if}

			<!-- Main form -->
			<form
				method="POST"
				action="/booking/{bookingId}/checkin"
				use:enhance={() => {
					submitting = true;
					submitError = '';
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'redirect') {
							open = false;
							onClose?.();
							await invalidateAll();
						} else if (result.type === 'failure') {
							submitError = (result.data?.error as string) ?? 'Error saving';
						}
					};
				}}
			>
				<input type="hidden" name="rateCount" value={rateLines.length} />
				<input type="hidden" name="taxCount" value={taxLines.length} />

				<!-- Guest rating banners -->
				{#if guest?.rating && guest.rating >= 4}
					{@const WARN = ['','','','','⚠ Caution guest — review notes before check-in','⛔ Blocked guest — do not check in without approval']}
					{@const CLR = ['','','','','bg-amber-50 border-amber-300 text-amber-800','bg-red-50 border-red-300 text-red-800']}
					<div class="mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium {CLR[guest.rating]}">
						<span>{WARN[guest.rating]}</span>
						{#if guest.ratingNotes}<span class="ml-1 font-normal opacity-80">— {guest.ratingNotes}</span>{/if}
						<a href="/guests?id={guest.id}" target="_blank" class="ml-auto shrink-0 underline text-xs opacity-70">Profile</a>
					</div>
				{:else if guest?.rating}
					{@const GOOD = ['','★ Excellent','★★ Good','★★★ Average','',''][guest.rating]}
					<div class="mb-3 flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 text-green-800 px-3 py-1.5 text-xs">
						<span class="font-medium">{GOOD} guest</span>
						{#if guest.ratingNotes}<span class="opacity-70">— {guest.ratingNotes}</span>{/if}
					</div>
				{/if}

				<!-- ── Guest Details ──────────────────────────────────────────── -->
				<section class="mb-5">
					<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest Details</h3>
					<div class="grid grid-cols-2 gap-3">
						<div class="flex flex-col gap-1.5">
							<Label class="text-xs">Name</Label>
							<div class="border-input bg-muted rounded-md border px-3 py-2 text-sm">{guest?.name ?? '—'}</div>
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-phone" class="text-xs">Phone</Label>
							<Input id="ci-phone" name="guestPhone" type="tel" bind:value={guestPhone} class="h-9" />
						</div>
						<div class="col-span-2 flex flex-col gap-1.5">
							<Label for="ci-email" class="text-xs">Email</Label>
							<Input id="ci-email" name="guestEmail" type="email" bind:value={guestEmail} class="h-9" />
						</div>
						<div class="col-span-2 flex flex-col gap-1.5">
							<Label for="ci-street" class="text-xs">Street address</Label>
							<Input id="ci-street" name="guestStreet" bind:value={guestStreet} class="h-9" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-city" class="text-xs">City</Label>
							<Input id="ci-city" name="guestCity" bind:value={guestCity} class="h-9" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-prov" class="text-xs">Province / State</Label>
							<Input id="ci-prov" name="guestProvince" bind:value={guestProvince} class="h-9" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-country" class="text-xs">Country</Label>
							<Input id="ci-country" name="guestCountry" bind:value={guestCountry} class="h-9" />
						</div>
					</div>
					<div class="mt-3 grid grid-cols-3 gap-3">
						<div class="flex flex-col gap-1.5">
							<Label for="ci-vehicle" class="text-xs">Vehicle make/model</Label>
							<Input id="ci-vehicle" name="vehicleMake" bind:value={vehicleMake} placeholder="Honda Civic" class="h-9" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-colour" class="text-xs">Colour</Label>
							<Input id="ci-colour" name="vehicleColour" bind:value={vehicleColour} class="h-9" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-plate" class="text-xs">Plate</Label>
							<Input id="ci-plate" name="vehiclePlate" bind:value={vehiclePlate} class="h-9" />
						</div>
					</div>
					<div class="mt-3 grid grid-cols-3 gap-3">
						<div class="flex flex-col gap-1.5">
							<Label for="ci-adults" class="text-xs">Adults</Label>
							<Input id="ci-adults" name="numAdults" type="number" min="1" bind:value={numAdults} class="h-9 w-20" />
						</div>
						<div class="flex flex-col gap-1.5">
							<Label for="ci-children" class="text-xs">Children</Label>
							<Input id="ci-children" name="numChildren" type="number" min="0" bind:value={numChildren} class="h-9 w-20" />
						</div>
						{#if booking.channel?.name && booking.channel.name !== 'Direct'}
							<div class="flex flex-col gap-1.5">
								<Label for="ci-ota" class="text-xs">OTA confirmation #</Label>
								<Input id="ci-ota" name="otaConfirmationNumber" bind:value={otaRef} class="h-9" />
							</div>
						{/if}
					</div>
					<div class="mt-3 flex flex-col gap-1.5">
						<Label for="ci-notes" class="text-xs">Notes</Label>
						<textarea id="ci-notes" name="notes" bind:value={notes} rows="2"
							class="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"></textarea>
					</div>
				</section>

				<!-- ── Charges ────────────────────────────────────────────────── -->
				<section class="mb-5">
					<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Charges</h3>
					<div class="mb-2 space-y-2">
						{#each rateLines as line, i (line.id)}
							<div class="flex items-center gap-2">
								<Input name="rate-label-{i}" placeholder="e.g. 3 nights @ $129" bind:value={line.label} class="flex-1 h-9" />
								<Input name="rate-qty-{i}" type="number" step="0.5" placeholder="Qty" bind:value={line.qty} oninput={() => recalcRateTotal(line)} class="w-16 text-center h-9" />
								<span class="text-muted-foreground text-sm">×</span>
								<Input name="rate-unit-{i}" type="number" step="0.01" placeholder="$/unit" bind:value={line.unit} oninput={() => recalcRateTotal(line)} class="w-24 h-9" />
								<span class="text-muted-foreground text-sm">=</span>
								<div class="relative w-24">
									<span class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
									<Input name="rate-total-{i}" type="number" step="0.01" bind:value={line.total} class="pl-6 h-9" />
								</div>
								<button type="button" class="text-muted-foreground hover:text-destructive shrink-0 text-lg leading-none" onclick={() => removeRateLine(line.id)}>×</button>
							</div>
						{/each}
					</div>
					<Button type="button" variant="ghost" size="sm" onclick={addRateLine} class="mb-3 text-xs h-7">+ Add rate line</Button>

					<div class="border-border mb-3 flex justify-between border-t pt-2 text-sm">
						<span class="text-muted-foreground">Subtotal</span>
						<span class="font-medium">${fmt(rateSubtotal)}</span>
					</div>

					<!-- Tax lines -->
					<div class="mb-2 space-y-2">
						{#each taxLines as line, i (line.id)}
							<div class="flex items-center gap-2">
								<select class="border-input bg-background focus-visible:ring-ring flex-1 rounded-md border px-2 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none h-9"
									onchange={(e) => applyPreset(line, (e.target as HTMLSelectElement).value)}>
									<option value="">Custom tax…</option>
									{#each taxPresets as preset}
										<option value={preset.id} selected={line.presetId === preset.id}>{preset.label} ({preset.ratePercent}%)</option>
									{/each}
								</select>
								<Input name="tax-label-{i}" placeholder="Tax label" bind:value={line.label} class="flex-1 h-9" />
								<div class="relative w-24">
									<span class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
									<Input name="tax-total-{i}" type="number" step="0.01" bind:value={line.total} class="pl-6 h-9" />
								</div>
								<button type="button" class="text-muted-foreground hover:text-destructive shrink-0 text-lg leading-none" onclick={() => removeTaxLine(line.id)}>×</button>
							</div>
						{/each}
					</div>
					<Button type="button" variant="ghost" size="sm" onclick={addTaxLine} class="mb-3 text-xs h-7">+ Add tax</Button>

					<!-- Summary -->
					<div class="bg-muted/40 border-border rounded-md border p-3 space-y-1.5 text-sm">
						<div class="flex justify-between"><span class="text-muted-foreground">Subtotal</span><span>${fmt(rateSubtotal)}</span></div>
						{#if taxTotal > 0}
							<div class="flex justify-between"><span class="text-muted-foreground">Taxes</span><span>${fmt(taxTotal)}</span></div>
						{/if}
						<div class="flex justify-between font-semibold border-t border-border pt-1.5">
							<span>Total</span><span>${fmt(grandTotal)}</span>
						</div>
						{#if (booking.paymentEvents ?? []).length > 0}
							<div class="border-t border-border pt-1.5 space-y-1">
								{#each booking.paymentEvents ?? [] as pe}
									<div class="flex justify-between text-xs text-green-700">
										<span>✓ Paid ({pe.paymentMethod}){#if pe.chargedAt} · {new Date(pe.chargedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}{/if}</span>
										<span class="font-mono">${fmt(pe.amount / 100)}</span>
									</div>
								{/each}
							</div>
							<div class="flex justify-between font-bold border-t border-border pt-1.5 {balanceDue <= 0 ? 'text-green-700' : ''}">
								<span>{balanceDue <= 0 ? '✓ Paid in full' : 'Balance due'}</span>
								<span>${fmt(balanceDue)}</span>
							</div>
						{/if}
					</div>
				</section>

				<!-- ── Payment ────────────────────────────────────────────────── -->
				<section class="mb-5">
					<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{(booking.paymentEvents ?? []).length > 0 ? 'Record additional payment' : 'Collect payment'}
					</h3>
					<div class="flex flex-wrap items-center gap-3">
						<div class="relative">
							<span class="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
							<input name="paymentAmount" type="number" min="0" step="0.01" bind:value={paymentAmount}
								placeholder="0.00"
								class="border-input bg-background rounded-md border pl-6 pr-3 py-2 text-sm w-28 shadow-sm" />
						</div>
						<span class="text-muted-foreground text-sm">via</span>
						{#each ['card', 'cash', 'cheque'] as method}
							<button type="button"
								class="rounded-md border px-3 py-1.5 text-sm capitalize transition-colors {paymentMethod === method ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}"
								onclick={() => (paymentMethod = method)}>{method}</button>
						{/each}
						<input type="hidden" name="paymentMethod" value={paymentMethod} />
					</div>
					<p class="text-muted-foreground mt-1.5 text-xs">Leave 0 to save without recording a payment.</p>
				</section>

				<!-- Footer buttons -->
				<div class="flex items-center justify-between border-t pt-4">
					<Button type="button" variant="ghost" onclick={() => { open = false; onClose?.(); }} disabled={submitting}>Cancel</Button>
					<Button type="submit" disabled={submitting} class="min-w-32">
						{submitting ? 'Saving…' : booking.status === 'checked_in' ? 'Update Card' : 'Check In →'}
					</Button>
				</div>
			</form>
		{/if}
	{/snippet}
</CustomDialog>
