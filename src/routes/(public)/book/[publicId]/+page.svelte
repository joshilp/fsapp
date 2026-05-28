<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import type { AvailableRoomType } from '$routes/api/public/availability/+server';
	import type { PublicPricing } from '$routes/api/public/pricing/+server';
	import BookingCalendar from '$lib/components/booking/BookingCalendar.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const property = data.property;
	const accent = property.accentColour ?? '#d97706'; // amber-600 fallback

	type Step = 1 | 2 | 3;
	let step = $state<Step>(1);

	// ─── Step 1: Dates ─────────────────────────────────────────────────────────
	function advanceDay(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}
	let checkIn  = $state(data.today);
	let checkOut = $state(advanceDay(data.today));
	let step1Error = $state('');

	// If a room type was pre-selected, start on the dates step but note it
	// so we skip room selection after dates are confirmed.
	const deepLinked = !!data.preselectedRoomTypeId;

	const nights = $derived(
		Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
	);

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	// ─── Step 2: Room Type ─────────────────────────────────────────────────────
	let selectedTypeId      = $state(data.preselectedRoomTypeId ?? '');
	let availableTypes      = $state<AvailableRoomType[]>([]);
	let availabilityLoading = $state(false);
	let availabilityError   = $state('');

	const selectedType = $derived(availableTypes.find(rt => rt.id === selectedTypeId) ?? null);

	async function loadAvailability() {
		availabilityLoading = true;
		availabilityError = '';
		availableTypes = [];
		try {
			const res = await fetch(`/api/public/availability?propertyId=${property.id}&checkIn=${checkIn}&checkOut=${checkOut}`);
			if (res.ok) availableTypes = await res.json();
			else availabilityError = 'Could not load availability. Please try again.';
		} catch {
			availabilityError = 'Network error. Please try again.';
		}
		availabilityLoading = false;
	}

	function validateStep1() {
		if (checkIn < data.today) { step1Error = 'Check-in must be today or later.'; return false; }
		if (checkOut <= checkIn)  { step1Error = 'Check-out must be after check-in.'; return false; }
		step1Error = '';
		return true;
	}

	function goToStep2() {
		if (!validateStep1()) return;
		if (deepLinked) {
			// Pre-selected room type — skip room picker, go straight to confirm
			step = 3;
			fetchRate();
		} else {
			selectedTypeId = '';
			step = 2;
			loadAvailability();
		}
	}

	function bedLabel(rt: AvailableRoomType): string {
		if (!rt.beds) return '';
		const parts: string[] = [];
		if (rt.beds.kingBeds)   parts.push(`${rt.beds.kingBeds}K`);
		if (rt.beds.queenBeds)  parts.push(`${rt.beds.queenBeds}Q`);
		if (rt.beds.doubleBeds) parts.push(`${rt.beds.doubleBeds}D`);
		if (rt.beds.hasHideabed) parts.push('HB');
		if (rt.beds.hasKitchen)  parts.push('Kitchen');
		return parts.join(' · ');
	}

	// ─── Step 3: Guest details + confirm + rate quote ─────────────────────────
	let guestName   = $state('');
	let guestEmail  = $state('');
	let guestPhone  = $state('');
	let numAdults   = $state(2);
	let numChildren = $state(0);
	let guestNotes  = $state('');
	let submitting  = $state(false);
	// Guard: only redirect after the form was actually submitted in this session.
	// Without this, a stale form action result from browser history can trigger
	// the goto() prematurely when SvelteKit restores client-side page state.
	let formSubmittedThisSession = $state(false);

	let rateQuote   = $state<PublicPricing | null>(null);
	let rateLoading = $state(false);

	let promoInput   = $state('');
	let promoChecking = $state(false);

	async function fetchRate() {
		if (!selectedTypeId) return;
		rateLoading = true;
		rateQuote = null;
		try {
			const promoParam  = promoInput.trim() ? `&promo=${encodeURIComponent(promoInput.trim())}` : '';
			const guestsParam = `&numGuests=${numAdults + numChildren}`;
			const res = await fetch(`/api/public/pricing?roomTypeId=${selectedTypeId}&checkIn=${checkIn}&checkOut=${checkOut}${promoParam}${guestsParam}`);
			if (res.ok) rateQuote = await res.json();
		} catch { /* ignore */ }
		rateLoading = false;
	}

	// Re-fetch rate when guest count changes (extra guest fee may apply)
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		numAdults; numChildren;
		if (step === 3 && selectedTypeId) fetchRate();
	});

	async function applyPromo() {
		promoChecking = true;
		await fetchRate();
		promoChecking = false;
	}

	function goToStep3() {
		if (!selectedTypeId) return;
		step = 3;
		fetchRate();
	}

	function fmt(cents: number) { return '$' + (cents / 100).toFixed(2); }

	const categoryImages: Record<string, string> = {
		A: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=75',
		B: 'https://images.unsplash.com/photo-1631049421450-348ccd7f8949?w=600&q=75',
		C: 'https://images.unsplash.com/photo-1564078516393-cf04bd966897?w=600&q=75',
		D: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600&q=75'
	};

	$effect(() => {
		if (formSubmittedThisSession && form?.success && form.token) {
			goto(`/book/confirmation/${form.token}`);
		}
	});
</script>

<svelte:head>
	<title>Book a Room — {property.name}</title>
</svelte:head>

<!-- Property header — white bar with accent top-line -->
<div class="w-full border-b border-border bg-white" style="border-top: 3px solid {accent}">
	<div class="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
		{#if property.logoUrl}
			<img src={property.logoUrl} alt={property.name} class="h-10 w-auto max-w-[130px] object-contain" />
		{:else}
			<span class="text-base font-bold text-foreground">{property.name}</span>
		{/if}
		<div class="flex-1 min-w-0">
			{#if property.logoUrl}
				<p class="text-sm font-semibold text-foreground leading-tight truncate">{property.name}</p>
			{/if}
			{#if property.city || property.province}
				<p class="text-xs text-muted-foreground">{[property.city, property.province].filter(Boolean).join(', ')}{#if property.phone} · <a href="tel:{property.phone}" class="hover:underline">{property.phone}</a>{/if}</p>
			{/if}
		</div>
		{#if property.bookingDescription}
			<p class="hidden sm:block text-xs text-muted-foreground max-w-xs text-right">{property.bookingDescription}</p>
		{/if}
	</div>
</div>

<div class="min-h-screen bg-stone-50 py-8 px-4">
	<div class="mx-auto max-w-xl">

		<!-- Progress bar (3 steps) -->
		<div class="mb-6 flex items-center gap-0">
			{#each [['1', 'Dates'], ['2', 'Room'], ['3', 'Confirm']] as [n, label], i}
				<div class="flex items-center flex-1 {i < 2 ? 'pr-2' : ''}">
					<div class="flex flex-col items-center flex-1">
						<div class={[
							'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
							parseInt(n) < step ? 'bg-green-500 text-white' : parseInt(n) === step ? 'text-white' : 'bg-stone-200 text-stone-400'
						].join(' ')} style={parseInt(n) === step ? `background-color:${accent}` : ''}>
							{parseInt(n) < step ? '✓' : n}
						</div>
						<span class="mt-1 text-[10px] text-stone-400 hidden sm:block">{label}</span>
					</div>
					{#if i < 2}
						<div class="h-0.5 flex-1 {parseInt(n) < step ? 'bg-green-400' : 'bg-stone-200'} mx-1 mb-4 sm:mb-0"></div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8">

		<!-- ── Step 1: Dates ─────────────────────────────────────────────── -->
		{#if step === 1}
			<h2 class="text-lg font-semibold text-stone-900 mb-5">Choose your dates</h2>

			<BookingCalendar
				{propertyId}
				{today}
				{accent}
				bind:checkIn
				bind:checkOut
			/>

			{#if nights > 0}
				<p class="text-sm text-stone-500 mt-4 mb-4">{nights} night{nights === 1 ? '' : 's'} · {fmtDate(checkIn)} → {fmtDate(checkOut)}</p>
			{/if}

				{#if property.cancellationPolicy}
					<div class="rounded-xl bg-stone-50 border border-stone-100 px-4 py-3 text-xs text-stone-500 mb-5">
						<p class="font-medium text-stone-700 mb-0.5">Cancellation Policy</p>
						{property.cancellationPolicy}
					</div>
				{/if}

				{#if step1Error}
					<p class="text-red-600 text-sm mb-3">{step1Error}</p>
				{/if}

				<button type="button" onclick={goToStep2}
					class="w-full rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity"
					style="background-color:{accent}">
					See Available Rooms →
				</button>

			<!-- ── Step 2: Room Type ───────────────────────────────────────────── -->
			{:else if step === 2}
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-semibold text-stone-900">Choose a room</h2>
					<button onclick={() => { step = 1; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
				</div>

				<div class="rounded-xl bg-stone-50 border border-stone-100 px-4 py-2.5 text-sm text-stone-600 mb-5">
					{fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights} night{nights === 1 ? '' : 's'}
				</div>

				{#if availabilityLoading}
					<div class="text-center py-10 text-stone-400 text-sm">Checking availability…</div>
				{:else if availabilityError}
					<p class="text-red-600 text-sm mb-3">{availabilityError}</p>
					<button onclick={loadAvailability} class="text-sm hover:underline" style="color:{accent}">Retry</button>
				{:else if availableTypes.length === 0}
					<div class="text-center py-10 text-stone-500">
						<p class="font-medium">No rooms available for those dates.</p>
						<p class="text-sm mt-1">Please try different dates.</p>
						<button onclick={() => { step = 1; }} class="mt-4 text-sm hover:underline" style="color:{accent}">← Change dates</button>
					</div>
				{:else}
				<div class="space-y-3">
					{#each availableTypes as rt}
						{@const totalNights = nights}
						{@const totalPrice = rt.minRateCents ? rt.minRateCents * totalNights : null}
						{@const photo = rt.imageUrl ?? categoryImages[rt.category] ?? categoryImages['A']}
						<button
							type="button"
							onclick={() => { selectedTypeId = rt.id; }}
							class="w-full rounded-xl border-2 overflow-hidden text-left transition-all flex"
							style={selectedTypeId === rt.id ? `border-color:${accent}; background-color:${accent}18` : 'border-color:#e7e5e4'}
						>
							<img src={photo} alt={rt.name} class="w-28 sm:w-36 object-cover shrink-0" />
							<div class="p-4 flex-1 min-w-0">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<p class="font-semibold text-stone-900">{rt.name}</p>
										<!-- Bed config + amenities row -->
										<div class="flex flex-wrap items-center gap-1.5 mt-1">
											{#if bedLabel(rt)}
												<span class="text-stone-500 text-xs">{bedLabel(rt)}</span>
											{/if}
											{#if rt.beds?.hasKitchen}
												<span class="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5">Kitchen</span>
											{/if}
											{#if rt.maxOccupancy}
												<span class="text-[10px] bg-stone-100 text-stone-600 rounded-full px-2 py-0.5">Sleeps {rt.maxOccupancy}</span>
											{/if}
										</div>
										{#if rt.description}
											<p class="text-stone-500 text-xs mt-1.5 line-clamp-2">{rt.description}</p>
										{/if}
									</div>
									<div class="text-right shrink-0">
										{#if rt.minRateCents}
											<p class="text-xs text-stone-400">from</p>
											<p class="text-lg font-bold text-stone-900">${(rt.minRateCents / 100).toFixed(0)}</p>
											<p class="text-xs text-stone-400">/night</p>
											{#if totalNights > 1 && totalPrice}
												<p class="text-xs text-stone-500 mt-0.5 font-medium">{fmt(totalPrice)} est.</p>
											{/if}
										{/if}
										<p class="text-xs text-stone-400 mt-1">{rt.availableCount} avail.</p>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>

					<button type="button" onclick={goToStep3} disabled={!selectedTypeId}
						class="mt-5 w-full rounded-xl py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
						style="background-color:{accent}">
						Continue →
					</button>
				{/if}

		<!-- ── Step 3: Guest Details + Confirm ────────────────────────────── -->
		{:else if step === 3}
			<div class="flex items-center justify-between mb-5">
				<h2 class="text-lg font-semibold text-stone-900">Your details</h2>
				<button onclick={() => { step = deepLinked ? 1 : 2; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
			</div>

			<!-- Mini summary -->
			{#if selectedType}
				{@const photo = selectedType.imageUrl ?? categoryImages[selectedType.category] ?? categoryImages['A']}
				<div class="rounded-xl border px-4 py-3 text-sm mb-5 flex items-center gap-3" style="border-color:{accent}40; background-color:{accent}0D">
					<img src={photo} alt="" class="h-12 w-16 rounded-lg object-cover shrink-0" />
					<div class="min-w-0">
						<p class="font-semibold text-stone-900">{selectedType.name}</p>
						<p class="text-stone-500 text-xs">{fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights}n</p>
						{#if rateQuote}
							<p class="text-xs font-semibold mt-0.5" style="color:{accent}">Est. {fmt(rateQuote.totalAfterDiscountsCents)} total (before tax)</p>
						{:else if rateLoading}
							<p class="text-stone-400 text-xs">Calculating rate…</p>
						{/if}
					</div>
				</div>
			{/if}

				<div class="space-y-4 mb-5">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gName">Full name *</label>
							<input id="gName" type="text" bind:value={guestName} placeholder="Jane Smith" required
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
						</div>
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gPhone">Phone</label>
							<input id="gPhone" type="tel" bind:value={guestPhone} placeholder="+1 555 000 0000"
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gEmail">Email address *</label>
						<input id="gEmail" type="email" bind:value={guestEmail} placeholder="jane@example.com" required
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2" />
						<p class="text-xs text-stone-400 mt-1">Confirmation will be sent here.</p>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="adults">Adults</label>
							<select id="adults" bind:value={numAdults}
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2">
								{#each [1,2,3,4,5,6] as n}<option value={n}>{n}</option>{/each}
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="children">Children</label>
							<select id="children" bind:value={numChildren}
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2">
								{#each [0,1,2,3,4] as n}<option value={n}>{n}</option>{/each}
							</select>
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="notes">Special requests (optional)</label>
						<textarea id="notes" bind:value={guestNotes} rows="3" placeholder="Ground floor preferred, early arrival, allergies…"
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2"></textarea>
					</div>
				</div>

			<!-- Rate breakdown + promo code -->
			{#if rateQuote && rateQuote.lines.length > 0}
				<div class="rounded-xl bg-stone-50 border border-stone-100 px-4 py-3 mb-5 text-sm">
					<p class="text-xs text-stone-400 mb-2">Estimated rate breakdown</p>
				{#each rateQuote.lines as line}
					<div class="flex justify-between text-stone-600">
						<span>{line.nights}n × ${(line.unitCents/100).toFixed(0)}/night</span>
						<span class="font-medium">{fmt(line.totalCents)}</span>
					</div>
				{/each}
				<div class="mt-2 pt-2 border-t border-stone-100 flex justify-between text-stone-700">
					<span>Subtotal</span>
					<span>{fmt(rateQuote.subtotalCents)}</span>
				</div>
				{#if rateQuote.extraGuestTotalCents > 0}
					<div class="flex justify-between text-stone-600 text-xs mt-1">
						<span>Extra guest fee (+{(numAdults + numChildren) - 2} guest{(numAdults + numChildren) > 3 ? 's' : ''}, {rateQuote.extraGuestNights}n)</span>
						<span>+{fmt(rateQuote.extraGuestTotalCents)}</span>
					</div>
				{/if}
					{#if rateQuote.losDiscount}
						<div class="flex justify-between text-green-700 text-xs mt-1">
							<span>🏷 {rateQuote.losDiscount.label} ({rateQuote.losDiscount.discountPercent}% off)</span>
							<span>−{fmt(rateQuote.losDiscountCents)}</span>
						</div>
					{/if}
					{#if rateQuote.promo}
						<div class="flex justify-between text-green-700 text-xs mt-1">
							<span>🎟 Promo: {rateQuote.promo.code}</span>
							<span>−{fmt(rateQuote.promoDiscountCents)}</span>
						</div>
					{/if}
					<div class="mt-2 pt-2 border-t border-stone-200 flex justify-between font-semibold text-stone-900">
						<span>Total (before tax)</span>
						<span>{fmt(rateQuote.totalAfterDiscountsCents)}</span>
					</div>
					{#if rateQuote.minNightWarning}
						<p class="text-xs text-amber-600 mt-1">⚠ {rateQuote.minNightWarning}</p>
					{/if}
				</div>

				<!-- Promo code -->
				<div class="mb-5">
					<p class="text-xs font-medium text-stone-600 mb-1.5">Have a promo code?</p>
					<div class="flex gap-2">
						<input type="text" bind:value={promoInput} placeholder="e.g. SUMMER10"
							class="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2"
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }} />
						<button type="button" onclick={applyPromo} disabled={promoChecking || !promoInput.trim()}
							class="rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40 transition-colors">
							{promoChecking ? '…' : 'Apply'}
						</button>
					</div>
					{#if promoInput.trim() && rateQuote && !rateQuote.promo}
						<p class="text-xs text-red-500 mt-1">Code not valid or expired.</p>
					{:else if rateQuote?.promo}
						<p class="text-xs text-green-600 mt-1">✓ {rateQuote.promo.label} applied.</p>
					{/if}
				</div>
			{/if}

				<!-- Notice -->
				<div class="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 mb-5 space-y-1">
					<p class="font-semibold">Before you confirm</p>
					<p>• Payment is due upon arrival — no charges are taken now.</p>
					<p>• Room assignment is confirmed by our team before your arrival.</p>
					{#if property.cancellationPolicy}
						<p>• {property.cancellationPolicy}</p>
					{/if}
				</div>

				{#if form?.error}
					<p class="text-red-600 text-sm mb-3 rounded-lg bg-red-50 border border-red-100 px-4 py-2">{form.error}</p>
				{/if}

				<form method="POST" action="?/book" use:enhance={() => {
					submitting = true;
					formSubmittedThisSession = true;
					return async ({ update }) => { await update(); submitting = false; };
				}}>
					<input type="hidden" name="propertyId" value={property.id} />
					<input type="hidden" name="roomTypeId" value={selectedTypeId} />
					<input type="hidden" name="checkIn"    value={checkIn} />
					<input type="hidden" name="checkOut"   value={checkOut} />
					<input type="hidden" name="guestName"  value={guestName} />
					<input type="hidden" name="guestEmail" value={guestEmail} />
					<input type="hidden" name="guestPhone" value={guestPhone} />
					<input type="hidden" name="numAdults"   value={numAdults} />
					<input type="hidden" name="numChildren" value={numChildren} />
					<input type="hidden" name="notes"       value={guestNotes} />
				{#if rateQuote && rateQuote.totalAfterDiscountsCents > 0}
					<input type="hidden" name="quotedTotalCents" value={rateQuote.totalAfterDiscountsCents} />
					<input type="hidden" name="quotedNights"     value={nights} />
					{#if rateQuote.promo}
						<input type="hidden" name="promoCodeId" value={rateQuote.promo.id} />
					{/if}
					{/if}

					<button type="submit" disabled={submitting || !guestName.trim() || !guestEmail.trim()}
						class="w-full rounded-xl py-4 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
						style="background-color:{accent}">
						{submitting ? 'Submitting…' : '✓ Confirm Reservation'}
					</button>
				</form>
			{/if}
		</div>

		<!-- Trust signals -->
		<div class="mt-6 flex flex-wrap justify-center gap-6 text-xs text-stone-400">
			<span>🔒 Secure reservation</span>
			<span>💳 Pay at check-in — no charge now</span>
			{#if property.phone}
				<span>📞 {property.phone}</span>
			{/if}
		</div>

		<p class="mt-4 text-center text-[10px] text-stone-300">Powered by Rezzzo</p>
	</div>
</div>
