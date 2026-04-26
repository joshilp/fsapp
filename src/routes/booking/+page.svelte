<script lang="ts">
	import type { PageData } from './$types';
	import BookingGrid from '$lib/components/booking/BookingGrid.svelte';
	import BookingFilters from '$lib/components/booking/BookingFilters.svelte';
	import TodayView from '$lib/components/booking/TodayView.svelte';
	import FindRoomDialog from '$lib/components/booking/FindRoomDialog.svelte';
	import OtaImportDialog from '$lib/components/booking/OtaImportDialog.svelte';
	import UnassignedPanel from '$lib/components/booking/UnassignedPanel.svelte';

	let { data }: { data: PageData } = $props();

	let findRoomOpen = $state(false);
	let otaImportOpen = $state(false);

	const allUnassigned = $derived([
		...data.unassigned.falcon,
		...data.unassigned.spanish
	]);
</script>

<svelte:head>
	<title>Booking Grid</title>
</svelte:head>

<div class="flex flex-col min-h-0">
	<BookingFilters year={data.year} month={data.month} viewMode={data.viewMode as 'grid' | 'today'} />

	<!-- Quick-action toolbar -->
	<div class="border-border bg-background flex items-center gap-2 border-b px-4 py-2">
		<button
			onclick={() => { findRoomOpen = true; }}
			class="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted flex items-center gap-1.5"
		>
			🔍 Find Room
		</button>
		<button
			onclick={() => { otaImportOpen = true; }}
			class="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted flex items-center gap-1.5"
		>
			📥 OTA Import
		</button>
		{#if allUnassigned.length > 0}
			<a href="#unassigned"
				class="ml-auto rounded-md bg-amber-100 border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-200 flex items-center gap-1.5">
				⚠ {allUnassigned.length} unassigned arrival{allUnassigned.length === 1 ? '' : 's'}
			</a>
		{/if}
	</div>
</div>

{#if allUnassigned.length > 0}
	<div id="unassigned">
		<UnassignedPanel bookings={allUnassigned} today={data.today} />
	</div>
{/if}

{#if data.viewMode === 'today' && data.todayData}
	<TodayView
		arrivals={data.todayData.arrivals}
		departures={data.todayData.departures}
		inHouse={data.todayData.inHouse}
		unassigned={data.todayData.unassigned}
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

<FindRoomDialog
	bind:open={findRoomOpen}
	channels={data.channels}
	users={data.users}
	currentUserId={data.currentUserId}
	today={data.today}
/>

<OtaImportDialog
	bind:open={otaImportOpen}
	channels={data.channels}
	users={data.users}
	currentUserId={data.currentUserId}
	today={data.today}
/>
