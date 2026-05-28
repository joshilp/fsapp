<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const { booking, property, charges, received, refunded, balance, nights } = data;

	function fmt(cents: number) { return '$' + (Math.abs(cents) / 100).toFixed(2); }
	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
	}
	function lineLabel(type: string, description: string | null) {
		if (description) return description;
		return type === 'rate' ? 'Accommodation' : type === 'tax' ? 'Tax' : type === 'extra' ? 'Extra charge' : type === 'discount' ? 'Discount' : type;
	}
</script>

<svelte:head>
	<title>Folio — {property?.name ?? 'Rezzzo'}</title>
</svelte:head>

<div class="min-h-screen bg-stone-50 py-10 px-4">
<div class="mx-auto max-w-2xl bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">

	<!-- Header -->
	<div class="bg-stone-900 text-white px-8 py-6 flex items-start justify-between gap-4">
		<div>
			{#if property?.logoUrl}
				<img src={property.logoUrl} alt={property.name} class="h-10 w-auto object-contain mb-2 brightness-200" />
			{:else}
				<p class="text-lg font-bold">{property?.name ?? 'Rezzzo'}</p>
			{/if}
			{#if property}
				<p class="text-stone-300 text-xs">{property.address}, {property.city}, {property.province}</p>
				{#if property.phone}<p class="text-stone-300 text-xs">{property.phone}</p>{/if}
				{#if property.gstNumber}<p class="text-stone-400 text-xs mt-0.5">GST/HST: {property.gstNumber}</p>{/if}
			{/if}
		</div>
		<div class="text-right">
			<p class="text-xs text-stone-400 uppercase tracking-widest">Guest Folio</p>
			<p class="font-mono text-xs text-stone-300 mt-1">#{booking.id.slice(-8).toUpperCase()}</p>
		</div>
	</div>

	<!-- Guest + stay summary -->
	<div class="px-8 py-5 border-b border-stone-100 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
		<div>
			<p class="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Guest</p>
			<p class="font-semibold text-stone-900">{booking.guest?.name ?? '—'}</p>
			{#if booking.guest?.email}<p class="text-stone-500 text-xs">{booking.guest.email}</p>{/if}
		</div>
		<div>
			<p class="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Room</p>
			<p class="font-semibold text-stone-900">
				{booking.room ? `Room ${booking.room.roomNumber}` : (booking.requestedRoomType?.name ?? '—')}
			</p>
		</div>
		<div class="mt-2">
			<p class="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Check-in</p>
			<p class="text-stone-700">{fmtDate(booking.checkInDate)}</p>
		</div>
		<div class="mt-2">
			<p class="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Check-out</p>
			<p class="text-stone-700">{fmtDate(booking.checkOutDate)}</p>
		</div>
		<div class="mt-2 col-span-2">
			<p class="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Duration</p>
			<p class="text-stone-700">{nights} night{nights === 1 ? '' : 's'} · {booking.numAdults} adult{booking.numAdults === 1 ? '' : 's'}{booking.numChildren ? `, ${booking.numChildren} child${booking.numChildren === 1 ? '' : 'ren'}` : ''}</p>
		</div>
	</div>

	<!-- Charges -->
	<div class="px-8 py-5">
		<p class="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Charges</p>
		{#if booking.lineItems.length === 0}
			<p class="text-sm text-stone-400">No charges recorded.</p>
		{:else}
		<table class="w-full text-sm">
			<thead>
				<tr class="text-[10px] uppercase tracking-widest text-stone-400 border-b border-stone-100">
					<th class="text-left pb-1.5 font-medium">Description</th>
					<th class="text-right pb-1.5 font-medium">Qty</th>
					<th class="text-right pb-1.5 font-medium">Unit</th>
					<th class="text-right pb-1.5 font-medium">Amount</th>
				</tr>
			</thead>
			<tbody>
			{#each booking.lineItems as li}
				<tr class="border-b border-stone-50">
					<td class="py-1.5 text-stone-700">{lineLabel(li.type, li.description)}</td>
					<td class="py-1.5 text-right text-stone-500">{li.quantity ?? 1}</td>
					<td class="py-1.5 text-right text-stone-500">{li.unitAmount ? fmt(li.unitAmount) : '—'}</td>
					<td class="py-1.5 text-right font-medium {li.totalAmount < 0 ? 'text-green-700' : 'text-stone-900'}">{li.totalAmount < 0 ? '−' : ''}{fmt(li.totalAmount)}</td>
				</tr>
			{/each}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-stone-200 font-semibold">
					<td colspan="3" class="pt-2 text-stone-700">Total charges</td>
					<td class="pt-2 text-right text-stone-900">{fmt(charges)}</td>
				</tr>
			</tfoot>
		</table>
		{/if}
	</div>

	<!-- Payments -->
	<div class="px-8 py-5 bg-stone-50 border-t border-stone-100">
		<p class="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Payments received</p>
		{#if booking.paymentEvents.filter(p => p.type !== 'refund').length === 0}
			<p class="text-sm text-stone-400">No payments recorded.</p>
		{:else}
		<table class="w-full text-sm">
			<tbody>
			{#each booking.paymentEvents.filter(p => p.type !== 'refund') as pe}
				<tr class="border-b border-stone-100">
					<td class="py-1 text-stone-600 capitalize">{pe.type.replace('_', ' ')}</td>
					<td class="py-1 text-right text-stone-400 text-xs">{pe.createdAt ? new Date(pe.createdAt).toLocaleDateString('en-CA') : ''}</td>
					<td class="py-1 text-right font-medium text-green-700">{fmt(pe.amount)}</td>
				</tr>
			{/each}
			{#if refunded > 0}
				<tr class="border-b border-stone-100">
					<td class="py-1 text-stone-600">Refunds</td>
					<td></td>
					<td class="py-1 text-right font-medium text-red-600">−{fmt(refunded)}</td>
				</tr>
			{/if}
			</tbody>
		</table>
		{/if}
	</div>

	<!-- Balance -->
	<div class="px-8 py-5 border-t border-stone-200">
		<div class="flex justify-between items-center text-lg font-bold">
			<span class="text-stone-900">{balance > 0 ? 'Balance owing' : balance < 0 ? 'Credit balance' : 'Paid in full'}</span>
			<span class="{balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-green-600'}">{balance !== 0 ? fmt(balance) : '✓ $0.00'}</span>
		</div>
	</div>

	<!-- Footer -->
	<div class="px-8 py-4 border-t border-stone-100 text-center text-xs text-stone-400">
		Thank you for staying with us. For questions, contact {property?.name ?? 'the property'}{property?.phone ? ` at ${property.phone}` : ''}.
	</div>
</div>
</div>
