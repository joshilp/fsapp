<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const b = data.booking;
	const prop = b.property;
	const accent = prop?.accentColour ?? '#d97706';

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Reservation Confirmed — {prop?.name ?? 'Hotel'}</title>
</svelte:head>

<div class="min-h-screen bg-stone-50">

	<!-- Property-branded header strip -->
	<div class="px-4 py-5 text-center" style="background-color:{accent}">
		{#if prop?.logoUrl}
			<img src={prop.logoUrl} alt={prop.name} class="mx-auto h-12 w-auto object-contain drop-shadow" />
		{:else}
			<p class="text-xl font-bold text-white drop-shadow">{prop?.name ?? 'Hotel'}</p>
		{/if}
	</div>

	<div class="px-4 py-10">
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
				<div class="px-6 py-4" style="background-color:{accent}">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-white font-bold text-lg drop-shadow-sm">{prop?.name}</p>
							{#if prop?.address}
								<p class="text-white/80 text-sm">{prop.address}{prop.city ? ', ' + prop.city : ''}{prop.province ? ', ' + prop.province : ''}</p>
							{/if}
						</div>
						<div class="text-right">
							<p class="text-xs text-white/70">Confirmation #</p>
							<p class="font-mono font-bold text-white tracking-widest">{b.publicToken}</p>
						</div>
					</div>
				</div>

				<div class="divide-y divide-stone-100">
					<!-- Dates -->
					<div class="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
						<div>
							<p class="text-stone-400 text-xs mb-1">Check-in</p>
							<p class="font-semibold text-stone-900">{fmtDate(b.checkInDate)}</p>
							<p class="text-stone-500 text-xs">From {prop?.checkinTime ?? '2:00 PM'}</p>
						</div>
						<div>
							<p class="text-stone-400 text-xs mb-1">Check-out</p>
							<p class="font-semibold text-stone-900">{fmtDate(b.checkOutDate)}</p>
							<p class="text-stone-500 text-xs">By {prop?.checkoutTime ?? '10:30 AM'}</p>
						</div>
					</div>

				<!-- Room + guests (single booking or first of group) -->
				<div class="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
					<div>
						<p class="text-stone-400 text-xs mb-1">Room type</p>
						{#if data.groupBookings.length > 1}
							<p class="font-semibold text-stone-900">{data.groupBookings.length} rooms</p>
							<div class="text-xs text-stone-500 space-y-0.5 mt-0.5">
								{#each data.groupBookings as gb}
									<p>{gb.requestedRoomType?.name ?? 'TBD'} <span class="font-mono text-stone-400">#{gb.publicToken}</span></p>
								{/each}
							</div>
						{:else}
							<p class="font-semibold text-stone-900">{b.requestedRoomType?.name ?? 'To be assigned'}</p>
							<p class="text-stone-400 text-xs">Room number assigned before arrival</p>
						{/if}
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

			<!-- Pre-arrival / self check-in reminder -->
			<div class="bg-white rounded-2xl border border-stone-100 shadow-sm px-6 py-5 mb-6 text-sm">
				<p class="font-semibold text-stone-900 mb-1">Before you arrive</p>
				<p class="text-stone-500 text-xs">
					We'll send you a pre-arrival email the day before check-in with an online check-in link.
					You'll be able to skip the front desk and go straight to your room.
				</p>
			</div>

			<!-- Contact the motel -->
			<div class="bg-white rounded-2xl border border-stone-100 shadow-sm px-6 py-5 mb-6 text-sm">
				<p class="font-semibold text-stone-900 mb-3">Need to make changes?</p>
				<p class="text-stone-500 text-xs mb-3">
					To cancel or modify your reservation, please contact us directly.
					Have your confirmation number <strong>{b.publicToken}</strong> ready.
				</p>
				{#if prop?.phone}
					<a href="tel:{prop.phone.replace(/\D/g, '')}"
						class="flex items-center gap-2 font-semibold hover:underline"
						style="color:{accent}">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
						</svg>
						{prop.phone}
					</a>
				{/if}
			</div>

			<!-- Print -->
			<div class="flex gap-3">
				<button
					onclick={() => window.print()}
					class="flex-1 rounded-xl border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors print:hidden"
				>
					🖨 Print confirmation
				</button>
			</div>

			<p class="mt-6 text-center text-[10px] text-stone-300">Powered by Rezzzo</p>
		</div>
	</div>
</div>

<style>
	@media print {
		:global(header), :global(footer) { display: none !important; }
	}
</style>
