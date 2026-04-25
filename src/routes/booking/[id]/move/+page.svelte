<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const { booking, propertyRooms } = $derived(data);

	// Default move date: tomorrow (or check-in + 1 if that's closer)
	function defaultMoveDate(): string {
		const checkIn = new Date(booking.checkInDate + 'T12:00:00');
		const checkOut = new Date(booking.checkOutDate + 'T12:00:00');
		const tomorrow = new Date();
		tomorrow.setHours(12, 0, 0, 0);
		tomorrow.setDate(tomorrow.getDate() + 1);
		// Pick tomorrow unless it's out of range; clamp to (checkIn+1)
		const minDate = new Date(checkIn);
		minDate.setDate(minDate.getDate() + 1);
		const maxDate = new Date(checkOut);
		maxDate.setDate(maxDate.getDate() - 1);
		const candidate = tomorrow < minDate ? minDate : tomorrow > maxDate ? maxDate : tomorrow;
		return candidate.toISOString().slice(0, 10);
	}

	let moveDate = $state(defaultMoveDate());
	let newRoomId = $state('');
	let carryNotes = $state(true);
	let moveNotes = $state('');
	let error = $state('');
	let submitting = $state(false);

	const backHref = $derived(() => {
		const [y, m] = booking.checkInDate.split('-');
		return `/booking?month=${y}-${m}`;
	});

	// Nights before move (original booking will be shortened)
	const nightsBefore = $derived(() => {
		if (!moveDate) return 0;
		const ms = new Date(moveDate).getTime() - new Date(booking.checkInDate).getTime();
		return Math.max(0, Math.round(ms / 86400000));
	});

	// Nights after move (in new room)
	const nightsAfter = $derived(() => {
		if (!moveDate) return 0;
		const ms = new Date(booking.checkOutDate).getTime() - new Date(moveDate).getTime();
		return Math.max(0, Math.round(ms / 86400000));
	});

	// Bed config compact label
	type Room = (typeof propertyRooms)[0];
	function roomLabel(r: Room): string {
		const parts: string[] = [];
		if (r.kingBeds > 0) parts.push(r.kingBeds === 1 ? '1K' : `${r.kingBeds}K`);
		if (r.queenBeds > 0) parts.push(r.queenBeds === 1 ? '1Q' : `${r.queenBeds}Q`);
		if (r.doubleBeds > 0) parts.push(r.doubleBeds === 1 ? '1D' : `${r.doubleBeds}D`);
		if (r.hasHideabed) parts.push('Sb');
		const beds = parts.join('+');
		const kitchen = r.hasKitchen ? ' ✦' : '';
		const type = r.roomType ? ` — ${r.roomType.name}` : '';
		return `Rm ${r.roomNumber}  ${beds || '—'}${kitchen}${type}`;
	}

	const moveDateMin = $derived(
		(() => {
			const d = new Date(booking.checkInDate + 'T12:00:00');
			d.setDate(d.getDate() + 1);
			return d.toISOString().slice(0, 10);
		})()
	);

	const moveDateMax = $derived(
		(() => {
			const d = new Date(booking.checkOutDate + 'T12:00:00');
			d.setDate(d.getDate() - 1);
			return d.toISOString().slice(0, 10);
		})()
	);

	// Available rooms = all active rooms except current room
	const availableRooms = $derived(propertyRooms.filter((r) => r.id !== booking.roomId));
</script>

<svelte:head>
	<title>Move Guest — Room {booking.room?.roomNumber}</title>
</svelte:head>

<div class="mx-auto max-w-lg px-4 py-6">
	<a href={backHref()} class="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm">
		← Back to grid
	</a>

	<h1 class="mb-1 text-lg font-bold">Move Guest</h1>
	<p class="text-muted-foreground mb-6 text-sm">
		{booking.guest?.name ?? 'Guest'} · currently Room {booking.room?.roomNumber}
		· checkout {booking.checkOutDate}
	</p>

	{#if error}
		<div class="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">{error}</div>
	{/if}

	<!-- Summary boxes -->
	<div class="mb-6 grid grid-cols-2 gap-3">
		<div class="bg-muted/40 rounded-lg border p-3">
			<p class="text-muted-foreground mb-0.5 text-xs font-medium">Current room</p>
			<p class="font-mono font-semibold">Rm {booking.room?.roomNumber}</p>
			<p class="text-muted-foreground text-xs">
				{booking.checkInDate} →
				{#if moveDate && nightsBefore() > 0}
					<span class="text-foreground font-medium">{moveDate}</span>
					<span class="ml-1">({nightsBefore()} night{nightsBefore() === 1 ? '' : 's'})</span>
				{:else}
					{booking.checkOutDate}
				{/if}
			</p>
		</div>
		<div class="bg-muted/40 rounded-lg border p-3">
			<p class="text-muted-foreground mb-0.5 text-xs font-medium">New room</p>
			<p class="font-mono font-semibold">
				{#if newRoomId}
					Rm {propertyRooms.find((r) => r.id === newRoomId)?.roomNumber ?? '?'}
				{:else}
					—
				{/if}
			</p>
			<p class="text-muted-foreground text-xs">
				{#if moveDate && nightsAfter() > 0}
					<span class="text-foreground font-medium">{moveDate}</span>
					→ {booking.checkOutDate}
					<span class="ml-1">({nightsAfter()} night{nightsAfter() === 1 ? '' : 's'})</span>
				{:else}
					—
				{/if}
			</p>
		</div>
	</div>

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			error = '';
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'failure') {
					error = (result.data?.error as string) ?? 'Error saving';
					await update({ reset: false });
				} else {
					await update();
				}
			};
		}}
		class="flex flex-col gap-5"
	>
		<!-- Move date -->
		<div class="flex flex-col gap-1.5">
			<Label for="moveDate">Move date <span class="text-muted-foreground font-normal">(guest switches rooms this morning)</span></Label>
			<Input
				id="moveDate"
				name="moveDate"
				type="date"
				bind:value={moveDate}
				min={moveDateMin}
				max={moveDateMax}
				required
			/>
			{#if nightsBefore() > 0 && nightsAfter() > 0}
				<p class="text-muted-foreground text-xs">
					Original booking shortened to {nightsBefore()} night{nightsBefore() === 1 ? '' : 's'};
					new booking created for {nightsAfter()} night{nightsAfter() === 1 ? '' : 's'}.
				</p>
			{:else if moveDate}
				<p class="text-destructive text-xs">Move date must be between check-in and check-out.</p>
			{/if}
		</div>

		<!-- New room -->
		<div class="flex flex-col gap-1.5">
			<Label for="newRoomId">Move to room</Label>
			<select
				id="newRoomId"
				name="newRoomId"
				bind:value={newRoomId}
				required
				class="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
			>
				<option value="" disabled>Select room…</option>
				{#each availableRooms as r}
					<option value={r.id}>{roomLabel(r)}</option>
				{/each}
			</select>
		</div>

		<!-- Notes -->
		<div class="space-y-2">
			{#if booking.notes}
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<input type="checkbox" name="carryNotes" bind:checked={carryNotes} class="rounded" />
					Carry over existing notes: <span class="text-muted-foreground italic">"{booking.notes}"</span>
				</label>
			{/if}
			<div class="flex flex-col gap-1.5">
				<Label for="moveNotes">Move notes <span class="text-muted-foreground font-normal">(optional)</span></Label>
				<Input
					id="moveNotes"
					name="moveNotes"
					bind:value={moveNotes}
					placeholder="e.g. Guest requested quieter room"
				/>
			</div>
		</div>

		<div class="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
			<p class="font-semibold">After moving:</p>
			<ul class="list-disc pl-4 space-y-0.5">
				<li>The original booking ends at the move date. Review its line items if needed.</li>
				<li>You'll be taken to the new booking's registration card to set rates for remaining nights.</li>
			</ul>
		</div>

		<div class="flex justify-between pt-1">
			<a href={backHref()}><Button type="button" variant="ghost">Cancel</Button></a>
			<Button
				type="submit"
				disabled={submitting || !newRoomId || nightsBefore() <= 0 || nightsAfter() <= 0}
			>
				{submitting ? 'Moving…' : 'Move Guest →'}
			</Button>
		</div>
	</form>
</div>
