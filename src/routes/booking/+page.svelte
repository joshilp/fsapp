<script lang="ts">
	import type { PageData } from './$types';
	import BookingGrid from '$lib/components/booking/BookingGrid.svelte';
	import BookingFilters from '$lib/components/booking/BookingFilters.svelte';
	import TodayView from '$lib/components/booking/TodayView.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Booking Grid</title>
</svelte:head>

<BookingFilters year={data.year} month={data.month} viewMode={data.viewMode as 'grid' | 'today'} />

{#if data.viewMode === 'today' && data.todayData}
	<TodayView
		arrivals={data.todayData.arrivals}
		departures={data.todayData.departures}
		inHouse={data.todayData.inHouse}
		today={data.today}
	/>
{:else if data.falcon && data.spanish}
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="flex min-w-0 flex-col divide-y lg:flex-row lg:divide-x lg:divide-y-0">
			<div class="min-w-0 flex-1">
				<BookingGrid
					grid={data.falcon}
					today={data.today}
					channels={data.channels}
					users={data.users}
					currentUserId={data.currentUserId}
				/>
			</div>
			<div class="min-w-0 flex-1">
				<BookingGrid
					grid={data.spanish}
					today={data.today}
					channels={data.channels}
					users={data.users}
					currentUserId={data.currentUserId}
				/>
			</div>
		</div>
	</div>
{/if}
