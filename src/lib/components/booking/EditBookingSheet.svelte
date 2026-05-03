<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	type Props = {
		open: boolean;
		bookingId: string;
		onClose?: () => void;
	};

	let { open = $bindable(false), bookingId, onClose }: Props = $props();

	let apiData = $state<any | null>(null);
	let loading = $state(false);
	let fetchError = $state('');
	let submitError = $state('');
	let submitting = $state(false);

	let checkIn = $state('');
	let checkOut = $state('');
	let roomId = $state('');
	let channelId = $state('');
	let notes = $state('');
	let otaRef = $state('');
	let quotedTotal = $state('');
	let rateOverridden = $state(false);

	$effect(() => {
		if (open && !apiData && !loading) {
			loading = true;
			fetchError = '';
			fetch(`/api/booking/${bookingId}/edit-data`)
				.then((r) => r.json())
				.then((d) => {
					apiData = d;
					checkIn = d.booking.checkInDate;
					checkOut = d.booking.checkOutDate;
					roomId = d.booking.roomId ?? '';
					channelId = d.booking.channelId ?? '';
					notes = d.booking.notes ?? '';
					otaRef = d.booking.otaConfirmationNumber ?? '';
					const existingRate = (d.booking.lineItems ?? [])
						.filter((li: any) => li.type === 'rate' || li.type === 'extra')
						.reduce((s: number, li: any) => s + li.totalAmount, 0);
					quotedTotal = existingRate > 0 ? (existingRate / 100).toFixed(2) : '';
					rateOverridden = false;
				})
				.catch((e) => { fetchError = String(e); })
				.finally(() => { loading = false; });
		}
		if (!open) { apiData = null; }
	});

	const nights = $derived(() => {
		if (!checkIn || !checkOut) return 0;
		return Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
	});

	const existingRateCents = $derived(
		(apiData?.booking.lineItems ?? [])
			.filter((li: any) => li.type === 'rate' || li.type === 'extra')
			.reduce((s: number, li: any) => s + li.totalAmount, 0)
	);
	const originalNights = $derived(() => {
		if (!apiData) return 0;
		return Math.round((new Date(apiData.booking.checkOutDate).getTime() - new Date(apiData.booking.checkInDate).getTime()) / 86400000);
	});
	const perNightCents = $derived(
		existingRateCents > 0 && originalNights() > 0 ? existingRateCents / originalNights() : 0
	);

	function advanceDay(iso: string) {
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

	const dialogTitle = $derived(
		apiData ? `Edit Booking — Room ${apiData.booking.room?.roomNumber}` : 'Edit Booking'
	);
	const dialogDesc = $derived(
		apiData ? `${apiData.booking.guest?.name ?? ''}` : ''
	);
</script>

<CustomDialog
	bind:open
	title={dialogTitle}
	description={dialogDesc}
	interactOutsideBehavior="ignore"
	dialogClass="sm:max-w-lg max-h-[90vh]"
>
	{#snippet content()}
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="text-muted-foreground text-sm">Loading…</div>
			</div>
		{:else if fetchError}
			<div class="text-destructive text-sm py-8 text-center">{fetchError}</div>
		{:else if apiData}
			{#if submitError}
				<div class="mb-3 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{submitError}</div>
			{/if}

			<form
				method="POST"
				action="/booking/{bookingId}/edit"
				use:enhance={() => {
					submitting = true;
					submitError = '';
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'redirect') {
							open = false;
							onClose?.();
							await invalidateAll();
						} else if (result.type === 'failure') {
							submitError = (result.data?.error as string) ?? 'Error saving';
						}
					};
				}}
				class="flex flex-col gap-4"
			>
				<!-- Dates -->
				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1.5">
						<Label for="eb-checkIn" class="text-xs">Check-in</Label>
						<Input id="eb-checkIn" name="checkIn" type="date" bind:value={checkIn} oninput={onCheckInChange} required class="h-9" />
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="eb-checkOut" class="text-xs">
							Check-out
							{#if nights() > 0}<span class="text-muted-foreground font-normal">({nights()} night{nights() === 1 ? '' : 's'})</span>{/if}
						</Label>
						<Input id="eb-checkOut" name="checkOut" type="date" bind:value={checkOut} oninput={() => autoRecalcRate()} required class="h-9" />
					</div>
				</div>

				<!-- Room -->
				<div class="flex flex-col gap-1.5">
					<Label for="eb-room" class="text-xs">Room</Label>
					<select id="eb-room" name="roomId" bind:value={roomId}
						class="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none h-9">
						{#each apiData.propertyRooms as r}
							<option value={r.id}>Room {r.roomNumber}{r.hasKitchen ? ' (kitchen)' : ''}</option>
						{/each}
					</select>
				</div>

				<!-- Channel -->
				<div class="flex flex-col gap-1.5">
					<Label class="text-xs">Channel</Label>
					<div class="flex flex-wrap gap-1.5">
						{#each apiData.channels as ch}
							<button type="button"
								class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors {channelId === ch.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}"
								onclick={() => (channelId = ch.id)}>{ch.name}</button>
						{/each}
					</div>
					<input type="hidden" name="channelId" value={channelId} />
				</div>

				<!-- OTA ref -->
				{#if apiData.channels.find((c: any) => c.id === channelId)?.name !== 'Direct'}
					<div class="flex flex-col gap-1.5">
						<Label for="eb-ota" class="text-xs">OTA confirmation #</Label>
						<Input id="eb-ota" name="otaConfirmationNumber" bind:value={otaRef} class="h-9" />
					</div>
				{/if}

				<!-- Notes -->
				<div class="flex flex-col gap-1.5">
					<Label for="eb-notes" class="text-xs">Notes</Label>
					<textarea id="eb-notes" name="notes" bind:value={notes} rows="2"
						class="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"></textarea>
				</div>

				<!-- Quoted rate -->
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between">
						<Label for="eb-rate" class="text-xs">Quoted total (before tax)</Label>
						{#if existingRateCents > 0 && rateOverridden}
							<button type="button" class="text-[10px] text-primary underline"
								onclick={() => { rateOverridden = false; quotedTotal = (existingRateCents / 100).toFixed(2); }}>
								Reset to ${(existingRateCents / 100).toFixed(2)}
							</button>
						{/if}
					</div>
					<div class="relative">
						<span class="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 text-sm">$</span>
						<Input id="eb-rate" name="quotedTotal" type="number" min="0" step="0.01"
							bind:value={quotedTotal} oninput={() => { rateOverridden = true; }} placeholder="0.00" class="pl-6 h-9" />
					</div>
					{#if existingRateCents === 0}
						<p class="text-muted-foreground text-xs">No rate saved yet.</p>
					{:else if !rateOverridden && perNightCents > 0}
						<p class="text-muted-foreground text-xs">Auto-adjusted: {nights()} nights × ${(perNightCents / 100).toFixed(2)}/night</p>
					{:else if rateOverridden}
						<p class="text-muted-foreground text-xs">Manual override.</p>
					{/if}
				</div>

				<div class="flex justify-between border-t pt-3">
					<Button type="button" variant="ghost" onclick={() => { open = false; onClose?.(); }} disabled={submitting}>Cancel</Button>
					<Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</Button>
				</div>
			</form>
		{/if}
	{/snippet}
</CustomDialog>
