<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { bedCompact } from '$lib/utils/room';

	type Props = {
		open: boolean;
		bookingId: string;
		onClose?: () => void;
		onMoveComplete?: (newBookingId: string) => void;
	};

	let { open = $bindable(false), bookingId, onClose, onMoveComplete }: Props = $props();

	let apiData = $state<any | null>(null);
	let loading = $state(false);
	let fetchError = $state('');
	let submitError = $state('');
	let submitting = $state(false);

	let moveDate = $state('');
	let newRoomId = $state('');
	let carryNotes = $state(true);
	let moveNotes = $state('');

	$effect(() => {
		if (open && !apiData && !loading) {
			loading = true;
			fetchError = '';
			fetch(`/api/booking/${bookingId}/move-data`)
				.then((r) => r.json())
				.then((d) => {
					apiData = d;
					moveDate = defaultMoveDate(d.booking);
					newRoomId = '';
					moveNotes = '';
					carryNotes = true;
				})
				.catch((e) => { fetchError = String(e); })
				.finally(() => { loading = false; });
		}
		if (!open) { apiData = null; }
	});

	function defaultMoveDate(booking: any): string {
		const checkIn = new Date(booking.checkInDate + 'T12:00:00');
		const checkOut = new Date(booking.checkOutDate + 'T12:00:00');
		const tomorrow = new Date();
		tomorrow.setHours(12, 0, 0, 0);
		tomorrow.setDate(tomorrow.getDate() + 1);
		const minDate = new Date(checkIn); minDate.setDate(minDate.getDate() + 1);
		const maxDate = new Date(checkOut); maxDate.setDate(maxDate.getDate() - 1);
		const candidate = tomorrow < minDate ? minDate : tomorrow > maxDate ? maxDate : tomorrow;
		return candidate.toISOString().slice(0, 10);
	}

	const nightsBefore = $derived(() => {
		if (!moveDate || !apiData) return 0;
		return Math.max(0, Math.round((new Date(moveDate).getTime() - new Date(apiData.booking.checkInDate).getTime()) / 86400000));
	});
	const nightsAfter = $derived(() => {
		if (!moveDate || !apiData) return 0;
		return Math.max(0, Math.round((new Date(apiData.booking.checkOutDate).getTime() - new Date(moveDate).getTime()) / 86400000));
	});
	const moveDateMin = $derived(() => {
		if (!apiData) return '';
		const d = new Date(apiData.booking.checkInDate + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	});
	const moveDateMax = $derived(() => {
		if (!apiData) return '';
		const d = new Date(apiData.booking.checkOutDate + 'T12:00:00');
		d.setDate(d.getDate() - 1);
		return d.toISOString().slice(0, 10);
	});
	const availableRooms = $derived((apiData?.propertyRooms ?? []).filter((r: any) => r.id !== apiData?.booking.roomId));

	function roomLabel(r: any): string {
		return `Rm ${r.roomNumber}  ${bedCompact(r)}${r.roomType ? ` — ${r.roomType.name}` : ''}`;
	}

	const dialogTitle = $derived(apiData ? `Move Guest — Room ${apiData.booking.room?.roomNumber}` : 'Move Guest');
	const dialogDesc = $derived(apiData ? `${apiData.booking.guest?.name ?? ''} · checkout ${apiData.booking.checkOutDate}` : '');
</script>

<CustomDialog
	bind:open
	title={dialogTitle}
	description={dialogDesc}
	interactOutsideBehavior="ignore"
	dialogClass="sm:max-w-md max-h-[90vh]"
>
	{#snippet content()}
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<div class="text-muted-foreground text-sm">Loading…</div>
			</div>
		{:else if fetchError}
			<div class="text-destructive text-sm py-8 text-center">{fetchError}</div>
		{:else if apiData}
			{@const booking = apiData.booking}

			{#if submitError}
				<div class="mb-3 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{submitError}</div>
			{/if}

			<!-- Summary boxes -->
			<div class="mb-5 grid grid-cols-2 gap-3">
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
						{#if newRoomId}Rm {availableRooms.find((r: any) => r.id === newRoomId)?.roomNumber ?? '?'}{:else}—{/if}
					</p>
					<p class="text-muted-foreground text-xs">
						{#if moveDate && nightsAfter() > 0}
							<span class="text-foreground font-medium">{moveDate}</span> → {booking.checkOutDate}
							<span class="ml-1">({nightsAfter()} night{nightsAfter() === 1 ? '' : 's'})</span>
						{:else}—{/if}
					</p>
				</div>
			</div>

			<form
				method="POST"
				action="/booking/{bookingId}/move"
				use:enhance={() => {
					submitting = true;
					submitError = '';
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'redirect') {
							open = false;
							onClose?.();
							const match = result.location.match(/\/booking\/([^/]+)\/checkin/);
							if (match && onMoveComplete) {
								onMoveComplete(match[1]);
							} else {
								await invalidateAll();
							}
						} else if (result.type === 'failure') {
							submitError = (result.data?.error as string) ?? 'Error';
						}
					};
				}}
				class="flex flex-col gap-5"
			>
				<div class="flex flex-col gap-1.5">
					<Label for="mv-date" class="text-xs">
						Move date <span class="text-muted-foreground font-normal">(guest switches rooms this morning)</span>
					</Label>
					<Input id="mv-date" name="moveDate" type="date" bind:value={moveDate}
						min={moveDateMin()} max={moveDateMax()} required class="h-9" />
					{#if nightsBefore() > 0 && nightsAfter() > 0}
						<p class="text-muted-foreground text-xs">
							Original shortened to {nightsBefore()} night{nightsBefore() === 1 ? '' : 's'};
							new booking for {nightsAfter()} night{nightsAfter() === 1 ? '' : 's'}.
						</p>
					{:else if moveDate}
						<p class="text-destructive text-xs">Move date must be between check-in and check-out.</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="mv-room" class="text-xs">Move to room</Label>
					<select id="mv-room" name="newRoomId" bind:value={newRoomId} required
						class="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none h-9">
						<option value="" disabled>Select room…</option>
						{#each availableRooms as r}
							<option value={r.id}>{roomLabel(r)}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					{#if booking.notes}
						<label class="flex cursor-pointer items-center gap-2 text-sm">
							<input type="checkbox" name="carryNotes" bind:checked={carryNotes} class="rounded" />
							Carry over notes: <span class="text-muted-foreground italic">"{booking.notes}"</span>
						</label>
					{/if}
					<div class="flex flex-col gap-1.5">
						<Label for="mv-notes" class="text-xs">Move notes <span class="text-muted-foreground font-normal">(optional)</span></Label>
						<Input id="mv-notes" name="moveNotes" bind:value={moveNotes}
							placeholder="e.g. Guest requested quieter room" class="h-9" />
					</div>
				</div>

				<div class="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
					<p class="font-semibold">After moving:</p>
					<ul class="list-disc pl-4 space-y-0.5">
						<li>Original booking ends at the move date.</li>
						<li>Check-in card for the new room opens next — set rates for remaining nights.</li>
					</ul>
				</div>

				<div class="flex justify-between border-t pt-3">
					<Button type="button" variant="ghost" onclick={() => { open = false; onClose?.(); }} disabled={submitting}>Cancel</Button>
					<Button type="submit"
						disabled={submitting || !newRoomId || nightsBefore() <= 0 || nightsAfter() <= 0}>
						{submitting ? 'Moving…' : 'Move Guest →'}
					</Button>
				</div>
			</form>
		{/if}
	{/snippet}
</CustomDialog>
