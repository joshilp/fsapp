<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import type { AvailableRoomType } from '$routes/api/public/availability/+server';
	import type { PublicPricing } from '$routes/api/public/pricing/+server';

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

	const nights = $derived(
		Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
	);

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	// ─── Step 2: Room Type ─────────────────────────────────────────────────────
	let selectedTypeId      = $state('');
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
		selectedTypeId = '';
		step = 2;
		loadAvailability();
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

	let rateQuote   = $state<PublicPricing | null>(null);
	let rateLoading = $state(false);

	async function fetchRate() {
		if (!selectedTypeId) return;
		rateLoading = true;
		rateQuote = null;
		try {
			const res = await fetch(`/api/public/pricing?roomTypeId=${selectedTypeId}&checkIn=${checkIn}&checkOut=${checkOut}`);
			if (res.ok) rateQuote = await res.json();
		} catch { /* ignore */ }
		rateLoading = false;
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
		if (form?.success && form.token) {
			goto(`/book/confirmation/${form.token}`);
		}
	});
</script>

<svelte:head>
	<title>Book a Room — {property.name}</title>
</svelte:head>

<!-- Property hero header -->
<div class="relative w-full overflow-hidden" style="background-color: {accent}">
	{#if property.heroImageUrl}
		<img src={property.heroImageUrl} alt={property.name} class="absolute inset-0 w-full h-full object-cover opacity-30" />
	{/if}
	<div class="relative z-10 mx-auto max-w-2xl px-4 py-10 text-center">
		{#if property.logoUrl}
			<img src={property.logoUrl} alt={property.name} class="mx-auto mb-3 h-16 w-auto object-contain drop-shadow" />
		{:else}
			<p class="text-2xl font-bold text-white drop-shadow mb-1">{property.name}</p>
		{/if}
		{#if property.bookingDescription}
			<p class="text-white/90 text-sm mt-2 max-w-md mx-auto">{property.bookingDescription}</p>
		{/if}
		<p class="text-white/70 text-xs mt-1">
			{property.city}, {property.province}
			{#if property.phone} · {property.phone}{/if}
		</p>
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

				<div class="grid grid-cols-2 gap-4 mb-6">
					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="ci">Check-in</label>
						<input id="ci" type="date"
							bind:value={checkIn}
							min={data.today}
							oninput={() => { if (checkOut <= checkIn) checkOut = advanceDay(checkIn); }}
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="co">Check-out</label>
						<input id="co" type="date"
							bind:value={checkOut}
							min={advanceDay(checkIn)}
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
						/>
					</div>
				</div>

				{#if nights > 0}
					<p class="text-sm text-stone-500 mb-4">{nights} night{nights === 1 ? '' : 's'} · {fmtDate(checkIn)} → {fmtDate(checkOut)}</p>
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
							<button
								type="button"
								onclick={() => { selectedTypeId = rt.id; }}
								class="w-full rounded-xl border-2 overflow-hidden text-left transition-all flex"
								style={selectedTypeId === rt.id ? `border-color:${accent}; background-color:${accent}18` : 'border-color:#e7e5e4'}
							>
								<img src={categoryImages[rt.category] ?? categoryImages['A']} alt={rt.name} class="w-24 sm:w-32 object-cover shrink-0" />
								<div class="p-4 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div>
											<p class="font-semibold text-stone-900">{rt.name}</p>
											{#if bedLabel(rt)}
												<p class="text-stone-500 text-xs mt-0.5">{bedLabel(rt)}</p>
											{/if}
											{#if rt.beds?.hasKitchen}
												<span class="mt-2 inline-block text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5">Kitchen</span>
											{/if}
										</div>
										<div class="text-right shrink-0">
											{#if rt.minRateCents}
												<p class="text-xs text-stone-400">from</p>
												<p class="text-lg font-bold text-stone-900">${(rt.minRateCents / 100).toFixed(0)}</p>
												<p class="text-xs text-stone-400">/night</p>
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
					<button onclick={() => { step = 2; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
				</div>

				<!-- Mini summary -->
				{#if selectedType}
					<div class="rounded-xl border px-4 py-3 text-sm mb-5 flex items-center gap-3" style="border-color:{accent}40; background-color:{accent}0D">
						<img src={categoryImages[selectedType.category] ?? categoryImages['A']} alt="" class="h-12 w-16 rounded-lg object-cover shrink-0" />
						<div class="min-w-0">
							<p class="font-semibold text-stone-900">{selectedType.name}</p>
							<p class="text-stone-500 text-xs">{fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights}n</p>
							{#if rateQuote}
								<p class="text-xs font-semibold mt-0.5" style="color:{accent}">Est. {fmt(rateQuote.subtotalCents)} total (before tax)</p>
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

				<!-- Rate breakdown -->
				{#if rateQuote && rateQuote.lines.length > 0}
					<div class="rounded-xl bg-stone-50 border border-stone-100 px-4 py-3 mb-5 text-sm">
						<p class="text-xs text-stone-400 mb-2">Estimated rate breakdown</p>
						{#each rateQuote.lines as line}
							<div class="flex justify-between text-stone-600">
								<span>{line.nights}n × ${(line.unitCents/100).toFixed(0)}/night</span>
								<span class="font-medium">{fmt(line.totalCents)}</span>
							</div>
						{/each}
						<div class="mt-2 pt-2 border-t border-stone-100 flex justify-between font-semibold text-stone-900">
							<span>Subtotal (before tax)</span>
							<span>{fmt(rateQuote.subtotalCents)}</span>
						</div>
						{#if rateQuote.minNightWarning}
							<p class="text-xs text-amber-600 mt-1">⚠ {rateQuote.minNightWarning}</p>
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
					{#if rateQuote && rateQuote.subtotalCents > 0}
						<input type="hidden" name="quotedTotalCents" value={rateQuote.subtotalCents} />
						<input type="hidden" name="quotedNights"     value={nights} />
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
