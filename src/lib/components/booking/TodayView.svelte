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

	function occupants(b: TodayBooking): string {
		const parts: string[] = [];
		if (b.numAdults > 0) parts.push(`${b.numAdults}A`);
		if (b.numChildren > 0) parts.push(`${b.numChildren}C`);
		return parts.join(' ');
	}

	const totalInHouseAfter = $derived(arrivals.length + inHouse.length);
</script>

<div class="mx-auto max-w-4xl px-4 py-6">
	<!-- Summary stats bar -->
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<p class="text-muted-foreground text-sm">{todayLabel}</p>
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<span class="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 font-medium text-blue-700">
				↓ {arrivals.length} arriving
			</span>
			<span class="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-700">
				↑ {departures.length} departing
			</span>
			<span class="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
				● {totalInHouseAfter} in house tonight
			</span>
		</div>
	</div>

	{#if arrivals.length === 0 && departures.length === 0 && inHouse.length === 0}
		<div class="text-muted-foreground py-12 text-center text-sm">
			Nothing scheduled for today.
		</div>
	{/if}

	<!-- Arrivals -->
	{#if arrivals.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				Arrivals today
				<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
					{arrivals.length}
				</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-3 text-left font-medium">Room</th>
						<th class="pb-1 pr-3 text-left font-medium">Property</th>
						<th class="pb-1 pr-3 text-left font-medium">Guest</th>
						<th class="pb-1 pr-3 text-left font-medium">Stay</th>
						<th class="pb-1 pr-3 text-left font-medium">Via</th>
						<th class="pb-1 text-right font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each arrivals as b}
						<tr class="hover:bg-muted/40 border-border border-b text-sm last:border-0">
							<td class="py-2 pr-3 font-mono font-medium">
								{b.roomNumber}
								{#if b.roomTypeCategory}
									<span class="text-muted-foreground ml-0.5 text-[10px] font-normal">{b.roomTypeCategory}</span>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-400">{b.propertyName.replace(' Motel', '')}</td>
							<td class="py-2 pr-3">
								<div class="font-medium">{b.guestName ?? '—'}</div>
								{#if occupants(b)}
									<div class="text-muted-foreground text-xs">{occupants(b)}</div>
								{/if}
								{#if b.notes}
									<div class="mt-0.5 max-w-[180px] truncate text-[10px] italic text-amber-600" title={b.notes}>{b.notes}</div>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
								{nights(b.checkInDate, b.checkOutDate)} nights → {formatDate(b.checkOutDate)}
							</td>
							<td class="py-2 pr-3">
								{#if b.channelName && b.channelName !== 'Direct'}
									<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
										{b.channelName === 'Expedia' ? 'E' : b.channelName[0]}
									</span>
								{/if}
							</td>
							<td class="py-2 text-right">
								<a
									href="/booking/{b.id}/checkin"
									class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2.5 py-1 text-xs font-medium"
								>
									Check In →
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<!-- Departures -->
	{#if departures.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				Departures today
				<span class="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
					{departures.length}
				</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-3 text-left font-medium">Room</th>
						<th class="pb-1 pr-3 text-left font-medium">Property</th>
						<th class="pb-1 pr-3 text-left font-medium">Guest</th>
						<th class="pb-1 pr-3 text-left font-medium">Stay</th>
						<th class="pb-1 pr-3 text-left font-medium">Via</th>
						<th class="pb-1 text-right font-medium">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each departures as b}
						<tr class="hover:bg-muted/40 border-border border-b text-sm last:border-0">
							<td class="py-2 pr-3 font-mono font-medium">
								{b.roomNumber}
								{#if b.roomTypeCategory}
									<span class="text-muted-foreground ml-0.5 text-[10px] font-normal">{b.roomTypeCategory}</span>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-400">{b.propertyName.replace(' Motel', '')}</td>
							<td class="py-2 pr-3">
								<div class="font-medium">{b.guestName ?? '—'}</div>
								{#if occupants(b)}
									<div class="text-muted-foreground text-xs">{occupants(b)}</div>
								{/if}
								{#if b.notes}
									<div class="mt-0.5 max-w-[180px] truncate text-[10px] italic text-amber-600" title={b.notes}>{b.notes}</div>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
								since {formatDate(b.checkInDate)} · {nights(b.checkInDate, b.checkOutDate)} nights
							</td>
							<td class="py-2 pr-3">
								{#if b.channelName && b.channelName !== 'Direct'}
									<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
										{b.channelName === 'Expedia' ? 'E' : b.channelName[0]}
									</span>
								{/if}
							</td>
							<td class="py-2 text-right">
								<a
									href="/booking/{b.id}/checkin"
									class="rounded border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
								>
									Check Out →
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<!-- In-house (continuing stays, not departing today) -->
	{#if inHouse.length > 0}
		<section class="mb-8">
			<h2 class="mb-2 flex items-center gap-2 font-semibold">
				In House
				<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
					{inHouse.length}
				</span>
				<span class="text-muted-foreground text-xs font-normal">continuing stay</span>
			</h2>
			<table class="w-full">
				<thead>
					<tr class="text-muted-foreground border-border border-b text-xs">
						<th class="pb-1 pr-3 text-left font-medium">Room</th>
						<th class="pb-1 pr-3 text-left font-medium">Property</th>
						<th class="pb-1 pr-3 text-left font-medium">Guest</th>
						<th class="pb-1 pr-3 text-left font-medium">Checkout</th>
						<th class="pb-1 pr-3 text-left font-medium">Via</th>
						<th class="pb-1 text-right font-medium"></th>
					</tr>
				</thead>
				<tbody>
					{#each inHouse as b}
						<tr class="hover:bg-muted/40 border-border border-b text-sm last:border-0">
							<td class="py-2 pr-3 font-mono font-medium">
								{b.roomNumber}
								{#if b.roomTypeCategory}
									<span class="text-muted-foreground ml-0.5 text-[10px] font-normal">{b.roomTypeCategory}</span>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-400">{b.propertyName.replace(' Motel', '')}</td>
							<td class="py-2 pr-3">
								<div class="font-medium">{b.guestName ?? '—'}</div>
								{#if occupants(b)}
									<div class="text-muted-foreground text-xs">{occupants(b)}</div>
								{/if}
								{#if b.notes}
									<div class="mt-0.5 max-w-[180px] truncate text-[10px] italic text-amber-600" title={b.notes}>{b.notes}</div>
								{/if}
							</td>
							<td class="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
								{formatDate(b.checkOutDate)} · {nights(b.checkInDate, b.checkOutDate)} nights total
							</td>
							<td class="py-2 pr-3">
								{#if b.channelName && b.channelName !== 'Direct'}
									<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
										{b.channelName === 'Expedia' ? 'E' : b.channelName[0]}
									</span>
								{/if}
							</td>
							<td class="py-2 text-right">
								<a
									href="/booking/{b.id}/checkin"
									class="text-muted-foreground rounded border px-2.5 py-1 text-xs hover:bg-muted"
								>
									View
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>
