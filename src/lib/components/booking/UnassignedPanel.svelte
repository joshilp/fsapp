<script lang="ts">
	import type { UnassignedBooking } from '$lib/server/booking-queries';
	import type { AvailableRoom } from './RoomStripCard.svelte';
	import RoomStripCard from './RoomStripCard.svelte';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { invalidateAll } from '$app/navigation';

	type Props = {
		bookings: UnassignedBooking[];
		today: string;
	};

	let { bookings, today }: Props = $props();

	// ─── Assign dialog ─────────────────────────────────────────────────────────

	let assignOpen = $state(false);
	let assignBooking = $state<UnassignedBooking | null>(null);
	let availableRooms = $state<AvailableRoom[]>([]);
	let loadingRooms = $state(false);
	let assignError = $state('');
	let assigning = $state(false);
	let typeFilter = $state<string | null>(null);

	const uniqueCategories = $derived(
		[...new Set(availableRooms.map(r => r.category).filter((c): c is string => c !== null))].sort()
	);
	const filteredRooms = $derived(
		typeFilter ? availableRooms.filter(r => r.category === typeFilter) : availableRooms
	);

	async function openAssign(b: UnassignedBooking) {
		assignBooking = b;
		assignOpen = true;
		assignError = '';
		typeFilter = b.requestedTypeCategory; // pre-filter to their requested type
		loadingRooms = true;
		try {
			const res = await fetch(
				`/api/rooms/available?checkIn=${b.checkInDate}&checkOut=${b.checkOutDate}&minBeds=1&kitchen=0`
			);
			if (!res.ok) throw new Error();
			const all: AvailableRoom[] = await res.json();
			// Filter to the correct property
			availableRooms = all.filter(r => r.propertyId === b.propertyId);
		} catch {
			assignError = 'Could not load available rooms.';
		} finally {
			loadingRooms = false;
		}
	}

	async function assignRoom(room: AvailableRoom) {
		if (!assignBooking) return;
		assigning = true;
		assignError = '';
		try {
			const res = await fetch(`/api/booking/${assignBooking.id}/assign-room`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ roomId: room.id })
			});
			const data = await res.json();
			if (!res.ok) {
				assignError = data.error ?? 'Could not assign room.';
				assigning = false;
				return;
			}
			assignOpen = false;
			await invalidateAll();
		} catch {
			assignError = 'Network error — please try again.';
		} finally {
			assigning = false;
		}
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
	function isOverdue(b: UnassignedBooking) { return b.checkInDate <= today; }
</script>

<!-- Banner -->
<div class="border-b border-amber-200 bg-amber-50 px-4 py-3">
	<div class="flex items-center justify-between mb-2">
		<h3 class="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
			<span class="text-base">⚠</span>
			Unassigned Online Bookings — Room Assignment Needed
		</h3>
		<span class="text-xs text-amber-700">{bookings.length} pending</span>
	</div>

	<div class="space-y-2">
		{#each bookings as b (b.id)}
			<div class={[
				'flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-white text-sm',
				isOverdue(b) ? 'border-red-300' : 'border-amber-200'
			].join(' ')}>
				<!-- Overdue indicator -->
				{#if isOverdue(b)}
					<span class="shrink-0 text-xs font-bold text-red-600 uppercase">Today!</span>
				{/if}

				<div class="flex-1 min-w-0">
					<div class="flex items-baseline gap-2 flex-wrap">
						<span class="font-semibold text-stone-900">{b.guestName ?? 'Unknown Guest'}</span>
						{#if b.requestedTypeName}
							<span class="text-xs text-stone-500">{b.requestedTypeName}</span>
						{/if}
						<span class="text-xs text-stone-400">·</span>
						<span class="text-xs text-stone-500">{fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)} ({nights(b)}n)</span>
						{#if b.quotedTotalCents}
							<span class="text-xs font-semibold text-emerald-700">
								Quoted ${(b.quotedTotalCents / 100).toFixed(0)}
							</span>
						{:else}
							<span class="text-xs text-amber-600">No rate quoted</span>
						{/if}
					</div>
					<div class="flex items-center gap-2 mt-0.5">
						<span class="text-xs text-stone-400">{b.propertyName}</span>
						{#if b.channelName}
							<span class="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5">Online</span>
						{/if}
						{#if b.guestEmail}
							<span class="text-xs text-stone-400 truncate">{b.guestEmail}</span>
						{/if}
					</div>
				</div>

				<Button size="sm" onclick={() => openAssign(b)} class="shrink-0">
					Assign Room →
				</Button>
			</div>
		{/each}
	</div>
</div>

<!-- Assign Room Dialog -->
<CustomDialog bind:open={assignOpen} title="Assign Room" dialogClass="sm:max-w-lg">
	{#snippet content()}
		{#if assignBooking}
			<div class="flex flex-col gap-4 p-1">
				<!-- Summary -->
				<div class="rounded-lg bg-muted/30 border border-border px-3 py-2.5 text-sm space-y-0.5">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p><strong>{assignBooking.guestName}</strong> · {assignBooking.propertyName}</p>
							<p class="text-muted-foreground text-xs">
								{fmtDate(assignBooking.checkInDate)} → {fmtDate(assignBooking.checkOutDate)} · {nights(assignBooking)}n
								{#if assignBooking.requestedTypeName}· Requested: {assignBooking.requestedTypeName}{/if}
							</p>
						</div>
						{#if assignBooking.quotedTotalCents}
							<div class="text-right shrink-0">
								<p class="text-[10px] text-muted-foreground">Quoted to guest</p>
								<p class="font-bold text-emerald-700">${(assignBooking.quotedTotalCents / 100).toFixed(0)}</p>
								<p class="text-[10px] text-muted-foreground">before tax</p>
							</div>
						{:else}
							<span class="text-xs text-amber-600 shrink-0">No rate saved</span>
						{/if}
					</div>
				</div>

				<!-- Type filter chips -->
				{#if uniqueCategories.length > 1}
					<div class="flex flex-wrap gap-1.5">
						<button onclick={() => { typeFilter = null; }}
							class={['rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
								typeFilter === null ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
							].join(' ')}>All</button>
						{#each uniqueCategories as cat}
							<button onclick={() => { typeFilter = cat === typeFilter ? null : cat; }}
								class={['rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
									typeFilter === cat ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
								].join(' ')}>{cat}</button>
						{/each}
					</div>
				{/if}

				{#if assignError}
					<p class="text-destructive text-xs">{assignError}</p>
				{/if}

				{#if loadingRooms}
					<p class="text-muted-foreground text-sm text-center py-6">Loading available rooms…</p>
				{:else if filteredRooms.length === 0}
					<p class="text-muted-foreground text-sm text-center py-6">
						{availableRooms.length === 0 ? 'No rooms available for those dates.' : 'No rooms match that type.'}
					</p>
				{:else}
					<div class="space-y-2 max-h-[400px] overflow-y-auto pr-0.5">
						{#each filteredRooms as room (room.id)}
							<RoomStripCard
								{room}
								checkIn={assignBooking.checkInDate}
								checkOut={assignBooking.checkOutDate}
								actionLabel={assigning ? 'Assigning…' : 'Assign →'}
								onAssign={assignRoom}
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</CustomDialog>
