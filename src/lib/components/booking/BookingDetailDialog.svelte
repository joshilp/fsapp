<script lang="ts">
	import { enhance } from '$app/forms';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { BookingSummary } from '$lib/server/booking-queries';

	type Props = {
		open: boolean;
		booking: BookingSummary;
		roomNumber: string;
		propertyName: string;
		onClose?: () => void;
	};

	let { open = $bindable(false), booking, roomNumber, propertyName, onClose }: Props = $props();

	const STATUS_LABELS: Record<string, { label: string; class: string }> = {
		confirmed: { label: 'Confirmed', class: 'bg-blue-100 text-blue-800' },
		checked_in: { label: 'Checked In', class: 'bg-green-100 text-green-800' },
		checked_out: { label: 'Checked Out', class: 'bg-gray-100 text-gray-600' },
		cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-700' }
	};

	const statusInfo = $derived(STATUS_LABELS[booking.status] ?? { label: booking.status, class: 'bg-muted' });

	function formatDate(iso: string): string {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
		});
	}

	function nights(checkIn: string, checkOut: string): number {
		return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	}

	let cancelling = $state(false);
	let confirmCancel = $state(false);
</script>

<CustomDialog
	bind:open
	title="Booking — Room {roomNumber}"
	description={propertyName}
	dialogClass="sm:max-w-md"
>
	{#snippet content()}
		<div class="flex flex-col gap-4 p-1">
			<!-- Status badge -->
			<div class="flex items-center justify-between">
				<span class={['rounded-full px-2.5 py-0.5 text-xs font-semibold', statusInfo.class].join(' ')}>
					{statusInfo.label}
				</span>
				{#if booking.channelName && booking.channelName !== 'Direct'}
					<span class="text-muted-foreground text-xs">{booking.channelName}</span>
				{/if}
			</div>

			<!-- Key details grid -->
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
				<dt class="text-muted-foreground font-medium">Guest</dt>
				<dd class="font-semibold">{booking.guestName ?? '—'}</dd>

				<dt class="text-muted-foreground font-medium">Check-in</dt>
				<dd>{formatDate(booking.checkInDate)}</dd>

				<dt class="text-muted-foreground font-medium">Check-out</dt>
				<dd>
					{formatDate(booking.checkOutDate)}
					<span class="text-muted-foreground ml-1 text-xs">
						({nights(booking.checkInDate, booking.checkOutDate)} night{nights(booking.checkInDate, booking.checkOutDate) === 1 ? '' : 's'})
					</span>
				</dd>

				{#if booking.numAdults || booking.numChildren}
					<dt class="text-muted-foreground font-medium">Guests</dt>
					<dd>
						{booking.numAdults} adult{booking.numAdults === 1 ? '' : 's'}
						{#if booking.numChildren}
							, {booking.numChildren} child{booking.numChildren === 1 ? '' : 'ren'}
						{/if}
					</dd>
				{/if}

				{#if booking.clerkLabel}
					<dt class="text-muted-foreground font-medium">Clerk</dt>
					<dd>{booking.clerkLabel}</dd>
				{/if}

				{#if booking.notes}
					<dt class="text-muted-foreground font-medium">Notes</dt>
					<dd class="italic">{booking.notes}</dd>
				{/if}
			</dl>

			<!-- Actions -->
			<div class="border-border border-t pt-3">
				{#if booking.status === 'confirmed' || booking.status === 'checked_in'}
					<div class="flex flex-wrap gap-2">
						{#if booking.status === 'confirmed'}
							<Button variant="default" size="sm" disabled title="Coming soon">
								Check In
							</Button>
						{/if}
						{#if booking.status === 'checked_in'}
							<Button variant="default" size="sm" disabled title="Coming soon">
								Check Out
							</Button>
						{/if}
						<Button variant="outline" size="sm" disabled title="Coming soon">Edit</Button>

						<!-- Cancel -->
						{#if !confirmCancel}
							<Button
								variant="ghost"
								size="sm"
								class="text-destructive ml-auto"
								onclick={() => (confirmCancel = true)}
							>
								Cancel booking
							</Button>
						{:else}
							<div class="ml-auto flex items-center gap-2">
								<span class="text-muted-foreground text-xs">Are you sure?</span>
								<form
									method="POST"
									action="?/cancelBooking"
									use:enhance={() => {
										cancelling = true;
										return async ({ update }) => {
											cancelling = false;
											confirmCancel = false;
											open = false;
											onClose?.();
											await update();
										};
									}}
								>
									<input type="hidden" name="bookingId" value={booking.id} />
									<Button type="submit" variant="destructive" size="sm" disabled={cancelling}>
										{cancelling ? 'Cancelling…' : 'Yes, cancel'}
									</Button>
								</form>
								<Button variant="ghost" size="sm" onclick={() => (confirmCancel = false)}>
									No
								</Button>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-muted-foreground text-xs">
						{booking.status === 'cancelled' ? 'This booking was cancelled.' : 'This booking is complete.'}
					</p>
				{/if}
			</div>
		</div>
	{/snippet}
</CustomDialog>
