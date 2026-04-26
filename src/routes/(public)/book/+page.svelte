<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Step = 1 | 2 | 3 | 4;
	let step = $state<Step>(1);

	// ─── Step 1: Property + Dates ──────────────────────────────────────────────
	let selectedPropertyId = $state(
		new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost/book').searchParams.get('property') ?? data.properties[0]?.id ?? ''
	);

	function initDates() {
		const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
		const ci = params.get('checkIn');
		const co = params.get('checkOut');
		return { ci: ci ?? data.today, co: co ?? advanceDay(ci ?? data.today) };
	}
	const initD = initDates();
	let checkIn = $state(initD.ci);
	let checkOut = $state(initD.co);
	let step1Error = $state('');

	function advanceDay(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	const nights = $derived(
		Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
	);

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function validateStep1() {
		if (!selectedPropertyId) { step1Error = 'Please select a property.'; return false; }
		if (checkIn < data.today) { step1Error = 'Check-in must be today or later.'; return false; }
		if (checkOut <= checkIn) { step1Error = 'Check-out must be after check-in.'; return false; }
		step1Error = '';
		return true;
	}

	// ─── Step 2: Room type ─────────────────────────────────────────────────────
	let selectedTypeId = $state('');

	const availableTypesForProperty = $derived(
		data.roomTypes
			.filter(rt => rt.propertyId === selectedPropertyId)
			.map(rt => {
				// Check availability: rooms of this type for this property minus conflicted
				const propRooms = data.allRooms.filter(r => r.propertyId === selectedPropertyId && r.roomTypeId === rt.id);
				const minRate = data.minRateByType[rt.id] ?? null;
				return { ...rt, roomCount: propRooms.length, minRateCents: minRate, beds: propRooms[0] ?? null };
			})
			.filter(rt => rt.roomCount > 0)
	);

	function bedLabel(rt: typeof availableTypesForProperty[0]): string {
		if (!rt.beds) return '';
		const parts: string[] = [];
		if (rt.beds.kingBeds) parts.push(`${rt.beds.kingBeds}K`);
		if (rt.beds.queenBeds) parts.push(`${rt.beds.queenBeds}Q`);
		if (rt.beds.doubleBeds) parts.push(`${rt.beds.doubleBeds}D`);
		if (rt.beds.hasHideabed) parts.push('HB');
		if (rt.beds.hasKitchen) parts.push('Kit');
		return parts.join(' · ');
	}

	const selectedType = $derived(availableTypesForProperty.find(rt => rt.id === selectedTypeId) ?? null);
	const selectedProperty = $derived(data.properties.find(p => p.id === selectedPropertyId) ?? null);

	// Rate fetch for selected type
	let rateQuote = $state<{ subtotalCents: number; lines: { nights: number; unitCents: number; totalCents: number; colour: string; seasonName: string }[] } | null>(null);
	let rateLoading = $state(false);

	async function fetchRate() {
		if (!selectedTypeId || !checkIn || !checkOut || checkIn >= checkOut) return;
		rateLoading = true;
		rateQuote = null;
		try {
			// Find a representative room of this type to get pricing
			const repRoom = data.allRooms.find(r => r.roomTypeId === selectedTypeId && r.propertyId === selectedPropertyId);
			if (!repRoom) return;
			const res = await fetch(`/api/pricing/suggest?roomId=${repRoom.id}&checkIn=${checkIn}&checkOut=${checkOut}`);
			if (res.ok) rateQuote = await res.json();
		} catch { /* ignore */ }
		rateLoading = false;
	}

	$effect(() => {
		if (step === 3 && selectedTypeId) fetchRate();
	});

	// ─── Step 3: Guest details ─────────────────────────────────────────────────
	let guestName = $state('');
	let guestEmail = $state('');
	let guestPhone = $state('');
	let numAdults = $state(2);
	let numChildren = $state(0);
	let guestNotes = $state('');

	// ─── Step 4: Submit ────────────────────────────────────────────────────────
	let submitting = $state(false);

	function fmt(cents: number) { return '$' + (cents / 100).toFixed(2); }

	// Category images matching homepage
	const categoryImages: Record<string, string> = {
		A: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=600&q=75',
		B: 'https://images.unsplash.com/photo-1631049421450-348ccd7f8949?w=600&q=75',
		C: 'https://images.unsplash.com/photo-1564078516393-cf04bd966897?w=600&q=75',
		D: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600&q=75'
	};

	// After form submission redirect to confirmation
	$effect(() => {
		if (form?.success && form.token) {
			goto(`/book/confirmation/${form.token}`);
		}
	});
</script>

<svelte:head>
	<title>Book a Room — Falcon &amp; Spanish Fiesta Motels</title>
</svelte:head>

<div class="min-h-screen bg-stone-50 py-10 px-4">
	<div class="mx-auto max-w-2xl">

		<!-- Header -->
		<div class="mb-8 text-center">
			<a href="/" class="text-sm text-stone-500 hover:text-stone-700">← Back to website</a>
			<h1 class="mt-3 text-2xl font-bold text-stone-900">Reserve a Room</h1>
		</div>

		<!-- Progress bar -->
		<div class="mb-8 flex items-center gap-0">
			{#each [['1', 'Dates'], ['2', 'Room Type'], ['3', 'Your Details'], ['4', 'Confirm']] as [n, label], i}
				<div class="flex items-center flex-1 {i < 3 ? 'pr-2' : ''}">
					<div class="flex flex-col items-center flex-1">
						<div class={[
							'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
							parseInt(n) < step ? 'bg-green-500 text-white' :
							parseInt(n) === step ? 'bg-amber-500 text-stone-900' :
							'bg-stone-200 text-stone-400'
						].join(' ')}>
							{parseInt(n) < step ? '✓' : n}
						</div>
						<span class="mt-1 text-[10px] text-stone-400 hidden sm:block">{label}</span>
					</div>
					{#if i < 3}
						<div class="h-0.5 flex-1 {parseInt(n) < step ? 'bg-green-400' : 'bg-stone-200'} mx-1 mb-4 sm:mb-0"></div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 sm:p-8">

			<!-- ── Step 1: Property + Dates ───────────────────────────────────── -->
			{#if step === 1}
				<h2 class="text-lg font-semibold text-stone-900 mb-5">Choose your dates</h2>

				<!-- Property selector -->
				<div class="mb-5">
					<p class="text-sm font-medium text-stone-700 mb-2">Property</p>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each data.properties as prop}
							<button
								type="button"
								onclick={() => { selectedPropertyId = prop.id; selectedTypeId = ''; }}
								class={[
									'rounded-xl border-2 p-4 text-left transition-all',
									selectedPropertyId === prop.id
										? 'border-amber-500 bg-amber-50'
										: 'border-stone-200 hover:border-stone-300'
								].join(' ')}
							>
								<p class="font-semibold text-stone-900 text-sm">{prop.name}</p>
								<p class="text-stone-500 text-xs mt-0.5">British Columbia, Canada</p>
							</button>
						{/each}
					</div>
				</div>

				<!-- Dates -->
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

				{#if step1Error}
					<p class="text-red-600 text-sm mb-3">{step1Error}</p>
				{/if}

				<button
					type="button"
					onclick={() => { if (validateStep1()) step = 2; }}
					class="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors"
				>
					See Available Rooms →
				</button>

			<!-- ── Step 2: Room Type ───────────────────────────────────────────── -->
			{:else if step === 2}
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-semibold text-stone-900">Choose a room type</h2>
					<button onclick={() => { step = 1; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
				</div>

				<div class="rounded-xl bg-stone-50 border border-stone-100 px-4 py-2.5 text-sm text-stone-600 mb-5">
					<strong>{selectedProperty?.name}</strong> · {fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights}n
				</div>

				{#if availableTypesForProperty.length === 0}
					<div class="text-center py-10 text-stone-500">
						<p class="font-medium">No rooms available for those dates.</p>
						<p class="text-sm mt-1">Try different dates or the other property.</p>
						<button onclick={() => { step = 1; }} class="mt-4 text-sm text-amber-600 hover:underline">← Change dates</button>
					</div>
				{:else}
					<div class="space-y-3">
						{#each availableTypesForProperty as rt}
							<button
								type="button"
								onclick={() => { selectedTypeId = rt.id; }}
								class={[
									'w-full rounded-xl border-2 overflow-hidden text-left transition-all flex',
									selectedTypeId === rt.id
										? 'border-amber-500 bg-amber-50'
										: 'border-stone-200 hover:border-stone-300 bg-white'
								].join(' ')}
							>
								<img
									src={categoryImages[rt.category] ?? categoryImages['A']}
									alt={rt.name}
									class="w-24 sm:w-32 h-full object-cover shrink-0"
								/>
								<div class="p-4 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div>
											<p class="font-semibold text-stone-900">{rt.name}</p>
											{#if bedLabel(rt)}
												<p class="text-stone-500 text-xs mt-0.5">{bedLabel(rt)}</p>
											{/if}
											<div class="flex flex-wrap gap-1 mt-2">
												{#if rt.beds?.hasKitchen}
													<span class="text-[10px] bg-green-100 text-green-700 rounded-full px-2 py-0.5">Kitchen</span>
												{/if}
												{#if (rt.beds?.numRooms ?? 0) > 1}
													<span class="text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">{rt.beds?.numRooms} Bedrooms</span>
												{/if}
											</div>
										</div>
										<div class="text-right shrink-0">
											{#if rt.minRateCents}
												<p class="text-xs text-stone-400">from</p>
												<p class="text-lg font-bold text-stone-900">${(rt.minRateCents / 100).toFixed(0)}</p>
												<p class="text-xs text-stone-400">/night</p>
											{/if}
										</div>
									</div>
								</div>
							</button>
						{/each}
					</div>

					<button
						type="button"
						onclick={() => { if (selectedTypeId) step = 3; }}
						disabled={!selectedTypeId}
						class="mt-5 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						Continue →
					</button>
				{/if}

			<!-- ── Step 3: Guest Details ───────────────────────────────────────── -->
			{:else if step === 3}
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-semibold text-stone-900">Your details</h2>
					<button onclick={() => { step = 2; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
				</div>

				<!-- Booking summary mini -->
				{#if selectedType}
					<div class="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm mb-5 flex items-center gap-3">
						<img src={categoryImages[selectedType.category] ?? categoryImages['A']} alt="" class="h-12 w-16 rounded-lg object-cover" />
						<div>
							<p class="font-semibold text-stone-900">{selectedType.name}</p>
							<p class="text-stone-500 text-xs">{selectedProperty?.name} · {fmtDate(checkIn)} → {fmtDate(checkOut)} · {nights}n</p>
							{#if rateQuote}
								<p class="text-amber-700 text-xs font-semibold mt-0.5">Est. {fmt(rateQuote.subtotalCents)} total (before tax)</p>
							{:else if rateLoading}
								<p class="text-stone-400 text-xs">Calculating rate…</p>
							{/if}
						</div>
					</div>
				{/if}

				<div class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gName">Full name *</label>
							<input id="gName" type="text" bind:value={guestName} placeholder="Jane Smith" required
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
						</div>
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gPhone">Phone *</label>
							<input id="gPhone" type="tel" bind:value={guestPhone} placeholder="+1 555 000 0000" required
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="gEmail">Email address *</label>
						<input id="gEmail" type="email" bind:value={guestEmail} placeholder="jane@example.com" required
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
						<p class="text-xs text-stone-400 mt-1">Your confirmation will be sent here.</p>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="adults">Adults</label>
							<select id="adults" bind:value={numAdults}
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
								{#each [1,2,3,4,5,6] as n}<option value={n}>{n}</option>{/each}
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium text-stone-700 mb-1.5" for="children">Children</label>
							<select id="children" bind:value={numChildren}
								class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
								{#each [0,1,2,3,4] as n}<option value={n}>{n}</option>{/each}
							</select>
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-stone-700 mb-1.5" for="notes">Special requests (optional)</label>
						<textarea id="notes" bind:value={guestNotes} rows="3" placeholder="E.g. ground floor preferred, allergies, early arrival…"
							class="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"></textarea>
					</div>
				</div>

				<button
					type="button"
					onclick={() => {
						if (!guestName.trim()) return;
						if (!guestEmail.trim() || !guestEmail.includes('@')) return;
						step = 4;
					}}
					class="mt-5 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors"
				>
					Review Booking →
				</button>

			<!-- ── Step 4: Confirm ─────────────────────────────────────────────── -->
			{:else if step === 4}
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-semibold text-stone-900">Confirm your booking</h2>
					<button onclick={() => { step = 3; }} class="text-sm text-stone-400 hover:text-stone-600">← Back</button>
				</div>

				<!-- Summary -->
				<div class="rounded-xl bg-stone-50 border border-stone-100 divide-y divide-stone-100 mb-6">
					<div class="px-4 py-3 flex items-center gap-3">
						{#if selectedType}
							<img src={categoryImages[selectedType.category] ?? categoryImages['A']} alt="" class="h-14 w-20 rounded-lg object-cover" />
							<div>
								<p class="font-semibold text-stone-900">{selectedType.name}</p>
								<p class="text-stone-500 text-xs">{selectedProperty?.name}</p>
							</div>
						{/if}
					</div>
					<div class="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
						<div><span class="text-stone-400 text-xs">Check-in</span><p class="font-medium">{fmtDate(checkIn)}</p></div>
						<div><span class="text-stone-400 text-xs">Check-out</span><p class="font-medium">{fmtDate(checkOut)}</p></div>
						<div><span class="text-stone-400 text-xs">Duration</span><p class="font-medium">{nights} night{nights===1?'':'s'}</p></div>
						<div><span class="text-stone-400 text-xs">Guests</span><p class="font-medium">{numAdults} adult{numAdults===1?'':'s'}{numChildren > 0 ? ` · ${numChildren} child${numChildren===1?'':'ren'}` : ''}</p></div>
						<div><span class="text-stone-400 text-xs">Name</span><p class="font-medium">{guestName}</p></div>
						<div><span class="text-stone-400 text-xs">Email</span><p class="font-medium text-xs break-all">{guestEmail}</p></div>
					</div>

					{#if rateQuote}
						<div class="px-4 py-3">
							<p class="text-xs text-stone-400 mb-2">Estimated rate breakdown</p>
							{#each rateQuote.lines as line}
								<div class="flex justify-between text-sm text-stone-600">
									<span>{line.nights}n × ${(line.unitCents/100).toFixed(0)}/night</span>
									<span class="font-medium">{fmt(line.totalCents)}</span>
								</div>
							{/each}
							<div class="mt-2 pt-2 border-t border-stone-100 flex justify-between font-semibold text-stone-900">
								<span>Subtotal (before tax)</span>
								<span>{fmt(rateQuote.subtotalCents)}</span>
							</div>
							<p class="text-xs text-stone-400 mt-1">Taxes (GST + PST) calculated at check-in. All rates payable upon arrival.</p>
						</div>
					{/if}

					{#if guestNotes}
						<div class="px-4 py-3 text-sm">
							<span class="text-stone-400 text-xs block mb-0.5">Special requests</span>
							<p class="text-stone-600 italic">{guestNotes}</p>
						</div>
					{/if}
				</div>

				<!-- Important notice -->
				<div class="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 mb-5 space-y-1">
					<p class="font-semibold">Before you confirm</p>
					<p>• Payment is due in full upon arrival — no charges are taken now.</p>
					<p>• The room number is assigned by our team before your arrival.</p>
					<p>• You will receive a confirmation email at <strong>{guestEmail}</strong>.</p>
					{#if selectedProperty?.cancellationPolicy}
						<p>• {selectedProperty.cancellationPolicy}</p>
					{/if}
				</div>

				{#if form?.error}
					<p class="text-red-600 text-sm mb-3 rounded-lg bg-red-50 border border-red-100 px-4 py-2">{form.error}</p>
				{/if}

				<form method="POST" action="?/book" use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}>
					<input type="hidden" name="propertyId" value={selectedPropertyId} />
					<input type="hidden" name="roomTypeId" value={selectedTypeId} />
					<input type="hidden" name="checkIn" value={checkIn} />
					<input type="hidden" name="checkOut" value={checkOut} />
					<input type="hidden" name="guestName" value={guestName} />
					<input type="hidden" name="guestEmail" value={guestEmail} />
					<input type="hidden" name="guestPhone" value={guestPhone} />
					<input type="hidden" name="numAdults" value={numAdults} />
					<input type="hidden" name="numChildren" value={numChildren} />
					<input type="hidden" name="notes" value={guestNotes} />
					<!-- Quoted rate — locked in at time of booking so operator always sees what guest was promised -->
					{#if rateQuote && rateQuote.subtotalCents > 0}
						<input type="hidden" name="quotedTotalCents" value={rateQuote.subtotalCents} />
						<input type="hidden" name="quotedNights" value={nights} />
					{/if}

					<button type="submit" disabled={submitting}
						class="w-full rounded-xl bg-amber-500 py-4 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors disabled:opacity-60">
						{submitting ? 'Submitting…' : '✓ Confirm Reservation'}
					</button>
				</form>
			{/if}
		</div>

		<!-- Trust signals -->
		<div class="mt-6 flex flex-wrap justify-center gap-6 text-xs text-stone-400">
			<span>🔒 Secure reservation</span>
			<span>💳 Pay at the motel — no charge now</span>
			<span>📞 Call us with any questions</span>
		</div>
	</div>
</div>
