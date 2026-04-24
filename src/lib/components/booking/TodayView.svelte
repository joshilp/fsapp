<script lang="ts">
	import type { TodayBooking } from '$lib/server/booking-queries';

	type Props = {
		arrivals: TodayBooking[];
		departures: TodayBooking[];
		inHouse: TodayBooking[];
		today: string;
	};

	let { arrivals, departures, inHouse, today }: Props = $props();

	const todayLabel = $derived(
		new Date(today + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	function nights(checkIn: string, checkOut: string): number {
		return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	}

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
	}

	const STATUS_CHIP: Record<string, string> = {
		confirmed: 'bg-blue-100 text-blue-700',
		checked_in: 'bg-green-100 text-green-700',
		checked_out: 'bg-gray-100 text-gray-500'
	};
</script>

<div class="mx-auto max-w-4xl px-4 py-6">
	<p class="text-muted-foreground mb-6 text-sm">{todayLabel}</p>

	{#if arrivals.length === 0 && departures.length === 0 && inHouse.length === 0}
		<div class="text-muted-foreground py-12 text-center text-sm">
			Nothing scheduled for today.
		</div>
	{/if}

	{#snippet bookingRow(b: TodayBooking, detail: string)}
		<tr class="hover:bg-muted/40 border-border border-b text-sm last:border-0">
			<td class="py-2 pr-4 font-mono font-medium">{b.roomNumber}</td>
			<td class="py-2 pr-4">
				<span class="text-xs text-gray-400">{b.propertyName.replace(' Motel', '')}</span>
			</td>
			<td class="py-2 pr-4 font-medium">{b.guestName ?? '—'}</td>
			<td class="py-2 pr-4 text-xs text-gray-500">{detail}</td>
			<td class="py-2 pr-4">
				{#if b.channelName && b.channelName !== 'Direct'}
					<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
						{b.channelName === 'Expedia' ? 'E' : b.channelName[0]}
					</span>
				{/if}
			</td>
			<td class="py-2 text-right">
				{#if b.status === 'confirmed'}
					<a
						href="/booking/{b.id}/checkin"
						class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2.5 py-1 text-xs font-medium"
					>
						Check In →
					</a>
				{:else}
					<span class={['rounded px-2 py-0.5 text-xs font-medium', STATUS_CHIP[b.status] ?? ''].join(' ')}>
						{b.status.replace('_', ' ')}
					</span>
				{/if}
			</td>
		</tr>
	{/snippet}

	<!-- Arrivals -->
	{#if arrivals.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				Arrivals
				<span class="bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs font-medium">
					{arrivals.length}
				</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-4 text-left font-medium">Room</th>
						<th class="pb-1 pr-4 text-left font-medium">Property</th>
						<th class="pb-1 pr-4 text-left font-medium">Guest</th>
						<th class="pb-1 pr-4 text-left font-medium">Stay</th>
						<th class="pb-1 pr-4 text-left font-medium">Channel</th>
						<th class="pb-1 text-right font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each arrivals as b}
						{@render bookingRow(b, `${nights(b.checkInDate, b.checkOutDate)} nights → ${formatDate(b.checkOutDate)}`)}
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<!-- Departures -->
	{#if departures.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				Departures
				<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
					{departures.length}
				</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-4 text-left font-medium">Room</th>
						<th class="pb-1 pr-4 text-left font-medium">Property</th>
						<th class="pb-1 pr-4 text-left font-medium">Guest</th>
						<th class="pb-1 pr-4 text-left font-medium">Checked in</th>
						<th class="pb-1 pr-4 text-left font-medium">Channel</th>
						<th class="pb-1 text-right font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each departures as b}
						{@render bookingRow(b, `since ${formatDate(b.checkInDate)}`)}
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<!-- In-house -->
	{#if inHouse.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				In House
				<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
					{inHouse.length}
				</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-4 text-left font-medium">Room</th>
						<th class="pb-1 pr-4 text-left font-medium">Property</th>
						<th class="pb-1 pr-4 text-left font-medium">Guest</th>
						<th class="pb-1 pr-4 text-left font-medium">Checkout</th>
						<th class="pb-1 pr-4 text-left font-medium">Channel</th>
						<th class="pb-1 text-right font-medium">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each inHouse as b}
						{@render bookingRow(b, `checkout ${formatDate(b.checkOutDate)}`)}
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>
