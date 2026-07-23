<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const b     = data.booking;
	const room  = b.room;
	const prop  = room?.property;
	const guest = b.guest;

	const accent  = prop?.accentColour ?? '#2563eb';
	const alreadyDone = !!(b.selfCheckinAt);

	let agreed     = $state(false);
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

<div class="min-h-screen bg-stone-50">
	<!-- Header -->
	<header class="border-b border-stone-200 bg-white px-4 py-4 shadow-sm">
		<div class="mx-auto flex max-w-lg items-center gap-3">
			{#if prop?.logoUrl}
				<img src={prop.logoUrl} alt={prop.name} class="h-10 w-auto object-contain" />
			{:else}
				<div class="text-lg font-bold text-stone-900">{prop?.name ?? 'Hotel'}</div>
			{/if}
		</div>
	</header>

	<main class="mx-auto max-w-lg px-4 py-8 space-y-5">

		{#if alreadyDone || form?.success}
			<!-- ── Success ── -->
			<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3">
				<div class="text-5xl">✅</div>
				<h1 class="text-xl font-bold text-emerald-800">You're checked in!</h1>
				{#if guest?.name}<p class="text-emerald-700">Welcome, {guest.name}.</p>{/if}
				<p class="text-sm text-emerald-600">Our team has been notified. See your room details below.</p>
			</div>

			{#if room?.doorCode || room?.checkinInstructions}
				<div class="rounded-2xl border-2 p-5 space-y-3"
					style="border-color: {accent}20; background: {accent}08">
					<h2 class="font-bold text-lg" style="color: {accent}">Your Room</h2>
					<p class="text-2xl font-bold text-stone-800">Room {room.roomNumber}
						{#if room.roomType}<span class="text-base font-normal text-stone-500">— {room.roomType.name}</span>{/if}
					</p>
					{#if room.doorCode}
						<div class="rounded-xl bg-white border border-stone-200 px-4 py-4 text-center shadow-sm">
							<p class="text-xs uppercase tracking-widest font-semibold mb-2" style="color: {accent}">Door Code</p>
							<p class="text-4xl font-bold tracking-[0.25em] text-stone-900">{room.doorCode}</p>
						</div>
					{/if}
					{#if room.checkinInstructions}
						<div class="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">{room.checkinInstructions}</div>
					{/if}
				</div>
			{/if}

		{:else}
			<!-- ── Pre-checkin flow ── -->
			<div class="rounded-2xl border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
				<h1 class="text-xl font-bold text-stone-900">Online Check-In</h1>
				{#if guest?.name}<p class="text-stone-600">Hello, <strong>{guest.name}</strong>!</p>{/if}

				<div class="rounded-xl bg-stone-50 p-4 space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-stone-500">Property</span>
						<span class="font-medium">{prop?.name}</span>
					</div>
					{#if room}
						<div class="flex justify-between">
							<span class="text-stone-500">Room type</span>
							<span class="font-medium">{room.roomType?.name ?? '—'}</span>
						</div>
					{/if}
					<div class="flex justify-between">
						<span class="text-stone-500">Check-in</span>
						<span class="font-medium">{fmtDate(b.checkInDate)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-stone-500">Check-out</span>
						<span class="font-medium">{fmtDate(b.checkOutDate)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-stone-500">Duration</span>
						<span class="font-medium">{nights(b.checkInDate, b.checkOutDate)} night{nights(b.checkInDate, b.checkOutDate) === 1 ? '' : 's'}</span>
					</div>
					{#if prop?.checkinTime || prop?.checkoutTime}
						<div class="border-t border-stone-200 pt-2 text-xs text-stone-500">
							{#if prop.checkinTime}Check-in after {prop.checkinTime}{/if}
							{#if prop.checkinTime && prop.checkoutTime} · {/if}
							{#if prop.checkoutTime}Check-out by {prop.checkoutTime}{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Property policy / waiver -->
			{#if prop?.policyText}
				<div class="rounded-2xl border border-stone-200 bg-white p-5 space-y-3 shadow-sm">
					<h2 class="font-semibold text-stone-800">Property Policies</h2>
					<div class="max-h-48 overflow-y-auto rounded-lg bg-stone-50 p-3 text-xs text-stone-600 whitespace-pre-wrap leading-relaxed border border-stone-100">
						{prop.policyText}
					</div>
				</div>
			{/if}

			<!-- Vehicle info + agreement + submit -->
			<form method="POST" action="?/complete"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => { submitting = false; await update(); };
				}}
				class="rounded-2xl border border-stone-200 bg-white p-5 space-y-5 shadow-sm"
			>
				<!-- Vehicle information (optional) -->
				<div class="space-y-3">
					<h2 class="font-semibold text-stone-800 text-sm">Vehicle Information <span class="font-normal text-stone-400">(optional)</span></h2>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="block text-xs text-stone-500 mb-1" for="vehicleMake">Make / Model</label>
							<input id="vehicleMake" name="vehicleMake" type="text"
								placeholder="e.g. Toyota Camry"
								class="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
								style="--tw-ring-color: {accent}" />
						</div>
						<div>
							<label class="block text-xs text-stone-500 mb-1" for="vehicleColour">Colour</label>
							<input id="vehicleColour" name="vehicleColour" type="text"
								placeholder="e.g. Silver"
								class="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
								style="--tw-ring-color: {accent}" />
						</div>
					</div>
					<div>
						<label class="block text-xs text-stone-500 mb-1" for="vehiclePlate">License Plate</label>
						<input id="vehiclePlate" name="vehiclePlate" type="text"
							placeholder="e.g. ABC 1234"
							class="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:border-transparent"
							style="--tw-ring-color: {accent}" />
					</div>
				</div>

				<div class="border-t border-stone-100 pt-4 space-y-4">
					<label class="flex items-start gap-3 cursor-pointer">
						<input type="checkbox" bind:checked={agreed}
							class="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300" />
						<span class="text-sm text-stone-700">
							I have read and agree to the property policies. I confirm the booking details above are correct.
						</span>
					</label>

					<button type="submit" disabled={!agreed || submitting}
						class="w-full rounded-xl px-4 py-3 text-sm font-bold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-40"
						style="background: {accent}">
						{submitting ? 'Processing…' : 'Complete Check-In'}
					</button>
				</div>
			</form>
		{/if}

		<!-- Property contact footer -->
		{#if prop}
			<footer class="text-center text-xs text-stone-400 space-y-0.5 pb-8">
				<p>{prop.name}</p>
				{#if prop.address}<p>{prop.address}{prop.city ? ', ' + prop.city : ''}{prop.province ? ', ' + prop.province : ''}</p>{/if}
				{#if prop.phone}<p>{prop.phone}</p>{/if}
			</footer>
		{/if}
	</main>
</div>
