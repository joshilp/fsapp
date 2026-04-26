<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const b = data.booking;

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Reservation Confirmed — Falcon &amp; Spanish Fiesta Motels</title>
</svelte:head>

<div class="min-h-screen bg-stone-50 py-12 px-4">
	<div class="mx-auto max-w-lg">

		<!-- Success banner -->
		<div class="text-center mb-8">
			<div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
				<svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<h1 class="text-2xl font-bold text-stone-900">Your reservation is confirmed!</h1>
			<p class="text-stone-500 mt-2 text-sm">
				A confirmation has been sent to <strong>{b.guest?.email}</strong>
			</p>
		</div>

		<!-- Booking details card -->
		<div class="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden mb-6">

			<!-- Header -->
			<div class="bg-amber-500 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-stone-900 font-bold text-lg">{b.property?.name}</p>
						<p class="text-stone-700 text-sm">{b.property?.address}, {b.property?.city}, {b.property?.province}</p>
					</div>
					<div class="text-right">
						<p class="text-xs text-stone-700">Confirmation #</p>
						<p class="font-mono font-bold text-stone-900 tracking-widest">{b.publicToken}</p>
					</div>
				</div>
			</div>

			<div class="divide-y divide-stone-100">
				<!-- Dates -->
				<div class="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
					<div>
						<p class="text-stone-400 text-xs mb-1">Check-in</p>
						<p class="font-semibold text-stone-900">{fmtDate(b.checkInDate)}</p>
						<p class="text-stone-500 text-xs">From {b.property?.checkinTime ?? '2:00 PM'}</p>
					</div>
					<div>
						<p class="text-stone-400 text-xs mb-1">Check-out</p>
						<p class="font-semibold text-stone-900">{fmtDate(b.checkOutDate)}</p>
						<p class="text-stone-500 text-xs">By {b.property?.checkoutTime ?? '10:30 AM'}</p>
					</div>
				</div>

				<!-- Room + guests -->
				<div class="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
					<div>
						<p class="text-stone-400 text-xs mb-1">Room type</p>
						<p class="font-semibold text-stone-900">{b.requestedRoomType?.name ?? 'To be assigned'}</p>
						<p class="text-stone-400 text-xs">Room number assigned before arrival</p>
					</div>
					<div>
						<p class="text-stone-400 text-xs mb-1">Duration</p>
						<p class="font-semibold text-stone-900">{data.nights} night{data.nights === 1 ? '' : 's'}</p>
					</div>
					<div>
						<p class="text-stone-400 text-xs mb-1">Guests</p>
						<p class="font-semibold text-stone-900">
							{b.numAdults} adult{b.numAdults === 1 ? '' : 's'}
							{#if b.numChildren > 0}· {b.numChildren} child{b.numChildren === 1 ? '' : 'ren'}{/if}
						</p>
					</div>
					<div>
						<p class="text-stone-400 text-xs mb-1">Guest</p>
						<p class="font-semibold text-stone-900">{b.guest?.name}</p>
					</div>
				</div>

				<!-- Payment note -->
				<div class="px-6 py-4 bg-blue-50">
					<p class="text-blue-700 text-sm font-semibold mb-1">Payment due upon arrival</p>
					<p class="text-blue-600 text-xs">All rates are payable when you check in. We accept Visa, Mastercard, and cash. No charges have been taken now.</p>
				</div>

				<!-- Notes -->
				{#if b.notes}
					<div class="px-6 py-4 text-sm">
						<p class="text-stone-400 text-xs mb-1">Your special requests</p>
						<p class="text-stone-600 italic">{b.notes}</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Contact the motel -->
		<div class="bg-white rounded-2xl border border-stone-100 shadow-sm px-6 py-5 mb-6 text-sm">
			<p class="font-semibold text-stone-900 mb-3">Need to make changes?</p>
			<p class="text-stone-500 text-xs mb-3">
				To cancel or modify your reservation, please contact us directly.
				Have your confirmation number <strong>{b.publicToken}</strong> ready.
			</p>
			{#if b.property?.phone}
				<a href="tel:{b.property.phone.replace(/\D/g, '')}"
					class="flex items-center gap-2 text-amber-600 font-semibold hover:underline">
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
					</svg>
					{b.property.phone}
				</a>
			{/if}
		</div>

		<!-- Print + back -->
		<div class="flex gap-3">
			<button
				onclick={() => window.print()}
				class="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors print:hidden"
			>
				🖨 Print confirmation
			</button>
			<a href="/"
				class="flex-1 rounded-xl bg-amber-500 py-3 text-center text-sm font-semibold text-stone-900 hover:bg-amber-400 transition-colors print:hidden">
				← Back to website
			</a>
		</div>
	</div>
</div>

<style>
	@media print {
		:global(header), :global(footer) { display: none !important; }
	}
</style>
