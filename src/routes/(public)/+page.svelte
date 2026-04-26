<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Hero date search
	const today = new Date().toISOString().slice(0, 10);
	const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
	let heroCheckIn = $state(today);
	let heroCheckOut = $state(tomorrow);

	function advanceDay(iso: string) {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	function goBook() {
		window.location.href = `/book?checkIn=${heroCheckIn}&checkOut=${heroCheckOut}`;
	}

	// Room type display helpers
	function bedDesc(rt: typeof data.displayTypes[0]): string {
		if (!rt.beds) return '';
		const parts: string[] = [];
		const br = rt.beds.numRooms;
		if (br > 1) parts.push(`${br} bedrooms`);
		if (rt.beds.kingBeds) parts.push(`${rt.beds.kingBeds} king`);
		if (rt.beds.queenBeds) parts.push(`${rt.beds.queenBeds} queen`);
		if (rt.beds.doubleBeds) parts.push(`${rt.beds.doubleBeds} double`);
		if (rt.beds.hasHideabed) parts.push('sofa bed');
		if (rt.beds.hasKitchen) parts.push('full kitchen');
		return parts.join(' · ');
	}

	// Category placeholder images (Unsplash, landscape-oriented, motel-appropriate)
	const categoryImages: Record<string, string> = {
		A: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80',
		B: 'https://images.unsplash.com/photo-1631049421450-348ccd7f8949?w=800&q=80',
		C: 'https://images.unsplash.com/photo-1564078516393-cf04bd966897?w=800&q=80',
		D: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80'
	};

	const firstProp = data.properties[0];
</script>

<svelte:head>
	<title>Falcon &amp; Spanish Fiesta Motels — Book Direct &amp; Save</title>
	<meta name="description" content="Book direct at Falcon Motel and Spanish Fiesta Motel. Comfortable rooms with kitchens, close to the beach. Best rates guaranteed when you book direct." />
</svelte:head>

<!-- ── Hero ─────────────────────────────────────────────────────────────────── -->
<section class="relative min-h-[600px] flex items-center justify-center overflow-hidden bg-stone-900">
	<!-- Background image -->
	<img
		src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1600&q=80"
		alt="Motel exterior"
		class="absolute inset-0 h-full w-full object-cover opacity-40"
	/>

	<!-- Content -->
	<div class="relative z-10 text-center px-4 max-w-4xl mx-auto">
		<p class="text-amber-400 font-semibold text-sm uppercase tracking-widest mb-3">British Columbia, Canada</p>
		<h1 class="text-4xl sm:text-6xl font-bold text-white leading-tight mb-4">
			Falcon &amp; Spanish Fiesta Motels
		</h1>
		<p class="text-stone-300 text-lg sm:text-xl mb-10 max-w-xl mx-auto">
			Comfortable rooms, ocean-fresh air, and everything you need for a relaxing stay.
		</p>

		<!-- Availability search box -->
		<div class="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 max-w-xl mx-auto text-left">
			<p class="text-stone-500 text-xs font-semibold uppercase tracking-wide mb-3">Check availability</p>
			<div class="grid grid-cols-2 gap-3 mb-4">
				<div>
					<label class="block text-xs text-stone-500 mb-1" for="heroCI">Check-in</label>
					<input
						id="heroCI" type="date"
						bind:value={heroCheckIn}
						min={today}
						oninput={() => { if (heroCheckOut <= heroCheckIn) heroCheckOut = advanceDay(heroCheckIn); }}
						class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
					/>
				</div>
				<div>
					<label class="block text-xs text-stone-500 mb-1" for="heroCO">Check-out</label>
					<input
						id="heroCO" type="date"
						bind:value={heroCheckOut}
						min={advanceDay(heroCheckIn)}
						class="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
					/>
				</div>
			</div>
			<button
				onclick={goBook}
				class="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors"
			>
				Search Available Rooms →
			</button>
		</div>
	</div>
</section>

<!-- ── About ─────────────────────────────────────────────────────────────────── -->
<section id="about" class="py-16 bg-white">
	<div class="mx-auto max-w-4xl px-4">
		<div class="grid gap-10 sm:grid-cols-2 items-center">
			<div>
				<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">About Us</p>
				<h2 class="text-3xl font-bold text-stone-900 mb-4">Two motels, one great stay</h2>
				<p class="text-stone-600 leading-relaxed mb-4">
					Falcon Motel and Spanish Fiesta Motel are family-run properties offering comfortable rooms,
					fully-equipped kitchens, and a warm welcome — just minutes from the beach.
				</p>
				<p class="text-stone-600 leading-relaxed">
					Whether you're here for a weekend getaway or an extended stay, we have the right room at the right price.
					Book direct for the best rate — no platform fees.
				</p>
				<ul class="mt-6 space-y-2 text-sm text-stone-700">
					<li class="flex items-center gap-2">
						<span class="text-amber-500">✓</span> Kitchen-equipped rooms available
					</li>
					<li class="flex items-center gap-2">
						<span class="text-amber-500">✓</span> Family-friendly units with multiple bedrooms
					</li>
					<li class="flex items-center gap-2">
						<span class="text-amber-500">✓</span> Best rate when you book direct
					</li>
					<li class="flex items-center gap-2">
						<span class="text-amber-500">✓</span> On-site check-in — no contactless key boxes
					</li>
				</ul>
			</div>
			<img
				src="https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=80"
				alt="Motel pool and grounds"
				class="rounded-2xl object-cover w-full h-64 sm:h-80 shadow-lg"
			/>
		</div>
	</div>
</section>

<!-- ── Room Types ────────────────────────────────────────────────────────────── -->
<section id="rooms" class="py-16 bg-stone-50">
	<div class="mx-auto max-w-6xl px-4">
		<div class="text-center mb-10">
			<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">Our Rooms</p>
			<h2 class="text-3xl font-bold text-stone-900">Find your perfect room</h2>
			<p class="text-stone-500 mt-2 text-sm">All rooms include free parking and Wi-Fi. Rates shown are from the lowest seasonal price.</p>
		</div>

		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-{Math.min(data.displayTypes.length, 4)}">
			{#each data.displayTypes as rt}
				<div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 flex flex-col">
					<div class="relative h-48 overflow-hidden">
						<img
							src={categoryImages[rt.category] ?? categoryImages['A']}
							alt={rt.name}
							class="w-full h-full object-cover"
						/>
						<div class="absolute top-3 left-3">
							<span class="rounded-full bg-stone-900/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
								{rt.category === 'A' ? '1 Bedroom' : rt.category === 'B' ? '2 Bedrooms' : rt.category === 'C' ? '2 Bed + Kitchen' : '3 Bed + Kitchen'}
							</span>
						</div>
					</div>
					<div class="p-5 flex flex-col flex-1">
						<h3 class="font-bold text-stone-900 text-lg mb-1">{rt.name}</h3>
						{#if bedDesc(rt)}
							<p class="text-stone-500 text-sm mb-3 capitalize">{bedDesc(rt)}</p>
						{/if}

						<!-- Amenity badges -->
						<div class="flex flex-wrap gap-1.5 mb-4">
							{#if rt.beds?.hasKitchen}
								<span class="rounded-full bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-0.5">🍳 Kitchen</span>
							{/if}
							{#if (rt.beds?.numRooms ?? 0) > 1}
								<span class="rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2 py-0.5">🛏 {rt.beds?.numRooms} Bedrooms</span>
							{/if}
							{#if rt.beds?.hasHideabed}
								<span class="rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-xs px-2 py-0.5">🛋 Sofa Bed</span>
							{/if}
							<span class="rounded-full bg-stone-50 border border-stone-200 text-stone-600 text-xs px-2 py-0.5">🚗 Free Parking</span>
							<span class="rounded-full bg-stone-50 border border-stone-200 text-stone-600 text-xs px-2 py-0.5">📶 Free Wi-Fi</span>
						</div>

						<div class="mt-auto flex items-end justify-between">
							<div>
								{#if rt.minRateCents}
									<span class="text-xs text-stone-400">from</span>
									<span class="text-2xl font-bold text-stone-900 ml-1">${(rt.minRateCents / 100).toFixed(0)}</span>
									<span class="text-stone-400 text-sm">/night</span>
								{:else}
									<span class="text-stone-400 text-sm">Call for pricing</span>
								{/if}
							</div>
							<a href="/book"
								class="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors">
								Book →
							</a>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ── Policies ──────────────────────────────────────────────────────────────── -->
<section class="py-16 bg-white">
	<div class="mx-auto max-w-3xl px-4">
		<div class="text-center mb-10">
			<h2 class="text-3xl font-bold text-stone-900">What to expect</h2>
		</div>
		<div class="grid gap-6 sm:grid-cols-2">
			<div class="rounded-2xl bg-stone-50 p-6 border border-stone-100">
				<div class="text-2xl mb-3">🕑</div>
				<h3 class="font-semibold text-stone-900 mb-2">Check-in &amp; Check-out</h3>
				<p class="text-stone-600 text-sm">
					{#if firstProp}
						Check-in from <strong>{firstProp.checkinTime}</strong>.
						Check-out by <strong>{firstProp.checkoutTime}</strong>.
					{:else}
						Check-in from <strong>2:00 PM</strong>. Check-out by <strong>10:30 AM</strong>.
					{/if}
				</p>
				<p class="text-stone-500 text-xs mt-2">Early/late arrangements subject to availability — ask at the desk.</p>
			</div>

			<div class="rounded-2xl bg-stone-50 p-6 border border-stone-100">
				<div class="text-2xl mb-3">💳</div>
				<h3 class="font-semibold text-stone-900 mb-2">Payment</h3>
				<p class="text-stone-600 text-sm">All rates are payable upon arrival. We accept Visa, Mastercard, and cash.</p>
				<p class="text-stone-500 text-xs mt-2">A deposit may be required to secure your reservation.</p>
			</div>

			<div class="rounded-2xl bg-stone-50 p-6 border border-stone-100">
				<div class="text-2xl mb-3">📋</div>
				<h3 class="font-semibold text-stone-900 mb-2">Cancellation</h3>
				{#if firstProp?.cancellationPolicy}
					<p class="text-stone-600 text-sm">{firstProp.cancellationPolicy}</p>
				{:else}
					<p class="text-stone-600 text-sm">Cancel up to 30 days before arrival for a $25 fee. Cancellations within 30 days are non-refundable.</p>
				{/if}
			</div>

			<div class="rounded-2xl bg-stone-50 p-6 border border-stone-100">
				<div class="text-2xl mb-3">🚭</div>
				<h3 class="font-semibold text-stone-900 mb-2">No Smoking</h3>
				<p class="text-stone-600 text-sm">
					All units are strictly non-smoking.
					{#if firstProp?.smokingFee}
						A ${(firstProp.smokingFee / 100).toFixed(0)} restoration fee applies per occurrence.
					{:else}
						A restoration fee applies per occurrence.
					{/if}
				</p>
			</div>
		</div>
	</div>
</section>

<!-- ── Location & Contact ────────────────────────────────────────────────────── -->
<section id="location" class="py-16 bg-stone-50">
	<div class="mx-auto max-w-4xl px-4">
		<div class="text-center mb-10">
			<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">Find Us</p>
			<h2 class="text-3xl font-bold text-stone-900">Location &amp; Contact</h2>
		</div>

		<!-- Map placeholder -->
		<div class="rounded-2xl overflow-hidden shadow-sm border border-stone-100 mb-8 bg-stone-200 h-64 flex items-center justify-center">
			<div class="text-center text-stone-500">
				<svg class="h-10 w-10 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
				</svg>
				<p class="text-sm">Map coming soon</p>
			</div>
		</div>

		<!-- Property cards -->
		<div id="contact" class="grid gap-6 sm:grid-cols-2">
			{#each data.properties as prop}
				<div class="rounded-2xl bg-white p-6 shadow-sm border border-stone-100">
					<h3 class="font-bold text-stone-900 text-lg mb-3">{prop.name}</h3>
					<div class="space-y-2 text-sm text-stone-600">
						<div class="flex items-start gap-2">
							<svg class="h-4 w-4 mt-0.5 shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
							</svg>
							<div>
								<p>{prop.address}</p>
								<p>{prop.city}, {prop.province}</p>
							</div>
						</div>
						{#if prop.phone}
							<div class="flex items-center gap-2">
								<svg class="h-4 w-4 shrink-0 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
								</svg>
								<a href="tel:{prop.phone.replace(/\D/g, '')}" class="hover:text-stone-900">{prop.phone}</a>
							</div>
						{/if}
					</div>
					<a href="/book?property={prop.id}"
						class="mt-4 block rounded-xl bg-amber-500 py-2.5 text-center text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors">
						Book {prop.name}
					</a>
				</div>
			{/each}
		</div>
	</div>
</section>
