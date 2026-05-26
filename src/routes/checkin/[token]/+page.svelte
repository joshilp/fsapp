<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const b = data.booking;
	const room = b.room;
	const prop = room?.property;
	const guest = b.guest;

	const alreadyDone = !!(b.selfCheckinAt);
	let agreed = $state(false);
	let submitting = $state(false);

	function nights(ci: string, co: string) {
		return Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
	}

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Online Check-In — {prop?.name ?? 'Hotel'}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
		<div class="mx-auto flex max-w-lg items-center gap-3">
			{#if prop?.logoUrl}
				<img src={prop.logoUrl} alt={prop.name} class="h-10 w-auto object-contain" />
			{:else}
				<div class="text-lg font-bold text-gray-900">{prop?.name ?? 'Hotel'}</div>
			{/if}
		</div>
	</header>

	<main class="mx-auto max-w-lg px-4 py-8 space-y-6">

		<!-- Success / already done -->
		{#if alreadyDone || form?.success}
			<div class="rounded-xl border border-green-200 bg-green-50 p-6 text-center space-y-3">
				<div class="text-4xl">✅</div>
				<h1 class="text-xl font-bold text-green-800">You're checked in!</h1>
				{#if guest?.name}<p class="text-green-700">Welcome, {guest.name}.</p>{/if}
				<p class="text-sm text-green-600">Our team has been notified. See your room details below.</p>
			</div>

			<!-- Room / access details always shown once done -->
			{#if room?.doorCode || room?.checkinInstructions}
				<div class="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-3">
					<h2 class="font-semibold text-blue-900">Your Room</h2>
					<p class="text-2xl font-bold text-blue-800">Room {room.roomNumber}
						{#if room.roomType}<span class="text-sm font-normal text-blue-600">— {room.roomType.name}</span>{/if}
					</p>
					{#if room.doorCode}
						<div class="rounded-lg bg-white/70 px-4 py-3 text-center">
							<p class="text-xs uppercase tracking-wide text-blue-600 font-medium mb-1">Door Code</p>
							<p class="text-3xl font-bold tracking-widest text-blue-900">{room.doorCode}</p>
						</div>
					{/if}
					{#if room.checkinInstructions}
						<div class="text-sm text-blue-800 whitespace-pre-wrap">{room.checkinInstructions}</div>
					{/if}
				</div>
			{/if}

		{:else}
			<!-- Pre-checkin flow -->
			<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
				<h1 class="text-xl font-bold text-gray-900">Online Check-In</h1>
				{#if guest?.name}<p class="text-gray-600">Hello, <strong>{guest.name}</strong>!</p>{/if}

				<!-- Booking summary -->
				<div class="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-500">Property</span>
						<span class="font-medium">{prop?.name}</span>
					</div>
					{#if room}
						<div class="flex justify-between">
							<span class="text-gray-500">Room</span>
							<span class="font-medium">Rm {room.roomNumber}{room.roomType ? ' — ' + room.roomType.name : ''}</span>
						</div>
					{/if}
					<div class="flex justify-between">
						<span class="text-gray-500">Check-in</span>
						<span class="font-medium">{fmtDate(b.checkInDate)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-500">Check-out</span>
						<span class="font-medium">{fmtDate(b.checkOutDate)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-500">Duration</span>
						<span class="font-medium">{nights(b.checkInDate, b.checkOutDate)} night{nights(b.checkInDate, b.checkOutDate) === 1 ? '' : 's'}</span>
					</div>
					{#if prop?.checkinTime || prop?.checkoutTime}
						<div class="border-t border-gray-200 pt-2 text-xs text-gray-500">
							{#if prop.checkinTime}Check-in after {prop.checkinTime}{/if}
							{#if prop.checkinTime && prop.checkoutTime} · {/if}
							{#if prop.checkoutTime}Check-out by {prop.checkoutTime}{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Property policy / waiver -->
			{#if prop?.policyText}
				<div class="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
					<h2 class="font-semibold text-gray-800">Property Policies</h2>
					<div class="max-h-48 overflow-y-auto rounded bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
						{prop.policyText}
					</div>
				</div>
			{/if}

			<!-- Agreement + submit -->
			<form method="POST" action="?/complete"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => { submitting = false; await update(); };
				}}
				class="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
			>
				<label class="flex items-start gap-3 cursor-pointer">
					<input type="checkbox" bind:checked={agreed}
						class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-blue-600" />
					<span class="text-sm text-gray-700">
						I have read and agree to the property policies. I confirm the booking details above are correct.
					</span>
				</label>

				<button type="submit" disabled={!agreed || submitting}
					class="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition-colors">
					{submitting ? 'Processing…' : 'Complete Check-In'}
				</button>
			</form>
		{/if}

		<!-- Property contact footer -->
		{#if prop}
			<footer class="text-center text-xs text-gray-400 space-y-0.5 pb-8">
				<p>{prop.name}</p>
				{#if prop.address}<p>{prop.address}{prop.city ? ', ' + prop.city : ''}{prop.province ? ', ' + prop.province : ''}</p>{/if}
				{#if prop.phone}<p>{prop.phone}</p>{/if}
			</footer>
		{/if}
	</main>
</div>
