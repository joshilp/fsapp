<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const maxTrend = $derived(Math.max(...data.trend.map((t) => t.count), 1));
</script>

<svelte:head>
	<title>Reports — {data.monthLabel}</title>
</svelte:head>

<div class="container max-w-4xl py-8 space-y-8">
	<!-- Header + month nav -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Reports</h1>
			<p class="text-muted-foreground text-sm">{data.monthLabel}</p>
		</div>
		<div class="flex items-center gap-2">
			<a href="?month={data.prevMonthParam}"
				class="rounded border border-input px-3 py-1.5 text-sm hover:bg-muted">← Prev</a>
			<a href="/reports"
				class="rounded border border-input px-3 py-1.5 text-sm hover:bg-muted">Today</a>
			<a href="?month={data.nextMonthParam}"
				class="rounded border border-input px-3 py-1.5 text-sm hover:bg-muted">Next →</a>
		</div>
	</div>

	<!-- Summary cards -->
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
		<div class="rounded-lg border border-border bg-card p-5">
			<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Check-ins</p>
			<p class="mt-1 text-3xl font-bold">{data.totalBookings}</p>
			<p class="text-muted-foreground text-xs mt-1">arrivals this month</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-5">
			<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Accommodation</p>
			<p class="mt-1 text-3xl font-bold">${data.totalRevenueDollars}</p>
			<p class="text-muted-foreground text-xs mt-1">before tax</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-5">
			<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Tax collected</p>
			<p class="mt-1 text-3xl font-bold">${data.totalTaxDollars}</p>
			<p class="text-muted-foreground text-xs mt-1">GST + PST lines</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-5">
			<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Payments in</p>
			<p class="mt-1 text-3xl font-bold">${data.totalCollectedDollars}</p>
			{#if parseFloat(data.totalRefundedDollars) > 0}
				<p class="text-muted-foreground text-xs mt-1">− ${data.totalRefundedDollars} refunded</p>
			{:else}
				<p class="text-muted-foreground text-xs mt-1">recorded payments</p>
			{/if}
		</div>
	</div>

	<!-- Occupancy per property -->
	<div class="grid gap-4 sm:grid-cols-{data.propertyStats.length}">
		{#each data.propertyStats as prop}
			<div class="rounded-lg border border-border bg-card p-5">
				<p class="text-muted-foreground text-xs font-medium uppercase tracking-wide truncate">{prop.propertyName}</p>
				<p class="mt-1 text-3xl font-bold">{prop.occupancyPct}%</p>
				<p class="text-muted-foreground text-xs mt-1">
					{prop.bookedNights} / {prop.availableNights} room-nights occupied
				</p>
				<div class="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
					<div class="h-full bg-teal-500 rounded-full" style="width:{prop.occupancyPct}%"></div>
				</div>
			</div>
		{/each}
	</div>

	<!-- 6-month booking trend bar chart -->
	<div class="rounded-lg border border-border bg-card p-5">
		<h2 class="font-semibold mb-4 text-sm">Booking Trend (6 months)</h2>
		<div class="flex items-end gap-3 h-28">
			{#each data.trend as t}
				{@const pct = Math.round((t.count / maxTrend) * 100)}
				<div class="flex-1 flex flex-col items-center gap-1">
					<span class="text-xs text-muted-foreground">{t.count > 0 ? t.count : ''}</span>
					<div class="w-full rounded-t transition-all"
						style="height:{Math.max(pct, 2)}%; background: {t.month === `${data.year}-${String(data.month).padStart(2,'0')}` ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)'}; min-height: 4px">
					</div>
					<span class="text-[10px] text-muted-foreground">{t.label}</span>
				</div>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<!-- Channel breakdown -->
		<div class="rounded-lg border border-border bg-card p-5">
			<h2 class="font-semibold mb-4 text-sm">Bookings by Channel</h2>
			{#if Object.keys(data.channelCounts).length === 0}
				<p class="text-muted-foreground text-sm">No bookings this month.</p>
			{:else}
				<div class="space-y-2">
					{#each Object.entries(data.channelCounts).sort((a, b) => b[1] - a[1]) as [ch, cnt]}
						{@const pct = Math.round((cnt / data.totalBookings) * 100)}
						<div>
							<div class="flex justify-between text-sm mb-0.5">
								<span class="font-medium">{ch}</span>
								<span class="text-muted-foreground">{cnt} ({pct}%)</span>
							</div>
							<div class="h-2 bg-muted rounded-full overflow-hidden">
								<div class="h-full bg-primary rounded-full" style="width:{pct}%"></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Status breakdown -->
		<div class="rounded-lg border border-border bg-card p-5">
			<h2 class="font-semibold mb-4 text-sm">Booking Statuses</h2>
			{#if Object.keys(data.statusCounts).length === 0}
				<p class="text-muted-foreground text-sm">No bookings this month.</p>
			{:else}
				<div class="space-y-2">
					{#each Object.entries(data.statusCounts) as [status, cnt]}
						{@const colors: Record<string, string> = {
							confirmed: 'bg-blue-100 text-blue-700',
							checked_in: 'bg-green-100 text-green-700',
							checked_out: 'bg-gray-100 text-gray-600',
							cancelled: 'bg-red-100 text-red-600'
						}}
						<div class="flex items-center justify-between text-sm">
							<span class={['rounded-full px-2.5 py-0.5 text-xs font-medium', colors[status] ?? 'bg-muted text-muted-foreground'].join(' ')}>
								{status.replace('_', ' ')}
							</span>
							<span class="font-medium">{cnt}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<p class="text-xs text-muted-foreground text-center">
		Revenue reflects accommodation rate lines for bookings that <em>checked in</em> this month.
		Occupancy counts all room-nights overlapping this month across both properties.
	</p>
</div>
