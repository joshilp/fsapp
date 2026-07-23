<script lang="ts">
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import SlipFormDialog from './SlipFormDialog.svelte';
	import RoomStripCard, { type AvailableRoom } from './RoomStripCard.svelte';

	type Channel = { id: string; name: string };
	type User = { id: string; name: string };

	type Props = {
		open: boolean;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		today: string;
	};

	let { open = $bindable(false), channels, users, currentUserId, today }: Props = $props();

	let checkIn = $state(today);
	let checkOut = $state(today);
	let needKitchen = $state(false);
	let minBeds = $state(1);
	let searching = $state(false);
	let results = $state<AvailableRoom[]>([]);
	let searched = $state(false);
	let searchError = $state('');

	// Type filter
	let typeFilter = $state<string | null>(null);
	const uniqueCategories = $derived(
		[...new Set(results.map((r) => r.category).filter((c): c is string => c !== null))].sort()
	);
	const filteredResults = $derived(
		typeFilter ? results.filter((r) => r.category === typeFilter) : results
	);

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	async function search() {
		if (checkIn >= checkOut) { searchError = 'Check-out must be after check-in'; return; }
		searchError = '';
		searching = true;
		searched = false;
		typeFilter = null;
		try {
			const params = new URLSearchParams({
				checkIn, checkOut,
				minBeds: String(minBeds),
				kitchen: needKitchen ? '1' : '0'
			});
			const res = await fetch(`/api/rooms/available?${params}`);
			if (!res.ok) throw new Error('Server error');
			results = await res.json();
			searched = true;
		} catch {
			searchError = 'Could not search — please try again';
		} finally {
			searching = false;
		}
	}

	// Slip form state
	let slipOpen = $state(false);
	let selectedRoom = $state<AvailableRoom | null>(null);

	function selectRoom(room: AvailableRoom) {
		selectedRoom = room;
		open = false;
		slipOpen = true;
	}
</script>

<CustomDialog bind:open title="Find Available Room" description="Search across all properties" dialogClass="sm:max-w-lg">
	{#snippet content()}
		<div class="flex flex-col gap-4 p-1">
			<!-- Search filters -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="findCheckIn">Check-in</label>
				<input id="findCheckIn" type="date" bind:value={checkIn}
					oninput={() => { if (checkOut <= checkIn) checkOut = advanceDay(checkIn); }}
					class="w-full border border-input rounded px-2 py-1.5 text-sm bg-background" />
				</div>
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="findCheckOut">Check-out</label>
					<input id="findCheckOut" type="date" bind:value={checkOut}
						class="w-full border border-input rounded px-2 py-1.5 text-sm bg-background" />
				</div>
			</div>

			<div class="flex items-center gap-4">
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="findMinBeds">Min beds</label>
					<select id="findMinBeds" bind:value={minBeds}
						class="border border-input rounded px-2 py-1.5 text-sm bg-background">
						<option value={1}>1+</option>
						<option value={2}>2+</option>
						<option value={3}>3+</option>
					</select>
				</div>
				<label class="flex items-center gap-2 cursor-pointer pt-4">
					<input type="checkbox" bind:checked={needKitchen} class="rounded" />
					<span class="text-sm">Kit required</span>
				</label>
			</div>

			{#if searchError}
				<p class="text-destructive text-xs">{searchError}</p>
			{/if}

			<Button onclick={search} disabled={searching} class="w-full">
				{searching ? 'Searching…' : 'Search'}
			</Button>

			<!-- Results -->
			{#if searched}
				<!-- Type filter chips -->
				{#if uniqueCategories.length > 1}
					<div class="flex flex-wrap gap-1.5">
						<button
							onclick={() => { typeFilter = null; }}
							class={[
								'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
								typeFilter === null
									? 'bg-foreground text-background border-foreground'
									: 'bg-background text-muted-foreground border-border hover:border-foreground/40'
							].join(' ')}
						>All</button>
						{#each uniqueCategories as cat}
							<button
								onclick={() => { typeFilter = cat === typeFilter ? null : cat; }}
								class={[
									'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
									typeFilter === cat
										? 'bg-foreground text-background border-foreground'
										: 'bg-background text-muted-foreground border-border hover:border-foreground/40'
								].join(' ')}
							>{cat}</button>
						{/each}
					</div>
				{/if}

				{#if filteredResults.length === 0}
					<p class="text-muted-foreground text-sm text-center py-4">
						{results.length === 0 ? 'No rooms available for those dates.' : 'No rooms match that filter.'}
					</p>
				{:else}
					<div class="space-y-2 max-h-[400px] overflow-y-auto pr-0.5">
						{#each filteredResults as room (room.id)}
							<RoomStripCard
								{room}
								{checkIn}
								{checkOut}
								actionLabel="Book →"
								onAssign={selectRoom}
							/>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}
</CustomDialog>

<!-- Slip form opens for selected room -->
{#if slipOpen && selectedRoom}
	<SlipFormDialog
		bind:open={slipOpen}
		propertyId={selectedRoom.propertyId}
		propertyName={selectedRoom.propertyName}
		roomId={selectedRoom.id}
		roomNumber={selectedRoom.roomNumber}
		roomConfigs={selectedRoom.configs}
		checkIn={checkIn}
		checkOut={checkOut}
		{channels}
		{users}
		{currentUserId}
		onSuccess={() => { slipOpen = false; selectedRoom = null; }}
	/>
{/if}
