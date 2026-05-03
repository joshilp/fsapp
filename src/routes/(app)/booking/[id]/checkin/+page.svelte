<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { booking, taxPresets, priorStay } = $derived(data);
	const guest = $derived(booking.guest);
	const room = $derived(booking.room);
	const property = $derived(room?.property);

	// ─── Night count & day grid ───────────────────────────────────────────────

	const nights = $derived(() => {
		const ms = new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime();
		return Math.round(ms / 86400000);
	});

	// Build a week grid (S M T W T F S) showing nights of stay
	type DayCell = { date: number; monthDay: number; inStay: boolean };
	const dayGrid = $derived((): DayCell[][] => {
		const checkIn = new Date(booking.checkInDate + 'T12:00:00');
		const checkOut = new Date(booking.checkOutDate + 'T12:00:00');
		const stayDates = new Set<string>();
		const cur = new Date(checkIn);
		while (cur < checkOut) {
			stayDates.add(cur.toISOString().slice(0, 10));
			cur.setDate(cur.getDate() + 1);
		}

		// Start from Sunday before check-in
		const start = new Date(checkIn);
		start.setDate(start.getDate() - start.getDay());
		// End at Saturday after last night
		const end = new Date(checkOut);
		end.setDate(end.getDate() + (6 - end.getDay()));

		const weeks: DayCell[][] = [];
		const d = new Date(start);
		while (d <= end) {
			const week: DayCell[] = [];
			for (let i = 0; i < 7; i++) {
				const iso = d.toISOString().slice(0, 10);
				week.push({ date: d.getDate(), monthDay: d.getDate(), inStay: stayDates.has(iso) });
				d.setDate(d.getDate() + 1);
			}
			weeks.push(week);
		}
		return weeks;
	});

	// ─── Dynamic line items ───────────────────────────────────────────────────

	type RateLine = { id: string; label: string; qty: string; unit: string; total: string };
	type TaxLine = { id: string; presetId: string; label: string; total: string };

	// Pre-populate from existing line items
	const existingRates = booking.lineItems?.filter((li) => li.type === 'rate' || li.type === 'extra') ?? [];
	const existingTaxes = booking.lineItems?.filter((li) => li.type === 'tax') ?? [];
	const existingDeposit = booking.lineItems?.filter((li) => li.type === 'deposit') ?? [];

	let rateLines = $state<RateLine[]>(
		existingRates.length > 0
			? existingRates.map((li) => ({
					id: crypto.randomUUID(),
					label: li.label,
					qty: li.quantity != null ? String(li.quantity) : '',
					unit: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : '',
					total: (li.totalAmount / 100).toFixed(2)
				}))
			: [{ id: crypto.randomUUID(), label: '', qty: String(nights()), unit: '', total: '' }]
	);

	let taxLines = $state<TaxLine[]>(
		existingTaxes.map((li) => ({
			id: crypto.randomUUID(),
			presetId: '',
			label: li.label,
			total: (li.totalAmount / 100).toFixed(2)
		}))
	);

	// ─── Calculations ─────────────────────────────────────────────────────────

	const rateSubtotal = $derived(
		rateLines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
	);
	const taxTotal = $derived(taxLines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0));
	const depositLineTotal = $derived(
		existingDeposit.reduce((sum, li) => sum + li.totalAmount / 100, 0) // negative cents stored as negative
	);
	// Sum of all recorded payment events (deposits + charges)
	const paymentsReceived = $derived(
		(booking.paymentEvents ?? []).reduce((sum, pe) => sum + pe.amount / 100, 0)
	);
	const grandTotal = $derived(rateSubtotal + taxTotal);
	// Balance = total charges minus all money actually received
	const balanceDue = $derived(Math.max(0, grandTotal - paymentsReceived));

	// ─── Payment recording ────────────────────────────────────────────────────

	let paymentAmount = $state(balanceDue > 0 ? fmt(balanceDue) : '');
	let paymentMethod = $state('card');

	// Keep payment amount in sync with balance when charges change
	$effect(() => {
		if (balanceDue > 0 && !paymentAmount) paymentAmount = fmt(balanceDue);
	});

	function fmt(n: number) {
		return n.toFixed(2);
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────

	function addRateLine() {
		rateLines = [
			...rateLines,
			{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }
		];
	}
	function removeRateLine(id: string) {
		rateLines = rateLines.filter((l) => l.id !== id);
	}
	function addTaxLine() {
		taxLines = [...taxLines, { id: crypto.randomUUID(), presetId: '', label: '', total: '' }];
	}
	function removeTaxLine(id: string) {
		taxLines = taxLines.filter((l) => l.id !== id);
	}

	function applyPreset(line: TaxLine, presetId: string) {
		const preset = taxPresets.find((p) => p.id === presetId);
		if (!preset) return;
		line.presetId = presetId;
		line.label = preset.label;
		// Auto-calculate based on current rate subtotal
		line.total = fmt((rateSubtotal * preset.ratePercent) / 100);
	}

	function recalcRateTotal(line: RateLine) {
		const q = parseFloat(line.qty);
		const u = parseFloat(line.unit);
		if (!isNaN(q) && !isNaN(u)) line.total = fmt(q * u);
	}

	let submitting = $state(false);

	// Guest fields (bindable, pre-filled)
	let guestPhone = $state(guest?.phone ?? '');
	let guestEmail = $state(guest?.email ?? '');
	let guestStreet = $state(guest?.street ?? '');
	let guestCity = $state(guest?.city ?? '');
	let guestProvince = $state(guest?.provinceState ?? '');
	let guestCountry = $state(guest?.country ?? 'Canada');
	let vehicleMake = $state(booking.vehicleMake ?? '');
	let vehicleColour = $state(booking.vehicleColour ?? '');
	let vehiclePlate = $state(booking.vehiclePlate ?? '');
	let numAdults = $state(String(booking.numAdults ?? 1));
	let numChildren = $state(String(booking.numChildren ?? 0));
	let otaRef = $state(booking.otaConfirmationNumber ?? '');
	let notes = $state(booking.notes ?? '');

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	const backHref = $derived(() => {
		const [y, m] = booking.checkInDate.split('-');
		return `/booking?month=${y}-${m}`;
	});
</script>

<svelte:head>
	<title>Check In — Room {room?.roomNumber}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<!-- Back link + quick actions -->
	<div class="mb-4 flex items-center gap-3">
		<a href={backHref()} class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
			← Back
		</a>
		<div class="ml-auto flex gap-2">
			<a href="/booking/{booking.id}/edit">
				<Button variant="ghost" size="sm">Edit dates/room</Button>
			</a>
			<a href="/booking/{booking.id}/print" target="_blank">
				<Button variant="outline" size="sm">🖨 Print</Button>
			</a>
		</div>
	</div>

	<!-- Prior stay banner (room move continuation) -->
	{#if priorStay}
		<div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
			<p class="font-semibold">↩ Continuation stay — guest moved from Room {priorStay.roomNumber}</p>
			<p class="text-amber-800">
				Prior room: <strong>Rm {priorStay.roomNumber}</strong>
				· {priorStay.checkInDate} → {priorStay.checkOutDate}
				{#if priorStay.chargesCents > 0}
					· Prior charges: <strong>${(priorStay.chargesCents / 100).toFixed(2)}</strong>
				{:else}
					· <span class="italic">No charges recorded for prior room yet</span>
				{/if}
			</p>
			<p class="text-xs text-amber-700">Set rates below for the remaining nights in this room. Remember to account for both rooms when charging the guest at checkout.</p>
		</div>
	{/if}

	<!-- Header card -->
	<div class="bg-card border-border mb-6 rounded-lg border p-4 shadow-sm">
		<div class="flex items-start justify-between">
			<div>
				<h1 class="text-lg font-bold">
					Check In — Room {room?.roomNumber}
					{#if room?.roomType}
						<span class="text-muted-foreground ml-1 text-sm font-normal">({room.roomType.name})</span>
					{/if}
				</h1>
				<p class="text-muted-foreground text-sm">{property?.name ?? 'Property'}</p>
			</div>
			{#if booking.channel?.name && booking.channel.name !== 'Direct'}
				<span class="bg-amber-100 text-amber-800 rounded px-2 py-0.5 text-xs font-semibold">
					{booking.channel.name}
				</span>
			{/if}
		</div>
		<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
			<span class="font-medium">{guest?.name ?? '—'}</span>
			<span class="text-muted-foreground">
				{formatDate(booking.checkInDate)} → {formatDate(booking.checkOutDate)} · {nights()} night{nights() === 1 ? '' : 's'}
			</span>
		</div>

		<!-- Day grid -->
		<div class="mt-3">
			<div class="mb-1 grid grid-cols-7 gap-0.5 text-center">
				{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as dow}
					<div class="text-muted-foreground text-[10px] font-medium">{dow}</div>
				{/each}
			</div>
			{#each dayGrid() as week}
				<div class="mb-0.5 grid grid-cols-7 gap-0.5 text-center">
					{#each week as cell}
						<div
							class={[
								'rounded py-0.5 text-xs',
								cell.inStay
									? 'bg-teal-500 font-semibold text-white'
									: 'text-muted-foreground'
							].join(' ')}
						>
							{cell.monthDay}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<!-- Main form -->
	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		<!-- Hidden counts for server parsing -->
		<input type="hidden" name="rateCount" value={rateLines.length} />
		<input type="hidden" name="taxCount" value={taxLines.length} />

		<!-- ── Guest Details ─────────────────────────────────────────────── -->
		<section class="mb-6">
			<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Guest Details</h2>

			<!-- Guest rating warning banner -->
			{#if guest?.rating && guest.rating >= 4}
				{@const WARN = [,'','','','⚠ Caution guest — review notes before check-in','⛔ Blocked guest — do not check in without manager approval']}
				{@const CLR = [,'','','','bg-amber-50 border-amber-300 text-amber-800','bg-red-50 border-red-300 text-red-800']}
				<div class="mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium {CLR[guest.rating]}">
					<span>{WARN[guest.rating]}</span>
					{#if guest.ratingNotes}
						<span class="ml-1 font-normal opacity-80">— {guest.ratingNotes}</span>
					{/if}
					<a href="/guests?id={guest.id}" target="_blank" class="ml-auto shrink-0 underline text-xs opacity-70 hover:opacity-100">View profile</a>
				</div>
			{:else if guest?.rating}
				{@const GOOD = [,'★ Excellent guest','★★ Good guest','★★★ Average guest','',''][guest.rating]}
				<div class="mb-3 flex items-center gap-2 rounded-lg border bg-green-50 border-green-200 text-green-800 px-3 py-1.5 text-xs">
					<span class="font-medium">{GOOD}</span>
					{#if guest.ratingNotes}<span class="opacity-70">— {guest.ratingNotes}</span>{/if}
					<a href="/guests?id={guest.id}" target="_blank" class="ml-auto underline opacity-70 hover:opacity-100">profile</a>
				</div>
			{/if}

			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<Label>Name</Label>
					<div class="border-input bg-muted rounded-md border px-3 py-2 text-sm">{guest?.name ?? '—'}</div>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="guestPhone">Phone</Label>
					<Input id="guestPhone" name="guestPhone" type="tel" bind:value={guestPhone} />
				</div>
				<div class="col-span-2 flex flex-col gap-1.5">
					<Label for="guestEmail">Email</Label>
					<Input id="guestEmail" name="guestEmail" type="email" bind:value={guestEmail} />
				</div>
				<div class="col-span-2 flex flex-col gap-1.5">
					<Label for="guestStreet">Street address</Label>
					<Input id="guestStreet" name="guestStreet" bind:value={guestStreet} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="guestCity">City</Label>
					<Input id="guestCity" name="guestCity" bind:value={guestCity} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="guestProvince">Province / State</Label>
					<Input id="guestProvince" name="guestProvince" bind:value={guestProvince} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="guestCountry">Country</Label>
					<Input id="guestCountry" name="guestCountry" bind:value={guestCountry} />
				</div>
			</div>

			<div class="mt-3 grid grid-cols-3 gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="vehicleMake">Vehicle make/model</Label>
					<Input id="vehicleMake" name="vehicleMake" bind:value={vehicleMake} placeholder="e.g. Honda Civic" />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="vehicleColour">Colour</Label>
					<Input id="vehicleColour" name="vehicleColour" bind:value={vehicleColour} />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="vehiclePlate">Plate</Label>
					<Input id="vehiclePlate" name="vehiclePlate" bind:value={vehiclePlate} />
				</div>
			</div>

			<div class="mt-3 grid grid-cols-3 gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="numAdults">Adults</Label>
					<Input id="numAdults" name="numAdults" type="number" min="1" bind:value={numAdults} class="w-20" />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="numChildren">Children</Label>
					<Input id="numChildren" name="numChildren" type="number" min="0" bind:value={numChildren} class="w-20" />
				</div>
				{#if booking.channel?.name && booking.channel.name !== 'Direct'}
					<div class="flex flex-col gap-1.5">
						<Label for="otaRef">OTA confirmation #</Label>
						<Input id="otaRef" name="otaConfirmationNumber" bind:value={otaRef} />
					</div>
				{/if}
			</div>

			<div class="mt-3 flex flex-col gap-1.5">
				<Label for="notes">Notes</Label>
				<textarea
					id="notes"
					name="notes"
					bind:value={notes}
					rows="2"
					class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
				></textarea>
			</div>
		</section>

		<!-- ── Charges ───────────────────────────────────────────────────── -->
		<section class="mb-6">
			<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Charges</h2>

			<!-- Rate lines -->
			<div class="mb-2 space-y-2">
				{#each rateLines as line, i (line.id)}
					<div class="flex items-center gap-2">
						<Input
							name="rate-label-{i}"
							placeholder="e.g. 3 nights @ $129"
							bind:value={line.label}
							class="flex-1"
						/>
						<Input
							name="rate-qty-{i}"
							type="number"
							step="0.5"
							placeholder="Qty"
							bind:value={line.qty}
							oninput={() => recalcRateTotal(line)}
							class="w-16 text-center"
						/>
						<span class="text-muted-foreground text-sm">×</span>
						<Input
							name="rate-unit-{i}"
							type="number"
							step="0.01"
							placeholder="$/unit"
							bind:value={line.unit}
							oninput={() => recalcRateTotal(line)}
							class="w-24"
						/>
						<span class="text-muted-foreground text-sm">=</span>
						<div class="relative w-24">
							<span class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
							<Input
								name="rate-total-{i}"
								type="number"
								step="0.01"
								bind:value={line.total}
								class="pl-6"
							/>
						</div>
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive shrink-0 text-lg leading-none"
							onclick={() => removeRateLine(line.id)}
							aria-label="Remove"
						>×</button>
					</div>
				{/each}
			</div>
			<Button type="button" variant="ghost" size="sm" onclick={addRateLine} class="mb-3 text-xs">
				+ Add rate line
			</Button>

			<!-- Subtotal -->
			<div class="border-border mb-3 flex justify-between border-t pt-2 text-sm">
				<span class="text-muted-foreground">Subtotal</span>
				<span class="font-medium">${fmt(rateSubtotal)}</span>
			</div>

			<!-- Tax lines -->
			<div class="mb-2 space-y-2">
				{#each taxLines as line, i (line.id)}
					<div class="flex items-center gap-2">
						<select
							class="border-input bg-background focus-visible:ring-ring flex-1 rounded-md border px-2 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
							onchange={(e) => applyPreset(line, (e.target as HTMLSelectElement).value)}
						>
							<option value="">Custom tax…</option>
							{#each taxPresets as preset}
								<option value={preset.id} selected={line.presetId === preset.id}>
									{preset.label} ({preset.ratePercent}%)
								</option>
							{/each}
						</select>
						<Input
							name="tax-label-{i}"
							placeholder="Tax label"
							bind:value={line.label}
							class="flex-1"
						/>
						<div class="relative w-24">
							<span class="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
							<Input name="tax-total-{i}" type="number" step="0.01" bind:value={line.total} class="pl-6" />
						</div>
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive shrink-0 text-lg leading-none"
							onclick={() => removeTaxLine(line.id)}
							aria-label="Remove"
						>×</button>
					</div>
				{/each}
			</div>
			<Button type="button" variant="ghost" size="sm" onclick={addTaxLine} class="mb-3 text-xs">
				+ Add tax
			</Button>

		<!-- Grand total & balance summary -->
		<div class="bg-muted/40 border-border rounded-md border p-3 space-y-1.5">
			<div class="flex justify-between text-sm">
				<span class="text-muted-foreground">Subtotal</span>
				<span>${fmt(rateSubtotal)}</span>
			</div>
			{#if taxTotal > 0}
				<div class="flex justify-between text-sm">
					<span class="text-muted-foreground">Taxes</span>
					<span>${fmt(taxTotal)}</span>
				</div>
			{/if}
			<div class="flex justify-between text-sm font-semibold border-t border-border pt-1.5 mt-1">
				<span>Total</span>
				<span>${fmt(grandTotal)}</span>
			</div>

			<!-- Payments received -->
			{#if (booking.paymentEvents ?? []).length > 0}
				<div class="border-t border-border pt-1.5 space-y-1">
					{#each booking.paymentEvents ?? [] as pe}
						<div class="flex justify-between text-xs text-green-700">
							<span class="flex items-center gap-1">
								<span class="font-medium">✓ Paid</span>
								<span class="text-muted-foreground capitalize">({pe.paymentMethod})</span>
								{#if pe.chargedAt}
									<span class="text-muted-foreground">{new Date(pe.chargedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
								{/if}
							</span>
							<span class="font-mono font-medium">${fmt(pe.amount / 100)}</span>
						</div>
					{/each}
				</div>
				<div class="flex justify-between text-sm font-bold border-t border-border pt-1.5">
					<span class={balanceDue <= 0 ? 'text-green-700' : ''}>
						{balanceDue <= 0 ? '✓ Paid in full' : 'Balance due'}
					</span>
					<span class={balanceDue <= 0 ? 'text-green-700' : ''}>${fmt(balanceDue)}</span>
				</div>
			{/if}
		</div>
	</section>

	<!-- ── Payment ───────────────────────────────────────────────────── -->
	<section class="mb-6">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
			{(booking.paymentEvents ?? []).length > 0 ? 'Record additional payment' : 'Collect payment'}
		</h2>

		{#if balanceDue <= 0 && (booking.paymentEvents ?? []).length > 0}
			<p class="text-green-700 text-sm">Booking is paid in full. Record an additional payment if needed.</p>
		{/if}

		<div class="flex flex-wrap items-center gap-3 mt-2">
			<div class="relative">
				<span class="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
				<input
					name="paymentAmount"
					type="number"
					min="0"
					step="0.01"
					bind:value={paymentAmount}
					placeholder="0.00"
					class="border-input bg-background rounded-md border pl-6 pr-3 py-2 text-sm w-28 shadow-sm"
				/>
			</div>
			<span class="text-muted-foreground text-sm">via</span>
			{#each ['card', 'cash', 'cheque'] as method}
				<button
					type="button"
					class={[
						'rounded-md border px-3 py-1.5 text-sm capitalize transition-colors',
						paymentMethod === method
							? 'bg-primary text-primary-foreground border-primary'
							: 'border-border hover:bg-muted'
					].join(' ')}
					onclick={() => (paymentMethod = method)}
				>{method}</button>
			{/each}
			<input type="hidden" name="paymentMethod" value={paymentMethod} />
		</div>
		<p class="text-muted-foreground mt-1.5 text-xs">Leave amount as 0 to save without recording a payment.</p>
	</section>

		<!-- Submit -->
		<div class="flex items-center justify-between">
			<a href={backHref()}>
				<Button type="button" variant="ghost">Cancel</Button>
			</a>
			<Button type="submit" disabled={submitting} class="min-w-32">
				{submitting ? 'Saving…' : booking.status === 'checked_in' ? 'Update' : 'Check In →'}
			</Button>
		</div>
	</form>
</div>
