<script lang="ts">
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data }: { data: PageData } = $props();

	// ── Property tab switcher ─────────────────────────────────────────────────
	let selectedPropId = $state<string | null>(null); // null = All Properties

	const filteredArrivals   = $derived(selectedPropId ? data.arrivals.filter(b   => b.property.id === selectedPropId) : data.arrivals);
	const filteredDepartures = $derived(selectedPropId ? data.departures.filter(b => b.property.id === selectedPropId) : data.departures);
	const filteredInHouse    = $derived(selectedPropId ? data.inHouse.filter(b    => b.property.id === selectedPropId) : data.inHouse);
	const filteredUnassigned = $derived(selectedPropId ? data.unassigned.filter(b => b.property.id === selectedPropId) : data.unassigned);

	function fmt(iso: string) {
		const [y, m, d] = iso.split('-');
		return `${parseInt(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]}`;
	}
	function nights(ci: string, co: string) {
		const n = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
		return n === 1 ? '1 night' : `${n} nights`;
	}
	function fmtMoney(cents: number) { return '$' + (cents / 100).toFixed(2); }
	function propShort(name: string) { return name.split(' ')[0]; }
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6 space-y-5">

	<!-- Header -->
	<div class="flex items-baseline justify-between">
		<h1 class="text-xl font-bold">
			Operations — <span class="text-muted-foreground font-normal">{new Date(data.today + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
		</h1>
		<a href="/booking" class="text-xs text-muted-foreground hover:text-foreground transition-colors">→ Booking Grid</a>
	</div>

	<!-- Property cards (compact, neutral) -->
	{#if data.properties.length > 0}
	<div class="grid gap-3 sm:grid-cols-2">
		{#each data.properties as prop}
			{@const accent = prop.accentColour ?? '#d97706'}
			<div class="relative overflow-hidden rounded-xl bg-card shadow-sm"
				style="border: 1.5px solid {accent}">
				<!-- Faint hero texture -->
				{#if prop.heroImageUrl}
					<img src={prop.heroImageUrl} alt="" class="absolute inset-0 h-full w-full object-cover opacity-[0.04] pointer-events-none" />
				{/if}
				<div class="relative z-10 flex items-center gap-3 px-4 py-3">
					<!-- Logo / name -->
					{#if prop.logoUrl}
						<img src={prop.logoUrl} alt={prop.name} class="h-9 w-auto max-w-[100px] shrink-0 object-contain" />
					{:else}
						<div class="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-sm font-bold text-white" style="background-color:{accent}">
							{prop.name.charAt(0)}
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						<p class="font-semibold text-sm truncate">{prop.name}</p>
						{#if prop.city}<p class="text-xs text-muted-foreground">{prop.city}{prop.province ? ', ' + prop.province : ''}</p>{/if}
					</div>
					<!-- Quick links -->
					<div class="flex shrink-0 items-center gap-1.5">
						<a href="/booking?propertyId={prop.id}" title="Booking Grid"
							class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors">Grid</a>
						<a href="/inventory?propertyId={prop.id}" title="Inventory"
							class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors">ARI</a>
						<a href="/housekeeping" title="Housekeeping"
							class="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors">HK</a>
						{#if prop.publicId && prop.bookingEnabled}
							<a href="/book/{prop.publicId}" target="_blank" rel="noopener" title="Guest booking page"
								class="rounded-md px-2 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90"
								style="background-color:{accent}">Book ↗</a>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
	{/if}

	<!-- Property tab switcher -->
	{#if data.properties.length > 1}
	<div class="flex flex-wrap gap-1.5">
		<button
			onclick={() => selectedPropId = null}
			class={['rounded-full border px-3 py-1 text-xs font-medium transition-colors',
				selectedPropId === null
					? 'bg-foreground text-background border-foreground'
					: 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
			].join(' ')}>
			All Properties
		</button>
		{#each data.properties as prop}
			{@const accent = prop.accentColour ?? '#d97706'}
			<button
				onclick={() => selectedPropId = selectedPropId === prop.id ? null : prop.id}
				class={['rounded-full border px-3 py-1 text-xs font-medium transition-colors',
					selectedPropId === prop.id ? 'text-white border-transparent' : 'border-border text-muted-foreground hover:text-foreground'
				].join(' ')}
				style={selectedPropId === prop.id ? `background-color:${accent}` : ''}>
				{prop.name.split(' ')[0]}
			</button>
		{/each}
	</div>
	{/if}

	<!-- Stats row -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each [
			{ label: 'Arriving',   count: filteredArrivals.length,                                 href: '#arrivals',   colour: 'bg-blue-50   border-blue-200  text-blue-700'   },
			{ label: 'Departing',  count: filteredDepartures.length,                               href: '#departures', colour: 'bg-amber-50  border-amber-200 text-amber-700'  },
			{ label: 'In-House',   count: filteredInHouse.length + filteredDepartures.length,      href: '#inhouse',    colour: 'bg-green-50  border-green-200 text-green-700'  },
			{ label: 'Unassigned', count: filteredUnassigned.length,                               href: '#unassigned', colour: 'bg-red-50    border-red-200   text-red-700'    }
		] as stat}
			<a href={stat.href}
				class={['rounded-xl border p-4 text-center transition-opacity hover:opacity-80', stat.colour].join(' ')}>
				<div class="text-3xl font-bold">{stat.count}</div>
				<div class="text-xs font-medium mt-0.5">{stat.label}</div>
			</a>
		{/each}
	</div>

	<!-- Arrivals + Departures side-by-side -->
	<div class="grid gap-4 lg:grid-cols-2">

		<!-- ── Arrivals ────────────────────────────────── -->
		<section id="arrivals">
			<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
				<span class="h-2 w-2 rounded-full bg-blue-500 inline-block"></span>
				Arriving today
				{#if filteredArrivals.length === 0}
					<span class="text-muted-foreground font-normal">(none)</span>
				{/if}
			</h2>
			{#if filteredArrivals.length > 0}
			<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
				{#each filteredArrivals as b}
					<a href="/booking?open={b.id}"
						class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
							<p class="text-xs text-muted-foreground">
								{b.room ? `Rm ${b.room.roomNumber}` : '(unassigned)'}
								{#if !selectedPropId} · {propShort(b.property.name)}{/if}
								· {nights(b.checkInDate, b.checkOutDate)}
							</p>
						</div>
						<div class="shrink-0 flex flex-col items-end gap-0.5">
							<Badge variant={b.status === 'confirmed' ? 'default' : 'secondary'} class="text-[10px] px-1.5 py-0">
								{b.status}
							</Badge>
							{#if b.balanceCents > 0}
								<span class="text-[10px] text-amber-600 font-medium">owes {fmtMoney(b.balanceCents)}</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
			{/if}
		</section>

		<!-- ── Departures ──────────────────────────────── -->
		<section id="departures">
			<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
				<span class="h-2 w-2 rounded-full bg-amber-500 inline-block"></span>
				Departing today
				{#if filteredDepartures.length === 0}
					<span class="text-muted-foreground font-normal">(none)</span>
				{/if}
			</h2>
			{#if filteredDepartures.length > 0}
			<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
				{#each filteredDepartures as b}
					<a href="/booking?open={b.id}"
						class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
							<p class="text-xs text-muted-foreground">
								Rm {b.room?.roomNumber ?? '?'}
								{#if !selectedPropId} · {propShort(b.property.name)}{/if}
								· checked out {b.checkOutDate}
							</p>
						</div>
						<div class="shrink-0 flex flex-col items-end gap-0.5">
							<Badge variant="default" class="text-[10px] px-1.5 py-0">checked in</Badge>
							{#if b.balanceCents > 0}
								<span class="text-[10px] text-red-500 font-medium">owes {fmtMoney(b.balanceCents)}</span>
							{/if}
						</div>
					</a>
				{/each}
			</div>
			{/if}
		</section>
	</div>

	<!-- ── In-House ────────────────────────────────────── -->
	{#if filteredInHouse.length > 0}
	<section id="inhouse">
		<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
			<span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
			In-house (staying over)
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
			{#each filteredInHouse as b}
				<a href="/booking?open={b.id}"
					class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
					<div class="min-w-0 flex-1">
						<p class="font-medium truncate">{b.guest?.name ?? 'Guest'}</p>
						<p class="text-xs text-muted-foreground">
							Rm {b.room?.roomNumber ?? '?'}
							{#if !selectedPropId} · {propShort(b.property.name)}{/if}
							· departs {fmt(b.checkOutDate)}
						</p>
					</div>
					<Badge variant="secondary" class="text-[10px] px-1.5 py-0 shrink-0">checked in</Badge>
				</a>
			{/each}
		</div>
	</section>
	{/if}

	<!-- ── Unassigned ─────────────────────────────────── -->
	{#if filteredUnassigned.length > 0}
	<section id="unassigned">
		<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
			<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span>
			Unassigned bookings
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
			{#each filteredUnassigned as b}
				<a href="/booking?open={b.id}"
					class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
					<div class="min-w-0 flex-1">
						<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
						<p class="text-xs text-muted-foreground">
							{b.requestedRoomType?.name ?? 'Any room'}
							{#if !selectedPropId} · {propShort(b.property.name)}{/if}
							· {fmt(b.checkInDate)} → {fmt(b.checkOutDate)}
						</p>
					</div>
					<Badge variant="secondary" class="text-[10px] px-1.5 py-0 shrink-0">{b.status}</Badge>
				</a>
			{/each}
		</div>
	</section>
	{/if}

	<!-- Empty state -->
	{#if filteredArrivals.length === 0 && filteredDepartures.length === 0 && filteredInHouse.length === 0 && filteredUnassigned.length === 0}
	<div class="rounded-xl border border-dashed border-border py-16 text-center">
		<p class="text-2xl mb-2">✓</p>
		<p class="text-sm text-muted-foreground">All clear — no arrivals, departures, or unassigned bookings{selectedPropId ? ' for this property' : ''} today.</p>
		<a href="/booking" class="mt-4 inline-block text-xs text-primary hover:underline">Open Booking Grid →</a>
	</div>
	{/if}

</div>
