<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const { booking } = data;

	const prop   = booking.room?.property;
	const guest  = booking.guest;
	const rates  = (booking.lineItems ?? []).filter(l => l.type === 'rate');
	const extras = (booking.lineItems ?? []).filter(l => l.type === 'extra');
	const taxes  = (booking.lineItems ?? []).filter(l => l.type === 'tax');

	const chargesTotal = (booking.lineItems ?? []).reduce((s, l) => s + l.totalAmount, 0);
	const collected    = (booking.paymentEvents ?? [])
		.filter(p => p.type !== 'refund' && (p as {status?:string}).status !== 'pending')
		.reduce((s, p) => s + p.amount, 0);
	const refunded     = (booking.paymentEvents ?? [])
		.filter(p => p.type === 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const balance = chargesTotal - collected + refunded;

	function fmt(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
	}
	function fmtShort(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function fmtMoney(cents: number) { return '$' + (cents / 100).toFixed(2); }
	function fmtPayType(t: string) { return ({deposit:'Deposit',final_charge:'Payment',refund:'Refund'} as Record<string,string>)[t] ?? t; }
	function fmtMethod(m: string | null) { return ({cash:'Cash',card:'Card',etransfer:'e-Transfer',check:'Cheque',other:'Other'} as Record<string,string>)[m ?? ''] ?? (m ?? ''); }

	const nights = Math.max(0, Math.round(
		(new Date(booking.checkOutDate + 'T12:00:00').getTime() -
		 new Date(booking.checkInDate  + 'T12:00:00').getTime()) / 86400000
	));

	const statusLabel = ({ reserved:'Pending', confirmed:'Confirmed', checked_in:'Checked In', checked_out:'Checked Out', cancelled:'Cancelled' } as Record<string,string>)[booking.status] ?? booking.status;
</script>

<svelte:head>
	<title>Receipt — {guest?.name ?? 'Guest'} · {booking.checkInDate}</title>
</svelte:head>

<div class="min-h-screen bg-white p-8 text-gray-900 print:p-4" id="receipt">

	<!-- Header -->
	<div class="mb-6 flex items-start justify-between border-b border-gray-200 pb-6">
		<div>
			{#if prop?.logoUrl}
				<img src={prop.logoUrl} alt={prop.name} class="mb-2 h-12 object-contain" />
			{/if}
			<h1 class="text-xl font-bold">{prop?.name ?? 'Property'}</h1>
			{#if prop?.address}<p class="text-sm text-gray-500">{prop.address}{#if prop.city}, {prop.city}{/if}{#if prop.province}, {prop.province}{/if}</p>{/if}
			{#if prop?.phone}<p class="text-sm text-gray-500">{prop.phone}</p>{/if}
			{#if prop?.gstNumber}<p class="text-xs text-gray-400 mt-1">GST/HST #: {prop.gstNumber}</p>{/if}
		</div>
		<div class="text-right">
			<p class="text-2xl font-bold text-gray-800">Receipt</p>
			<p class="mt-1 text-xs text-gray-400">Booking ID: {booking.id.slice(0, 8).toUpperCase()}</p>
			<p class="text-xs text-gray-400">Printed: {new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
			<span class="mt-2 inline-block rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
				{statusLabel}
			</span>
		</div>
	</div>

	<!-- Guest + Stay -->
	<div class="mb-6 grid grid-cols-2 gap-6">
		<div>
			<p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Guest</p>
			<p class="font-semibold">{guest?.name ?? '—'}</p>
			{#if guest?.email}<p class="text-sm text-gray-500">{guest.email}</p>{/if}
			{#if guest?.phone}<p class="text-sm text-gray-500">{guest.phone}</p>{/if}
		</div>
		<div>
			<p class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Stay</p>
			{#if booking.room?.roomNumber}
				<p class="font-semibold">Room {booking.room.roomNumber}{#if booking.room.roomType?.name} — {booking.room.roomType.name}{/if}</p>
			{/if}
			<p class="text-sm text-gray-600">{fmt(booking.checkInDate)} → {fmtShort(booking.checkOutDate)}</p>
			<p class="text-sm text-gray-500">{nights} night{nights === 1 ? '' : 's'} · {booking.numAdults} adult{booking.numAdults === 1 ? '' : 's'}{booking.numChildren ? `, ${booking.numChildren} child${booking.numChildren === 1 ? '' : 'ren'}` : ''}</p>
			{#if booking.channel?.name}<p class="text-xs text-gray-400">{booking.channel.name}</p>{/if}
		</div>
	</div>

	<!-- Charges -->
	<div class="mb-6">
		<p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Charges</p>
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-gray-200 text-left text-xs text-gray-400">
					<th class="pb-1 font-medium">Description</th>
					<th class="pb-1 text-center font-medium">Qty</th>
					<th class="pb-1 text-right font-medium">Unit</th>
					<th class="pb-1 text-right font-medium">Amount</th>
				</tr>
			</thead>
			<tbody>
				{#each rates as l}
					<tr class="border-b border-gray-100">
						<td class="py-1.5">{l.label}</td>
						<td class="py-1.5 text-center text-gray-500">{l.quantity ?? ''}</td>
						<td class="py-1.5 text-right text-gray-500">{l.unitAmount ? fmtMoney(l.unitAmount) : ''}</td>
						<td class="py-1.5 text-right font-medium">{fmtMoney(l.totalAmount)}</td>
					</tr>
				{/each}
				{#each extras as l}
					<tr class="border-b border-gray-100">
						<td class="py-1.5 text-gray-700">{l.label}</td>
						<td class="py-1.5 text-center text-gray-500">{l.quantity ?? ''}</td>
						<td class="py-1.5 text-right text-gray-500">{l.unitAmount ? fmtMoney(l.unitAmount) : ''}</td>
						<td class="py-1.5 text-right">{fmtMoney(l.totalAmount)}</td>
					</tr>
				{/each}
			{#if taxes.length > 0}
				<!-- Subtotal row before taxes -->
				<tr class="border-t border-gray-200">
					<td colspan="3" class="py-1.5 text-right text-xs text-gray-400">Subtotal (before tax)</td>
					<td class="py-1.5 text-right text-xs text-gray-500">
						{fmtMoney([...rates, ...extras].reduce((s, l) => s + l.totalAmount, 0))}
					</td>
				</tr>
				{#each taxes as l}
					<tr class="border-b border-gray-100">
						<td class="py-1.5 text-gray-600" colspan="3">
							{l.label}{l.taxPercent ? ` (${l.taxPercent}%)` : ''}
						</td>
						<td class="py-1.5 text-right text-gray-600">{fmtMoney(l.totalAmount)}</td>
					</tr>
				{/each}
			{/if}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-gray-300 font-bold">
					<td colspan="3" class="pt-2">Total</td>
					<td class="pt-2 text-right">{fmtMoney(chargesTotal)}</td>
				</tr>
			</tfoot>
		</table>
	</div>

	<!-- Payments -->
	{#if booking.paymentEvents && booking.paymentEvents.length > 0}
		<div class="mb-6">
			<p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Payments</p>
			<table class="w-full text-sm">
				<tbody>
					{#each booking.paymentEvents as pe}
						{@const isPending = (pe as {status?:string}).status === 'pending'}
						<tr class="border-b border-gray-100 {isPending ? 'text-gray-400' : ''}">
							<td class="py-1.5">
								{fmtPayType(pe.type)}
								{#if isPending}<span class="ml-1 text-xs">(pending)</span>{/if}
							</td>
							<td class="py-1.5 text-gray-500">{fmtMethod(pe.paymentMethod)}</td>
							<td class="py-1.5 text-gray-400 text-xs">{pe.chargedAt ? new Date(pe.chargedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</td>
							<td class="py-1.5 text-right {pe.type === 'refund' ? 'text-red-600' : ''}">
								{pe.type === 'refund' ? '−' : ''}{fmtMoney(pe.amount)}
							</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="border-t-2 border-gray-300 font-bold {balance > 0 ? 'text-amber-700' : 'text-green-700'}">
						<td colspan="3" class="pt-2">{balance > 0 ? 'Balance due' : 'Paid in full'}</td>
						<td class="pt-2 text-right">{balance > 0 ? fmtMoney(balance) : '✓'}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}

	<!-- Notes -->
	{#if booking.notes}
		<div class="mb-6 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
			<p class="mb-0.5 text-xs font-semibold uppercase text-gray-400">Notes</p>
			{booking.notes}
		</div>
	{/if}

	<!-- Footer / actions -->
	<div class="mt-8 flex items-center justify-between border-t border-gray-200 pt-4 print:hidden">
		<a href="/booking" class="text-sm text-blue-600 underline hover:text-blue-800">← Back to bookings</a>
		<div class="flex gap-2">
			{#if booking.publicToken}
				<button onclick={() => { navigator.clipboard.writeText(`${location.origin}/receipt/${booking.publicToken}`); }}
					class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
					📋 Copy guest link
				</button>
			{/if}
			<button onclick={() => window.print()}
				class="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
				🖨 Print
			</button>
		</div>
	</div>

	<!-- Print footer -->
	<div class="mt-8 hidden text-center text-xs text-gray-400 print:block">
		Thank you for staying with us.
	</div>
</div>

<style>
	@media print {
		@page { margin: 1cm; }
		button, a { display: none !important; }
	}
</style>
