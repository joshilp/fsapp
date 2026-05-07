<script lang="ts">
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { data }: { data: PageData } = $props();

	function fmt(iso: string) {
		const [y, m, d] = iso.split('-');
		return `${parseInt(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]}`;
	}

	function nights(ci: string, co: string) {
		const ms = new Date(co).getTime() - new Date(ci).getTime();
		const n = Math.round(ms / 86400000);
		return n === 1 ? '1 night' : `${n} nights`;
	}

	function fmtMoney(cents: number) {
		return '$' + (cents / 100).toFixed(2);
	}

	function propShort(name: string) {
		// Shorten "Falcon Motel" → "Falcon", etc.
		return name.split(' ')[0];
	}
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6 space-y-6">

	<!-- Header -->
	<div class="flex items-baseline justify-between">
		<h1 class="text-xl font-bold">
			Operations — <span class="text-muted-foreground font-normal">{new Date(data.today + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
		</h1>
		<a href="/booking" class="text-xs text-muted-foreground hover:text-foreground transition-colors">→ Booking Grid</a>
	</div>

	<!-- Stats row -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each [
			{ label: 'Arriving', count: data.arrivals.length,   href: '#arrivals',   colour: 'bg-blue-50   border-blue-200  text-blue-700   dark:bg-blue-950/30  dark:border-blue-800  dark:text-blue-300' },
			{ label: 'Departing',count: data.departures.length, href: '#departures', colour: 'bg-amber-50  border-amber-200 text-amber-700  dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300' },
			{ label: 'In-House', count: data.inHouse.length + data.departures.length, href: '#inhouse', colour: 'bg-green-50  border-green-200 text-green-700  dark:bg-green-950/30 dark:border-green-800 dark:text-green-300' },
			{ label: 'Unassigned',count: data.unassigned.length,href: '#unassigned', colour: 'bg-red-50    border-red-200   text-red-700    dark:bg-red-950/30   dark:border-red-800   dark:text-red-300' }
		] as stat}
			<a href={stat.href}
				class={['rounded-xl border p-4 text-center transition-opacity hover:opacity-80', stat.colour].join(' ')}>
				<div class="text-3xl font-bold">{stat.count}</div>
				<div class="text-xs font-medium mt-0.5">{stat.label}</div>
			</a>
		{/each}
	</div>

	<!-- Arrivals + Departures side-by-side on wide screens -->
	<div class="grid gap-4 lg:grid-cols-2">

		<!-- ── Arrivals ────────────────────────────────── -->
		<section id="arrivals">
			<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
				<span class="h-2 w-2 rounded-full bg-blue-500 inline-block"></span>
				Arriving today
				{#if data.arrivals.length === 0}
					<span class="text-muted-foreground font-normal">(none)</span>
				{/if}
			</h2>
			{#if data.arrivals.length > 0}
			<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
				{#each data.arrivals as b}
					<a href="/booking?open={b.id}"
						class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
							<p class="text-xs text-muted-foreground">
								{b.room ? `Rm ${b.room.roomNumber}` : '(unassigned)'}
								· {propShort(b.property.name)}
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
				{#if data.departures.length === 0}
					<span class="text-muted-foreground font-normal">(none)</span>
				{/if}
			</h2>
			{#if data.departures.length > 0}
			<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
				{#each data.departures as b}
					<a href="/booking?open={b.id}"
						class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
							<p class="text-xs text-muted-foreground">
								Rm {b.room?.roomNumber ?? '?'}
								· {propShort(b.property.name)}
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
	{#if data.inHouse.length > 0}
	<section id="inhouse">
		<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
			<span class="h-2 w-2 rounded-full bg-green-500 inline-block"></span>
			In-house (staying over)
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
			{#each data.inHouse as b}
				<a href="/booking?open={b.id}"
					class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
					<div class="min-w-0 flex-1">
						<p class="font-medium truncate">{b.guest?.name ?? 'Guest'}</p>
						<p class="text-xs text-muted-foreground">
							Rm {b.room?.roomNumber ?? '?'}
							· {propShort(b.property.name)}
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
	{#if data.unassigned.length > 0}
	<section id="unassigned">
		<h2 class="text-sm font-semibold mb-2 flex items-center gap-2">
			<span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span>
			Unassigned bookings
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
			{#each data.unassigned as b}
				<a href="/booking?open={b.id}"
					class="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors gap-3">
					<div class="min-w-0 flex-1">
						<p class="font-medium truncate">{b.guest?.name ?? 'Guest TBD'}</p>
						<p class="text-xs text-muted-foreground">
							{b.requestedRoomType?.name ?? 'Any room'}
							· {propShort(b.property.name)}
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
	{#if data.arrivals.length === 0 && data.departures.length === 0 && data.inHouse.length === 0 && data.unassigned.length === 0}
	<div class="rounded-xl border border-dashed border-border py-16 text-center">
		<p class="text-2xl mb-2">✓</p>
		<p class="text-sm text-muted-foreground">All clear — no arrivals, departures, or unassigned bookings today.</p>
		<a href="/booking" class="mt-4 inline-block text-xs text-primary hover:underline">Open Booking Grid →</a>
	</div>
	{/if}

</div>
