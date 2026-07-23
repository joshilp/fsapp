<svelte:head>
	<title>Rezzzo — Property Management for Independent Motels</title>
	<meta name="description" content="Rezzzo is a modern PMS built for independent motels. Manage bookings, inventory, rates, and online reservations from one place." />
</svelte:head>

<!-- ── Hero ──────────────────────────────────────────────────────────────────── -->
<section class="relative min-h-[580px] flex items-center justify-center overflow-hidden bg-stone-900">
	<img
		src="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=70"
		alt="Motel"
		class="absolute inset-0 h-full w-full object-cover opacity-20"
	/>
	<div class="relative z-10 text-center px-4 max-w-3xl mx-auto py-20">
		<p class="text-amber-400 font-semibold text-sm uppercase tracking-widest mb-4">Built for independent motels</p>
		<h1 class="text-4xl sm:text-6xl font-bold text-white leading-tight mb-5">
			Run your motel.<br />Not your software.
		</h1>
		<p class="text-stone-300 text-lg sm:text-xl mb-10 max-w-xl mx-auto leading-relaxed">
			Rezzzo is a modern property management system designed for small and independent motels.
			Bookings, inventory, rates, and online reservations — all in one place.
		</p>
		<div class="flex flex-col sm:flex-row gap-3 justify-center">
			<a href="/auth/login"
				class="rounded-full bg-amber-500 px-8 py-3.5 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors">
				Sign in to your account →
			</a>
			<a href="/#features"
				class="rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors">
				See the features
			</a>
		</div>
	</div>
</section>

<!-- ── Social proof bar ───────────────────────────────────────────────────────── -->
<section class="bg-stone-800 border-y border-white/5 py-5">
	<div class="mx-auto max-w-4xl px-4">
		<div class="flex flex-wrap justify-center gap-8 text-sm text-stone-400">
			<span class="flex items-center gap-2"><span class="text-amber-400">✓</span> Multi-property support</span>
			<span class="flex items-center gap-2"><span class="text-amber-400">✓</span> Online booking engine included</span>
			<span class="flex items-center gap-2"><span class="text-amber-400">✓</span> Channex channel manager integration</span>
			<span class="flex items-center gap-2"><span class="text-amber-400">✓</span> No per-booking fees</span>
		</div>
	</div>
</section>

<!-- ── Features ───────────────────────────────────────────────────────────────── -->
<section id="features" class="py-20 bg-white">
	<div class="mx-auto max-w-5xl px-4">
		<div class="text-center mb-14">
			<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">Everything you need</p>
			<h2 class="text-3xl sm:text-4xl font-bold text-stone-900">Built for how motels actually work</h2>
			<p class="text-stone-500 mt-3 max-w-xl mx-auto">No bloat. No 200-field setup wizards. Just the tools front-desk staff use every day.</p>
		</div>

		<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
			{#each [
				{
					icon: '📅',
					title: 'Booking Grid',
					desc: 'A visual day-by-day grid shows every room across your property. Drag to create bookings, click to edit. Works like a real front desk.'
				},
				{
					icon: '🌐',
					title: 'Online Booking Engine',
					desc: 'A branded booking page guests can reach directly from your website. No OTA commission — direct bookings only.'
				},
				{
					icon: '📊',
					title: 'Inventory & Rates',
					desc: 'Set seasonal rates, minimum stays, stop-sells, and availability caps. Override any date range with bulk edit.'
				},
				{
					icon: '🏨',
					title: 'Multi-Property',
					desc: 'Manage two or more properties from a single account. Switch between them instantly — no separate logins.'
				},
				{
					icon: '🔗',
					title: 'Channel Manager',
					desc: 'Push availability and rates to Booking.com, Expedia, Airbnb, and more via Channex. Set it up once, let it sync automatically.'
				},
				{
					icon: '📋',
					title: 'Housekeeping',
					desc: 'A room status board for your cleaning team. Mark rooms clean, dirty, or inspected — tied to check-out dates.'
				},
			] as f}
				<div class="rounded-2xl bg-stone-50 border border-stone-100 p-6">
					<div class="text-3xl mb-4">{f.icon}</div>
					<h3 class="font-bold text-stone-900 mb-2">{f.title}</h3>
					<p class="text-stone-600 text-sm leading-relaxed">{f.desc}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<!-- ── Screenshot / product preview ──────────────────────────────────────────── -->
<section class="py-20 bg-stone-50 border-y border-stone-100">
	<div class="mx-auto max-w-5xl px-4">
		<div class="grid gap-12 lg:grid-cols-2 items-center">
			<div>
				<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">The booking grid</p>
				<h2 class="text-3xl font-bold text-stone-900 mb-4">Everything visible at a glance</h2>
				<p class="text-stone-600 leading-relaxed mb-4">
					The inventory grid shows availability, rates, minimum stays, CTA/CTD restrictions, and booked room counts for every room type — across as many days as you need.
				</p>
				<p class="text-stone-600 leading-relaxed">
					Bulk-edit a date range by dragging across cells. Override rates, set stop-sells, or adjust min-stay for peak periods in seconds.
				</p>
			</div>
			<div class="rounded-2xl bg-stone-200 h-64 lg:h-80 flex items-center justify-center border border-stone-200 overflow-hidden">
				<div class="text-center text-stone-400">
					<svg class="h-10 w-10 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
					</svg>
					<p class="text-sm">Product screenshot</p>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- ── Pricing ────────────────────────────────────────────────────────────────── -->
<section id="pricing" class="py-20 bg-white">
	<div class="mx-auto max-w-3xl px-4 text-center">
		<p class="text-amber-600 text-sm font-semibold uppercase tracking-wide mb-2">Pricing</p>
		<h2 class="text-3xl sm:text-4xl font-bold text-stone-900 mb-4">Simple, flat pricing</h2>
		<p class="text-stone-500 mb-10">No per-booking fees. No commission on online reservations. Just one flat monthly rate.</p>

		<div class="rounded-2xl border-2 border-amber-400 bg-amber-50 p-8 max-w-sm mx-auto">
			<p class="text-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">Monthly</p>
			<p class="text-5xl font-bold text-stone-900 mb-1">$99</p>
			<p class="text-stone-500 text-sm mb-6">per property / month</p>
			<ul class="space-y-2 text-sm text-stone-700 text-left mb-8">
				<li class="flex items-center gap-2"><span class="text-amber-500">✓</span> Unlimited bookings</li>
				<li class="flex items-center gap-2"><span class="text-amber-500">✓</span> Online booking engine</li>
				<li class="flex items-center gap-2"><span class="text-amber-500">✓</span> Channel manager sync</li>
				<li class="flex items-center gap-2"><span class="text-amber-500">✓</span> Multi-property dashboard</li>
				<li class="flex items-center gap-2"><span class="text-amber-500">✓</span> Email confirmations</li>
			</ul>
			<a href="/auth/login"
				class="block w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors text-center">
				Get started →
			</a>
		</div>
	</div>
</section>

<!-- ── CTA ────────────────────────────────────────────────────────────────────── -->
<section class="py-20 bg-stone-900">
	<div class="mx-auto max-w-2xl px-4 text-center">
		<h2 class="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to simplify your front desk?</h2>
		<p class="text-stone-400 mb-8">Sign in to your Rezzzo account or contact us to get set up.</p>
		<a href="/auth/login"
			class="inline-block rounded-full bg-amber-500 px-10 py-4 text-sm font-bold text-stone-900 hover:bg-amber-400 transition-colors">
			Sign in to Rezzzo →
		</a>
	</div>
</section>
