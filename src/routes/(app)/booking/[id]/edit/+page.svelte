<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { booking, propertyRooms, channels } = $derived(data);

	let checkIn = $state(booking.checkInDate);
	let checkOut = $state(booking.checkOutDate);
	let roomId = $state(booking.roomId ?? '');
	let channelId = $state(booking.channelId ?? '');
	let notes = $state(booking.notes ?? '');
	let otaRef = $state(booking.otaConfirmationNumber ?? '');
	let error = $state('');
	let submitting = $state(false);

	const nights = $derived(() => {
		const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
		const n = Math.round(ms / 86400000);
		return n > 0 ? n : 0;
	});

	// ─── Quoted rate ──────────────────────────────────────────────────────────

	const existingRateTotal = $derived(
		(booking.lineItems ?? [])
			.filter((li) => li.type === 'rate' || li.type === 'extra')
			.reduce((s, li) => s + li.totalAmount, 0)
	);
	// Original night count and per-night rate (for auto-recalc)
	const originalNights = $derived(Math.round(
		(new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86400000
	));
	const perNightCents = $derived(
		existingRateTotal > 0 && originalNights > 0 ? existingRateTotal / originalNights : 0
	);
	// Dollar string for the editable input
	let quotedTotal = $state(existingRateTotal > 0 ? (existingRateTotal / 100).toFixed(2) : '');
	let rateOverridden = $state(false);

	const backHref = $derived(() => {
		const [y, m] = booking.checkInDate.split('-');
		return `/booking?month=${y}-${m}`;
	});

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	function autoRecalcRate() {
		if (rateOverridden || perNightCents === 0) return;
		const n = nights();
		if (n > 0) quotedTotal = ((perNightCents * n) / 100).toFixed(2);
	}

	function onCheckInChange() {
		if (checkOut <= checkIn) checkOut = advanceDay(checkIn);
		autoRecalcRate();
	}

	function onCheckOutChange() {
		autoRecalcRate();
	}
</script>

<svelte:head>
	<title>Edit Booking — Room {booking.room?.roomNumber}</title>
</svelte:head>

<div class="mx-auto max-w-lg px-4 py-6">
	<a href={backHref()} class="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-sm">
		← Back
	</a>

	<h1 class="mb-1 text-lg font-bold">Edit Booking</h1>
	<p class="text-muted-foreground mb-6 text-sm">
		{booking.guest?.name ?? 'Guest'} · currently Room {booking.room?.roomNumber}
	</p>

	{#if error}
		<div class="bg-destructive/10 text-destructive mb-4 rounded-md px-3 py-2 text-sm">{error}</div>
	{/if}

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
		class="flex flex-col gap-4"
	>
		<!-- Dates -->
		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-1.5">
				<Label for="checkIn">Check-in</Label>
				<Input id="checkIn" name="checkIn" type="date" bind:value={checkIn} oninput={onCheckInChange} required />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="checkOut">
					Check-out
					{#if nights() > 0}
						<span class="text-muted-foreground font-normal">({nights()} night{nights() === 1 ? '' : 's'})</span>
					{/if}
				</Label>
				<Input id="checkOut" name="checkOut" type="date" bind:value={checkOut} oninput={onCheckOutChange} required />
			</div>
		</div>

		<!-- Room move -->
		<div class="flex flex-col gap-1.5">
			<Label for="roomId">Room</Label>
			<select
				id="roomId"
				name="roomId"
				bind:value={roomId}
				class="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
			>
				{#each propertyRooms as r}
					<option value={r.id} selected={r.id === booking.roomId}>
						Room {r.roomNumber}{r.hasKitchen ? ' (kitchen)' : ''}
					</option>
				{/each}
			</select>
		</div>

		<!-- Channel -->
		<div class="flex flex-col gap-1.5">
			<Label>Channel</Label>
			<div class="flex flex-wrap gap-1.5">
				{#each channels as ch}
					<button
						type="button"
						class={[
							'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
							channelId === ch.id
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-border hover:bg-muted'
						].join(' ')}
						onclick={() => (channelId = ch.id)}
					>{ch.name}</button>
				{/each}
			</div>
			<input type="hidden" name="channelId" value={channelId} />
		</div>

		<!-- OTA ref (shown if channel is OTA) -->
		{#if channels.find((c) => c.id === channelId)?.name !== 'Direct'}
			<div class="flex flex-col gap-1.5">
				<Label for="otaRef">OTA confirmation #</Label>
				<Input id="otaRef" name="otaConfirmationNumber" bind:value={otaRef} />
			</div>
		{/if}

		<!-- Notes -->
		<div class="flex flex-col gap-1.5">
			<Label for="notes">Notes</Label>
			<textarea
				id="notes"
				name="notes"
				bind:value={notes}
				rows="2"
				class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
			></textarea>
		</div>

		<!-- Quoted rate -->
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center justify-between">
				<Label for="quotedTotal">
					Quoted total (before tax)
				</Label>
				{#if existingRateTotal > 0 && rateOverridden}
					<button type="button" class="text-[10px] text-primary underline"
						onclick={() => { rateOverridden = false; quotedTotal = (existingRateTotal / 100).toFixed(2); }}>
						Reset to current (${(existingRateTotal / 100).toFixed(2)})
					</button>
				{/if}
			</div>
			<div class="relative">
				<span class="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
				<Input
					id="quotedTotal"
					name="quotedTotal"
					type="number"
					min="0"
					step="0.01"
					bind:value={quotedTotal}
					oninput={() => { rateOverridden = true; }}
					placeholder="0.00"
					class="pl-6"
				/>
			</div>
		{#if existingRateTotal === 0}
			<p class="text-muted-foreground text-xs">No rate saved yet. Enter a total to set it.</p>
		{:else if !rateOverridden && perNightCents > 0}
			<p class="text-muted-foreground text-xs">
				Auto-adjusted for {nights()} nights × ${(perNightCents / 100).toFixed(2)}/night. Override to lock a custom price.
			</p>
		{:else if rateOverridden}
			<p class="text-muted-foreground text-xs">Manual override — auto-recalc disabled.</p>
		{/if}
		</div>

		<div class="flex justify-between pt-2">
			<a href={backHref()}><Button type="button" variant="ghost">Cancel</Button></a>
			<Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
		</div>
	</form>
</div>
