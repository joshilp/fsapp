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

	const backHref = $derived(() => {
		const [y, m] = booking.checkInDate.split('-');
		return `/booking?month=${y}-${m}`;
	});

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}

	function onCheckInChange() {
		if (checkOut <= checkIn) checkOut = advanceDay(checkIn);
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
				<Input id="checkOut" name="checkOut" type="date" bind:value={checkOut} required />
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

		<div class="flex justify-between pt-2">
			<a href={backHref()}><Button type="button" variant="ghost">Cancel</Button></a>
			<Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
		</div>
	</form>
</div>
