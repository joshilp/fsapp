<script lang="ts">
	import type { PageData } from './$types';
	import BookingGrid from '$lib/components/booking/BookingGrid.svelte';
	import BookingFilters from '$lib/components/booking/BookingFilters.svelte';
	import BookingCard from '$lib/components/booking/BookingCard.svelte';
	import GroupCard from '$lib/components/booking/GroupCard.svelte';
	import TodayView from '$lib/components/booking/TodayView.svelte';
	import OtaImportDialog from '$lib/components/booking/OtaImportDialog.svelte';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import type { UnassignedBooking } from '$lib/server/booking-queries';

	let { data }: { data: PageData } = $props();

	// ── Shared cross-grid state ────────────────────────────────────────────────

	let sharedCheckIn  = $state('');
	let sharedCheckOut = $state('');
	let sharedDrawMode = $state(false);

	// Collect draw selections from each grid
	type DrawSel = { roomId: string; roomNumber: string; startDay: number; endDay: number; configs: string[] | null; propertyId: string; propertyName: string };
	let falconSelections = $state<DrawSel[]>([]);
	let spanishSelections = $state<DrawSel[]>([]);
	const allDrawSelections = $derived([...falconSelections, ...spanishSelections]);

	// Page-level group card (for cross-property groups from draw mode)
	type GroupRoom = { roomId: string; roomNumber: string; checkIn: string; checkOut: string; roomConfigs: string[] };
	let groupCardOpen  = $state(false);
	let groupCardRooms = $state<GroupRoom[]>([]);

	function openGroupCard(rooms: GroupRoom[]) {
		groupCardRooms = rooms;
		groupCardOpen = true;
		sharedDrawMode = false;
		falconSelections = [];
		spanishSelections = [];
	}
	// Single-room from grid still uses BookingCard (handled inside BookingGrid itself)

	// ── Unassigned bookings modal ──────────────────────────────────────────────

	const allUnassigned = $derived([
		...data.unassigned.falcon,
		...data.unassigned.spanish
	]);
	let unassignedOpen = $state(false);

	/** Point the ghost-bar filter at this booking's dates and close modal */
	function findOnGrid(b: UnassignedBooking) {
		sharedCheckIn  = b.checkInDate;
		sharedCheckOut = b.checkOutDate;
		unassignedOpen = false;
	}

	// ── Other dialogs ─────────────────────────────────────────────────────────

	let otaImportOpen = $state(false);

	// ── Date helpers ──────────────────────────────────────────────────────────

	/** Convert a grid day number (1-indexed) back to ISO date using the page's startDate */
	function dayNumToIso(dayNum: number) {
		const start = data.startDate;
		const ms = new Date(start + 'T12:00:00').getTime() + (dayNum - 1) * 86400000;
		return new Date(ms).toISOString().slice(0, 10);
	}

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short', month: 'short', day: 'numeric'
		});
	}
	function nights(b: UnassignedBooking) {
		return Math.max(0, Math.round(
			(new Date(b.checkOutDate).getTime() - new Date(b.checkInDate).getTime()) / 86400000
		));
	}
	function isOverdue(b: UnassignedBooking) { return b.checkInDate <= data.today; }
</script>

<svelte:head>
	<title>Booking Grid</title>
</svelte:head>

<div class="flex flex-col min-h-0">
	<BookingFilters startDate={data.startDate} numDays={data.numDays} viewMode={data.viewMode as 'grid' | 'today'}>
		{#snippet actions()}
			<button
				onclick={() => { otaImportOpen = true; }}
				class="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5 h-8"
			>
				📥 OTA Import
			</button>
			{#if allUnassigned.length > 0}
				<button
					onclick={() => { unassignedOpen = true; }}
					class="rounded-md bg-amber-100 border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200 flex items-center gap-1.5 h-8"
				>
					⚠ {allUnassigned.length} unassigned
				</button>
			{/if}
		{/snippet}
	</BookingFilters>
</div>

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
					bind:filterCheckIn={sharedCheckIn}
					bind:filterCheckOut={sharedCheckOut}
					bind:drawMode={sharedDrawMode}
					onDrawSelectionsChange={(s) => { falconSelections = s; }}
					onGroupBook={openGroupCard}
				/>
			</div>
			<div class="min-w-0 flex-1">
				<BookingGrid
					grid={data.spanish}
					today={data.today}
					channels={data.channels}
					users={data.users}
					currentUserId={data.currentUserId}
					bind:filterCheckIn={sharedCheckIn}
					bind:filterCheckOut={sharedCheckOut}
					bind:drawMode={sharedDrawMode}
					onDrawSelectionsChange={(s) => { spanishSelections = s; }}
					onGroupBook={openGroupCard}
				/>
			</div>
		</div>

		<!-- Draw mode summary panel (collects from BOTH grids) -->
		{#if allDrawSelections.length > 0}
			<div class="sticky bottom-0 z-30 border-t border-orange-200 bg-orange-50 px-4 py-2 flex flex-wrap items-center gap-3">
				<span class="text-sm font-semibold text-orange-800">
					{allDrawSelections.length} room{allDrawSelections.length === 1 ? '' : 's'} selected
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each allDrawSelections as sel}
						<span class="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-white px-2 py-0.5 text-xs text-orange-700">
							<span class="text-muted-foreground text-[10px]">{sel.propertyName.split(' ')[0]}</span>
							Rm {sel.roomNumber}
							<button
								onclick={() => {
									falconSelections  = falconSelections.filter(s => s.roomId !== sel.roomId);
									spanishSelections = spanishSelections.filter(s => s.roomId !== sel.roomId);
								}}
								class="text-orange-400 hover:text-orange-700">×</button>
						</span>
					{/each}
				</div>
				<div class="ml-auto flex gap-2">
					<button
						onclick={() => { falconSelections = []; spanishSelections = []; }}
						class="text-xs text-orange-600 hover:text-orange-800">Clear all</button>
					<button
						onclick={() => openGroupCard(allDrawSelections.map(s => ({
							roomId: s.roomId, roomNumber: s.roomNumber,
							checkIn: dayNumToIso(s.startDay),
							checkOut: dayNumToIso(s.endDay + 1),
							roomConfigs: s.configs ?? []
						})))}
						class="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
						Book {allDrawSelections.length} room{allDrawSelections.length === 1 ? '' : 's'} →
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Unassigned bookings modal -->
<CustomDialog bind:open={unassignedOpen} title="Unassigned Online Bookings" description="These bookings need a room assigned before check-in." dialogClass="sm:max-w-2xl">
	{#snippet content()}
		<div class="space-y-2 p-1">
			{#each allUnassigned as b (b.id)}
				<div class={[
					'flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-background text-sm',
					isOverdue(b) ? 'border-red-300 bg-red-50/30' : 'border-border'
				].join(' ')}>
					{#if isOverdue(b)}
						<span class="shrink-0 text-xs font-bold text-red-600 uppercase">Today!</span>
					{/if}
					<div class="flex-1 min-w-0">
						<div class="flex items-baseline gap-2 flex-wrap">
							<span class="font-semibold">{b.guestName ?? 'Unknown'}</span>
							{#if b.requestedTypeName}
								<span class="text-xs text-muted-foreground">{b.requestedTypeName}</span>
							{/if}
							<span class="text-xs text-muted-foreground">{fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)} ({nights(b)}n)</span>
							{#if b.quotedTotalCents}
								<span class="text-xs font-semibold text-emerald-700">${(b.quotedTotalCents / 100).toFixed(0)} quoted</span>
							{/if}
						</div>
						<div class="flex items-center gap-2 mt-0.5">
							<span class="text-xs text-muted-foreground">{b.propertyName}</span>
							{#if b.channelName}
								<span class="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5">Online</span>
							{/if}
						</div>
					</div>
					<button
						onclick={() => findOnGrid(b)}
						class="shrink-0 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
						title="Show available rooms for these dates on the grid">
						Find Room on Grid →
					</button>
				</div>
			{/each}
			{#if allUnassigned.length === 0}
				<p class="text-center text-sm text-muted-foreground py-6">All bookings assigned.</p>
			{/if}
		</div>
	{/snippet}
</CustomDialog>

<!-- Page-level GroupCard for cross-property group bookings from draw mode -->
<GroupCard
	bind:open={groupCardOpen}
	newRooms={groupCardRooms.length ? groupCardRooms.map(r => ({
		roomId: r.roomId,
		roomNumber: r.roomNumber,
		propertyName: '', 
		checkIn: r.checkIn,
		checkOut: r.checkOut,
		roomConfigs: r.roomConfigs
	})) : undefined}
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
