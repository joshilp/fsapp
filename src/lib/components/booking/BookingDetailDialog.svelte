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
		cancelled: { label: 'Cancelled', class: 'bg-red-100 text-red-700' },
		blocked: { label: 'Maintenance', class: 'bg-slate-100 text-slate-700' }
	};

	const statusInfo = $derived(STATUS_LABELS[booking.status] ?? { label: booking.status, class: 'bg-muted' });

	function formatDate(iso: string): string {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function nights(checkIn: string, checkOut: string): number {
		return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	}

	let confirmCheckOut = $state(false);
	let confirmCancel = $state(false);
	let processing = $state(false);

	function resetConfirms() {
		confirmCheckOut = false;
		confirmCancel = false;
	}

	// ─── Room-move chain ──────────────────────────────────────────────────────

	type PriorStay = {
		bookingId: string;
		roomNumber: string | null;
		checkInDate: string;
		checkOutDate: string;
		chargesCents: number;
		chargesFormatted: string;
	};

	let priorStay = $state<PriorStay | null>(null);
	let priorStayLoaded = $state(false);

	$effect(() => {
		// Fetch prior stay info whenever this booking changes and has a movedFromBookingId
		if (booking.movedFromBookingId && !priorStayLoaded) {
			fetch(`/api/booking/${booking.id}/prior-stay`)
				.then((r) => r.json())
				.then((data) => {
					priorStay = data.prior ?? null;
					priorStayLoaded = true;
				})
				.catch(() => { priorStayLoaded = true; });
		}
	});

	// ─── CC on file ───────────────────────────────────────────────────────────

	let ccData = $state<{ number: string; expiry: string; name: string } | null>(null);
	let ccLastFour = $state<string | null>(booking.ccLastFour ?? null);
	let ccLoading = $state(false);
	let ccError = $state('');
	let confirmClearCc = $state(false);

	async function viewCard() {
		ccLoading = true;
		ccError = '';
		try {
			const res = await fetch('/api/cc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookingId: booking.id })
			});
			if (!res.ok) { ccError = 'Could not decrypt card'; return; }
			ccData = await res.json();
		} catch {
			ccError = 'Network error';
		} finally {
			ccLoading = false;
		}
	}

	async function clearCard() {
		ccLoading = true;
		try {
			await fetch('/api/cc', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bookingId: booking.id })
			});
			ccLastFour = null;
			ccData = null;
			confirmClearCc = false;
		} finally {
			ccLoading = false;
		}
	}
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

		<!-- Room-move chain banners -->
		{#if booking.movedFromBookingId}
			<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs space-y-0.5">
				<p class="font-semibold text-amber-900">↩ Continuation stay</p>
				{#if priorStay}
					<p class="text-amber-800">
						Prior room: <strong>Rm {priorStay.roomNumber}</strong>
						· {priorStay.checkInDate} → {priorStay.checkOutDate}
					</p>
					{#if priorStay.chargesCents > 0}
						<p class="text-amber-800">Prior charges: <strong>{priorStay.chargesFormatted}</strong></p>
					{:else}
						<p class="text-amber-700 italic">Prior room has no charges recorded yet.</p>
					{/if}
				{:else if !priorStayLoaded}
					<p class="text-amber-700 italic">Loading prior stay…</p>
				{/if}
			</div>
		{/if}

		{#if booking.movedToBookingId}
			<div class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
				<p class="font-semibold text-blue-900">→ Guest moved rooms mid-stay</p>
				<p class="text-blue-800">
					This booking ended early at {booking.checkOutDate}.
					<a href="/booking/{booking.movedToBookingId}/checkin"
						onclick={() => (open = false)}
						class="underline font-medium">View new room booking →</a>
				</p>
			</div>
		{/if}

		<!-- CC on file -->
		{#if ccLastFour}
				<div class="border-border rounded-md border bg-muted/30 p-3 text-sm space-y-2">
					<div class="flex items-center justify-between">
						<span class="font-medium text-xs text-muted-foreground uppercase tracking-wide">Card on File</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="font-mono font-semibold">•••• {ccLastFour}</span>
					</div>

					{#if ccData}
						<div class="rounded bg-amber-50 border border-amber-200 p-2 font-mono text-xs space-y-0.5">
							<div class="font-semibold">Card #: {ccData.number}</div>
							<div>Exp: {ccData.expiry}</div>
							{#if ccData.name}<div>Name: {ccData.name}</div>{/if}
							<p class="text-amber-700 mt-1 text-[10px] font-sans">Charge the card, then clear it below.</p>
						</div>
					{/if}

					{#if ccError}<p class="text-destructive text-xs">{ccError}</p>{/if}

					<div class="flex gap-2 flex-wrap">
						{#if !ccData}
							<button onclick={viewCard} disabled={ccLoading}
								class="rounded border border-input px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50">
								{ccLoading ? '…' : 'View full card'}
							</button>
						{/if}

						{#if !confirmClearCc}
							<button onclick={() => { confirmClearCc = true; }}
								class="rounded border border-destructive/40 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/5">
								Clear card
							</button>
						{:else}
							<span class="text-xs text-muted-foreground self-center">Confirm clear?</span>
							<button onclick={clearCard} disabled={ccLoading}
								class="rounded bg-destructive text-white px-2.5 py-1 text-xs hover:bg-destructive/80 disabled:opacity-50">
								{ccLoading ? '…' : 'Yes, clear'}
							</button>
							<button onclick={() => { confirmClearCc = false; }}
								class="rounded border px-2 py-1 text-xs hover:bg-muted">No</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="border-border flex flex-col gap-2 border-t pt-3">
				{#if booking.status === 'confirmed'}
					<div class="flex flex-wrap gap-2">
						<a href="/booking/{booking.id}/checkin" onclick={() => (open = false)}>
							<Button variant="default" size="sm">Check In →</Button>
						</a>
						<a href="/booking/{booking.id}/edit" onclick={() => (open = false)}>
							<Button variant="outline" size="sm">Edit</Button>
						</a>
						<a href="/booking/{booking.id}/print" target="_blank" onclick={() => (open = false)}>
							<Button variant="ghost" size="sm">Print slip</Button>
						</a>

						{#if !confirmCancel}
							<Button
								variant="ghost"
								size="sm"
								class="text-destructive ml-auto"
								onclick={() => { resetConfirms(); confirmCancel = true; }}
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
										processing = true;
										return async ({ update }) => {
											processing = false;
											confirmCancel = false;
											open = false;
											onClose?.();
											await update();
										};
									}}
								>
									<input type="hidden" name="bookingId" value={booking.id} />
									<Button type="submit" variant="destructive" size="sm" disabled={processing}>
										{processing ? '…' : 'Yes, cancel'}
									</Button>
								</form>
								<Button variant="ghost" size="sm" onclick={resetConfirms}>No</Button>
							</div>
						{/if}
					</div>

			{:else if booking.status === 'checked_in'}
				<div class="flex flex-wrap gap-2">
					<a href="/booking/{booking.id}/checkin" onclick={() => (open = false)}>
						<Button variant="outline" size="sm">Edit card</Button>
					</a>
					<a href="/booking/{booking.id}/move" onclick={() => (open = false)}>
						<Button variant="outline" size="sm">Move Room</Button>
					</a>
					<a href="/booking/{booking.id}/print" target="_blank" onclick={() => (open = false)}>
						<Button variant="ghost" size="sm">Print card</Button>
					</a>

					{#if !confirmCheckOut}
						<Button
							variant="default"
							size="sm"
							onclick={() => { resetConfirms(); confirmCheckOut = true; }}
						>
							Check Out
						</Button>
					{:else}
						<div class="flex flex-col gap-2 w-full">
							{#if booking.movedFromBookingId && priorStay}
								<div class="rounded bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900 space-y-0.5">
									<p class="font-semibold">Combined stay charges:</p>
									<p>Rm {priorStay.roomNumber} ({priorStay.checkInDate} → {priorStay.checkOutDate}): {priorStay.chargesFormatted}</p>
									<p>This room ({booking.checkInDate} → {booking.checkOutDate}): check card for total</p>
								</div>
							{/if}
						<div class="flex items-center gap-2">
							<span class="text-muted-foreground text-xs">Confirm checkout?</span>
							<form
								method="POST"
								action="?/checkOutBooking"
								use:enhance={() => {
									processing = true;
									return async ({ update }) => {
										processing = false;
										confirmCheckOut = false;
										open = false;
										onClose?.();
										await update();
									};
								}}
							>
								<input type="hidden" name="bookingId" value={booking.id} />
								<Button type="submit" variant="default" size="sm" disabled={processing}>
									{processing ? '…' : 'Yes, check out'}
								</Button>
							</form>
							<Button variant="ghost" size="sm" onclick={resetConfirms}>No</Button>
						</div>
					</div><!-- /flex-col combined checkout -->
					{/if}
				</div><!-- /flex-wrap checked_in actions -->

			{:else if booking.status === 'cancelled'}
					<div class="space-y-2">
						<p class="text-muted-foreground text-xs">This booking was cancelled.</p>
						<form
							method="POST"
							action="?/restoreBooking"
							use:enhance={() => {
								processing = true;
								return async ({ result, update }) => {
									processing = false;
									if (result.type === 'failure') {
										alert((result.data as { error?: string })?.error ?? 'Could not restore');
									} else {
										open = false;
										onClose?.();
										await update();
									}
								};
							}}
						>
							<input type="hidden" name="bookingId" value={booking.id} />
							<Button type="submit" variant="outline" size="sm" disabled={processing}>
								{processing ? '…' : '↩ Restore booking'}
							</Button>
						</form>
					</div>

				{:else}
					<p class="text-muted-foreground text-xs">
						{booking.status === 'blocked' ? 'Maintenance block — edit dates via the Edit Booking page.' : 'This guest has checked out.'}
					</p>
					{#if booking.status !== 'blocked'}
						<a href="/booking/{booking.id}/print" target="_blank" onclick={() => (open = false)}>
							<Button variant="ghost" size="sm">Print card</Button>
						</a>
					{/if}
				{/if}
			</div>
		</div>
	{/snippet}
</CustomDialog>
