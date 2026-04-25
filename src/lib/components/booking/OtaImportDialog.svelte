<script lang="ts">
	/**
	 * OTA Import wizard — 3 steps:
	 *  1. Enter guest details + dates + OTA confirmation # from the email
	 *  2. Pick an available room (shows bed/kitchen info clearly)
	 *  3. Confirm summary → create booking directly (no SlipFormDialog hand-off)
	 *
	 * After creation the operator is linked straight to the check-in page.
	 */
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import RoomStripCard, { type AvailableRoom } from './RoomStripCard.svelte';

	type Channel = { id: string; name: string };
	type User = { id: string; name: string };

	// AvailableRoom type is imported from RoomStripCard

	type Props = {
		open: boolean;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		today: string;
	};

	let { open = $bindable(false), channels, users, currentUserId, today }: Props = $props();

	// ─── Step ─────────────────────────────────────────────────────────────────

	type Step = 'details' | 'rooms' | 'confirm';
	let step = $state<Step>('details');

	// ─── Step 1 — OTA details ─────────────────────────────────────────────────

	const otaChannels = $derived(channels.filter((c) => c.name !== 'Direct'));
	let otaChannelId = $state(
		channels.find((c) => c.name === 'Booking.com')?.id
		?? channels.find((c) => c.name !== 'Direct')?.id
		?? channels[0]?.id
		?? ''
	);
	let guestName = $state('');
	let guestPhone = $state('');
	let checkIn = $state(today);
	let checkOut = $state(today);
	let otaConfirmation = $state('');
	let otaNotes = $state('');
	let step1Error = $state('');

	function validateStep1(): boolean {
		if (!guestName.trim()) { step1Error = 'Guest name is required'; return false; }
		if (checkIn >= checkOut) { step1Error = 'Check-out must be after check-in'; return false; }
		step1Error = '';
		return true;
	}

	// ─── Step 2 — Room selection ──────────────────────────────────────────────

	let availableRooms = $state<AvailableRoom[]>([]);
	let loadingRooms = $state(false);
	let selectedRoom = $state<AvailableRoom | null>(null);

	// Type filter — operator clicks the category that matches the OTA email
	let typeFilter = $state<string | null>(null);
	const uniqueCategories = $derived(
		[...new Set(availableRooms.map((r) => r.category).filter((c): c is string => c !== null))].sort()
	);
	const filteredRooms = $derived(
		typeFilter ? availableRooms.filter((r) => r.category === typeFilter) : availableRooms
	);

	async function loadRooms() {
		if (!validateStep1()) return;
		loadingRooms = true;
		typeFilter = null;
		try {
			const res = await fetch(`/api/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}&minBeds=1&kitchen=0`);
			if (!res.ok) throw new Error('Server error');
			availableRooms = await res.json();
			step = 'rooms';
		} catch {
			step1Error = 'Could not load available rooms — please try again';
		} finally {
			loadingRooms = false;
		}
	}

	function bedLabel(r: AvailableRoom): string {
		const parts: string[] = [];
		if (r.kingBeds > 0) parts.push(`${r.kingBeds}K`);
		if (r.queenBeds > 0) parts.push(`${r.queenBeds}Q`);
		if (r.doubleBeds > 0) parts.push(`${r.doubleBeds}D`);
		if (r.hasHideabed) parts.push('Sb');
		const beds = parts.join('+') || '—';
		return r.hasKitchen ? `${beds} ✦` : beds;
	}

	function nightCount(): number {
		return Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
	}

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	function formatDate(iso: string): string {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short', month: 'short', day: 'numeric'
		});
	}

	// ─── Step 3 — Confirm + create ────────────────────────────────────────────

	let submitting = $state(false);
	let submitError = $state('');

	function pickRoom(room: AvailableRoom) {
		selectedRoom = room;
		step = 'confirm';
	}

	// ─── Reset ────────────────────────────────────────────────────────────────

	function reset() {
		step = 'details';
		guestName = '';
		guestPhone = '';
		checkIn = today;
		checkOut = today;
		otaConfirmation = '';
		otaNotes = '';
		selectedRoom = null;
		availableRooms = [];
		step1Error = '';
		submitError = '';
	}

	$effect(() => {
		// Reset wizard when dialog is re-opened
		if (open) reset();
	});

	const titles: Record<Step, string> = {
		details: 'OTA Import — Guest Details',
		rooms: 'OTA Import — Select Room',
		confirm: 'OTA Import — Confirm Booking'
	};
</script>

<CustomDialog bind:open title={titles[step]} dialogClass="sm:max-w-lg">
	{#snippet content()}
		<div class="flex flex-col gap-4 p-1">

			<!-- ── Step 1: Details ──────────────────────────────────────────── -->
			{#if step === 'details'}
				<!-- Channel -->
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="otaCh">OTA Source</label>
					<select id="otaCh" bind:value={otaChannelId}
						class="w-full border border-input rounded px-3 py-2 text-sm bg-background">
						{#each channels as ch}
							<option value={ch.id}>{ch.name}</option>
						{/each}
					</select>
				</div>

				<!-- Guest name + phone -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-muted-foreground mb-0.5" for="otaName">Guest Name *</label>
						<input id="otaName" type="text" bind:value={guestName} placeholder="John Doe"
							class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
					</div>
					<div>
						<label class="block text-xs text-muted-foreground mb-0.5" for="otaPhone">Phone (optional)</label>
						<input id="otaPhone" type="tel" bind:value={guestPhone} placeholder="+1 555 000 0000"
							class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
					</div>
				</div>

				<!-- Dates -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-muted-foreground mb-0.5" for="otaCI">Check-in *</label>
					<input id="otaCI" type="date" bind:value={checkIn}
						oninput={() => { if (checkOut <= checkIn) checkOut = advanceDay(checkIn); }}
						class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
				</div>
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="otaCO">Check-out *</label>
					<input id="otaCO" type="date" bind:value={checkOut}
						class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
					</div>
				</div>

				<!-- OTA confirmation # -->
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="otaRef">OTA Confirmation # (optional)</label>
					<input id="otaRef" type="text" bind:value={otaConfirmation} placeholder="e.g. BDC-12345678"
						class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
				</div>

				<!-- Notes -->
				<div>
					<label class="block text-xs text-muted-foreground mb-0.5" for="otaNotes2">Notes (optional)</label>
					<input id="otaNotes2" type="text" bind:value={otaNotes} placeholder="Special requests, party size, etc."
						class="w-full border border-input rounded px-3 py-2 text-sm bg-background" />
				</div>

				{#if step1Error}
					<p class="text-destructive text-xs">{step1Error}</p>
				{/if}

				<Button onclick={loadRooms} disabled={loadingRooms} class="w-full">
					{loadingRooms ? 'Searching rooms…' : 'Find Available Rooms →'}
				</Button>

			<!-- ── Step 2: Room list ─────────────────────────────────────────── -->
			{:else if step === 'rooms'}
				<!-- Header -->
				<div class="flex items-center justify-between gap-2">
					<button onclick={() => { step = 'details'; }}
						class="text-xs text-muted-foreground hover:text-foreground shrink-0">← Back</button>
					<span class="text-xs text-muted-foreground text-right">
						<strong>{guestName}</strong> · {formatDate(checkIn)} → {formatDate(checkOut)} · {nightCount()}n
					</span>
				</div>

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
					<p class="text-[11px] text-muted-foreground -mt-1">
						Tip: match the category shown on the OTA confirmation email.
					</p>
				{/if}

				{#if filteredRooms.length === 0}
					<p class="text-muted-foreground text-sm text-center py-6">
						{availableRooms.length === 0
							? 'No rooms available for those dates.'
							: 'No rooms match that type filter.'}
					</p>
				{:else}
					<div class="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
						{#each filteredRooms as room (room.id)}
							<RoomStripCard
								{room}
								{checkIn}
								{checkOut}
								actionLabel="Assign →"
								onAssign={pickRoom}
							/>
						{/each}
					</div>
				{/if}

			<!-- ── Step 3: Confirm ────────────────────────────────────────────── -->
			{:else if step === 'confirm' && selectedRoom}
				<button onclick={() => { step = 'rooms'; }}
					class="text-xs text-muted-foreground hover:text-foreground">← Back to rooms</button>

				<!-- Summary card -->
				<div class="rounded-lg border border-border bg-muted/20 p-4 text-sm space-y-2">
					<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
						<span class="text-muted-foreground text-xs font-medium">Guest</span>
						<span class="font-semibold">{guestName}{guestPhone ? ` · ${guestPhone}` : ''}</span>

						<span class="text-muted-foreground text-xs font-medium">Property</span>
						<span>{selectedRoom.propertyName}</span>

						<span class="text-muted-foreground text-xs font-medium">Room</span>
						<span class="font-mono font-semibold">{selectedRoom.roomNumber}
							<span class="font-mono font-normal text-muted-foreground text-xs ml-1">{bedLabel(selectedRoom)}</span>
						</span>

						<span class="text-muted-foreground text-xs font-medium">Dates</span>
						<span>{formatDate(checkIn)} → {formatDate(checkOut)}
							<span class="text-muted-foreground text-xs ml-1">({nightCount()} night{nightCount() === 1 ? '' : 's'})</span>
						</span>

						<span class="text-muted-foreground text-xs font-medium">Channel</span>
						<span>{channels.find((c) => c.id === otaChannelId)?.name ?? '—'}</span>

						{#if otaConfirmation}
							<span class="text-muted-foreground text-xs font-medium">OTA Ref #</span>
							<span class="font-mono">{otaConfirmation}</span>
						{/if}

						{#if otaNotes}
							<span class="text-muted-foreground text-xs font-medium">Notes</span>
							<span class="italic">{otaNotes}</span>
						{/if}
					</div>
				</div>

				{#if submitError}
					<p class="text-destructive text-xs">{submitError}</p>
				{/if}

				<!-- Submit via hidden form -->
				<form
					method="POST"
					action="?/createBooking"
					use:enhance={() => {
						submitting = true;
						submitError = '';
						return async ({ result }) => {
							submitting = false;
							if (result.type === 'success') {
								const bookingId = (result.data as { bookingId?: string })?.bookingId;
								open = false;
								if (bookingId) {
									await goto(`/booking/${bookingId}/checkin`);
								}
							} else if (result.type === 'failure') {
								submitError = (result.data as { error?: string })?.error ?? 'Could not create booking';
							}
						};
					}}
				>
					<input type="hidden" name="propertyId" value={selectedRoom.propertyId} />
					<input type="hidden" name="roomId" value={selectedRoom.id} />
					<input type="hidden" name="guestName" value={guestName} />
					<input type="hidden" name="guestPhone" value={guestPhone.replace(/\D/g, '')} />
					<input type="hidden" name="channelId" value={otaChannelId} />
					<input type="hidden" name="checkIn" value={checkIn} />
					<input type="hidden" name="checkOut" value={checkOut} />
					<input type="hidden" name="otaConfirmationNumber" value={otaConfirmation} />
					<input type="hidden" name="notes" value={otaNotes} />
					<input type="hidden" name="clerkUserId" value={currentUserId} />

					<Button type="submit" class="w-full" disabled={submitting}>
						{submitting ? 'Creating booking…' : '✓ Create OTA Booking → Check-in'}
					</Button>
				</form>
			{/if}
		</div>
	{/snippet}
</CustomDialog>
