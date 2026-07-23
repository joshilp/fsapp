<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const { booking } = $derived(data);
	const guest = $derived(booking.guest);
	const room = $derived(booking.room);
	const property = $derived(room?.property);

	// ─── Line item groups ────────────────────────────────────────────────────
	const rateItems = $derived(booking.lineItems?.filter((li) => li.type === 'rate' || li.type === 'extra') ?? []);
	const taxItems = $derived(booking.lineItems?.filter((li) => li.type === 'tax') ?? []);
	const depositItems = $derived(booking.lineItems?.filter((li) => li.type === 'deposit') ?? []);

	const subtotal = $derived(rateItems.reduce((s, li) => s + li.totalAmount, 0));
	const taxTotal = $derived(taxItems.reduce((s, li) => s + li.totalAmount, 0));
	const depositTotal = $derived(depositItems.reduce((s, li) => s + li.totalAmount, 0)); // negative (legacy line items)
	const grandTotal = $derived(subtotal + taxTotal);

	// Payments from paymentEvents (deposits + final charges − refunds)
	const netPaymentsCents = $derived(
		(booking.paymentEvents ?? []).reduce((s, pe) => s + (pe.type === 'refund' ? -pe.amount : pe.amount), 0)
	);
	// Prefer paymentEvents if any exist; fall back to legacy deposit line items
	const effectivePaidCents = $derived(netPaymentsCents > 0 ? netPaymentsCents : -depositTotal);
	const balanceDue = $derived(Math.max(0, grandTotal - effectivePaidCents));

	function fmt(cents: number) {
		return (Math.abs(cents) / 100).toFixed(2);
	}

	function formatDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
			weekday: 'short',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function nights(checkIn: string, checkOut: string) {
		return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	}

	// ─── Day grid ────────────────────────────────────────────────────────────
	type DayCell = { label: string; inStay: boolean };
	const dayGrid = $derived((): DayCell[][] => {
		const checkIn = new Date(booking.checkInDate + 'T12:00:00');
		const checkOut = new Date(booking.checkOutDate + 'T12:00:00');
		const stayDates = new Set<string>();
		const cur = new Date(checkIn);
		while (cur < checkOut) {
			stayDates.add(cur.toISOString().slice(0, 10));
			cur.setDate(cur.getDate() + 1);
		}
		const start = new Date(checkIn);
		start.setDate(start.getDate() - start.getDay());
		const end = new Date(checkOut);
		end.setDate(end.getDate() + (6 - end.getDay()));
		const weeks: DayCell[][] = [];
		const d = new Date(start);
		while (d <= end) {
			const week: DayCell[] = [];
			for (let i = 0; i < 7; i++) {
				week.push({ label: String(d.getDate()), inStay: stayDates.has(d.toISOString().slice(0, 10)) });
				d.setDate(d.getDate() + 1);
			}
			weeks.push(week);
		}
		return weeks;
	});

	const isCheckedIn = $derived(booking.status === 'checked_in' || booking.status === 'checked_out');

	const backHref = $derived(() => {
		const [y, m] = booking.checkInDate.split('-');
		return `/booking?month=${y}-${m}`;
	});
</script>

<svelte:head>
	<title>Print — {property?.name} Room {room?.roomNumber}</title>
</svelte:head>

<style>
	@media print {
		.no-print { display: none !important; }
		:global(body) { font-size: 11pt; }
		@page { margin: 0.6in; size: letter; }
		* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
	}
</style>

<!-- Print controls (hidden on print) -->
<div class="no-print bg-muted border-border sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2">
	<a href={backHref()} class="text-muted-foreground hover:text-foreground text-sm">← Back</a>
	<span class="text-muted-foreground text-sm">|</span>
	<span class="text-sm font-medium">
		{isCheckedIn ? 'Registration Card' : 'Confirmation Slip'} — Room {room?.roomNumber}
	</span>
	<button
		onclick={() => window.print()}
		class="bg-primary text-primary-foreground hover:bg-primary/90 ml-auto rounded px-3 py-1.5 text-sm font-medium"
	>
		🖨 Print
	</button>
</div>

<!-- ── Document ──────────────────────────────────────────────────────────── -->
<div class="mx-auto max-w-2xl px-6 py-8 font-serif text-sm leading-relaxed print:mx-0 print:px-0 print:py-0">

	<!-- Property header -->
	<div class="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
		<div>
			<div class="text-xl font-bold tracking-tight">{property?.name ?? 'Motel'}</div>
			{#if property?.address}
				<div class="text-gray-600 text-xs">{property.address}, {property.city}, {property.province} {property.postalCode ?? ''}</div>
			{/if}
			{#if property?.phone}
				<div class="text-xs">{property.phone}</div>
			{/if}
		</div>
		<div class="text-right text-xs">
			{#if property?.gstNumber}
				<div>GST #: <strong>{property.gstNumber}</strong></div>
			{/if}
			{#if property?.checkinTime}
				<div class="text-gray-500">Check-in: {property.checkinTime} · Check-out: {property.checkoutTime}</div>
			{/if}
		</div>
	</div>

	<!-- Document title -->
	<div class="mb-5 text-center">
		<div class="text-base font-bold uppercase tracking-widest">
			{isCheckedIn ? 'Registration Card' : 'Booking Confirmation'}
		</div>
	</div>

	{#if !isCheckedIn}
		<!-- ── CONFIRMATION SLIP ────────────────────────────────────────── -->
		<table class="mb-5 w-full text-sm">
			<tbody>
				<tr>
					<td class="w-28 pr-2 text-right font-semibold text-gray-500">Guest:</td>
					<td class="font-bold">{guest?.name ?? '—'}</td>
					<td class="w-28 pr-2 text-right font-semibold text-gray-500">Room:</td>
					<td class="font-bold">{room?.roomNumber} {#if room?.roomType}<span class="font-normal text-gray-500">({room.roomType.name})</span>{/if}</td>
				</tr>
				{#if guest?.phone}
					<tr>
						<td class="pr-2 text-right font-semibold text-gray-500">Phone:</td>
						<td>{guest.phone}</td>
						<td class="pr-2 text-right font-semibold text-gray-500">Channel:</td>
						<td>{booking.channel?.name ?? 'Direct'}</td>
					</tr>
				{/if}
				{#if guest?.street}
					<tr>
						<td class="pr-2 text-right font-semibold text-gray-500">Address:</td>
						<td colspan="3">{guest.street}, {guest.city ?? ''} {guest.provinceState ?? ''}</td>
					</tr>
				{/if}
				<tr>
					<td class="pr-2 text-right font-semibold text-gray-500">Arrival:</td>
					<td>{formatDate(booking.checkInDate)}</td>
					<td class="pr-2 text-right font-semibold text-gray-500">Departure:</td>
					<td>{formatDate(booking.checkOutDate)} ({nights(booking.checkInDate, booking.checkOutDate)} nights)</td>
				</tr>
			</tbody>
		</table>

	{:else}
		<!-- ── REGISTRATION CARD ────────────────────────────────────────── -->

		<!-- Guest writes in: name, address, vehicle, signature -->
		<table class="mb-4 w-full border-collapse text-sm">
			<tbody>
				<tr>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">Name:</td>
					<td class="border-b border-gray-400 py-1 pr-6 min-w-[140px]">{guest?.name ?? ''}</td>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">Phone:</td>
					<td class="border-b border-gray-400 py-1 min-w-[120px]">{guest?.phone ?? ''}</td>
				</tr>
				<tr>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">Address:</td>
					<td class="border-b border-gray-400 py-1 pr-6">{guest?.street ?? ''}</td>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">City:</td>
					<td class="border-b border-gray-400 py-1">{guest?.city ?? ''}</td>
				</tr>
				<tr>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">Province:</td>
					<td class="border-b border-gray-400 py-1 pr-6">{guest?.provinceState ?? ''}</td>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">Country:</td>
					<td class="border-b border-gray-400 py-1">{guest?.country ?? 'Canada'}</td>
				</tr>
				<tr>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">Vehicle:</td>
					<td class="border-b border-gray-400 py-1 pr-6">{[booking.vehicleMake, booking.vehicleColour].filter(Boolean).join(' · ')}</td>
					<td class="py-1 pr-2 text-right text-xs font-semibold text-gray-500">Plate:</td>
					<td class="border-b border-gray-400 py-1">{booking.vehiclePlate ?? ''}</td>
				</tr>
			</tbody>
		</table>

		<!-- Stay summary -->
		<table class="mb-3 w-full text-xs">
			<tbody>
				<tr>
					<td class="pr-6 font-semibold">Room: {room?.roomNumber}</td>
					<td class="pr-6">Arrival: {formatDate(booking.checkInDate)}</td>
					<td class="pr-6">Departure: {formatDate(booking.checkOutDate)}</td>
					<td>Adults: {booking.numAdults} · Children: {booking.numChildren}</td>
				</tr>
			</tbody>
		</table>
	{/if}

	<!-- Day grid (both views) -->
	{#if dayGrid().length > 0}
		<div class="mb-5">
			<div class="mb-1 grid grid-cols-7 gap-px text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">
				{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as dow}
					<div class="py-0.5">{dow}</div>
				{/each}
			</div>
			{#each dayGrid() as week}
				<div class="mb-px grid grid-cols-7 gap-px text-center">
					{#each week as cell}
						<div
							class={[
								'border py-1 text-xs leading-none',
								cell.inStay ? 'border-gray-800 bg-gray-200 font-bold' : 'border-gray-200 text-gray-400'
							].join(' ')}
						>
							{cell.inStay ? '✓' : cell.label}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Charges table -->
	{#if rateItems.length > 0 || taxItems.length > 0}
		<table class="mb-2 w-full text-sm">
			<tbody>
				{#each rateItems as li}
					<tr>
						<td class="py-0.5">{li.label}</td>
						<td class="py-0.5 text-right tabular-nums">${fmt(li.totalAmount)}</td>
					</tr>
				{/each}
				{#if taxItems.length > 0}
					<tr>
						<td colspan="2" class="py-0.5">
							<div class="border-t border-gray-300 pt-1"></div>
						</td>
					</tr>
					{#each taxItems as li}
						<tr>
							<td class="py-0.5 pl-4 text-gray-600">{li.label}</td>
							<td class="py-0.5 text-right tabular-nums text-gray-600">${fmt(li.totalAmount)}</td>
						</tr>
					{/each}
				{/if}
				<tr>
					<td colspan="2" class="py-0.5">
						<div class="border-t border-gray-800 pt-0.5"></div>
					</td>
				</tr>
			<tr>
				<td class="py-0.5 font-semibold">Total</td>
				<td class="py-0.5 text-right font-semibold tabular-nums">${fmt(grandTotal)}</td>
			</tr>
			{#if (booking.paymentEvents ?? []).length > 0}
				{#each booking.paymentEvents ?? [] as pe}
					<tr>
						<td class="py-0.5 text-gray-600 capitalize">
							{pe.type === 'refund' ? 'Refund' : pe.type === 'deposit' ? 'Deposit received' : 'Payment received'}
							{#if pe.paymentMethod}· <span class="uppercase text-[10px]">{pe.paymentMethod}</span>{/if}
						</td>
						<td class="py-0.5 text-right tabular-nums text-gray-600">
							{pe.type === 'refund' ? '+' : '–'}${fmt(pe.amount)}
						</td>
					</tr>
				{/each}
				<tr>
					<td colspan="2" class="py-0.5">
						<div class="border-t border-gray-800 pt-0.5"></div>
					</td>
				</tr>
				<tr>
					<td class="py-0.5 font-bold">Balance Due</td>
					<td class="py-0.5 text-right font-bold tabular-nums">${fmt(balanceDue)}</td>
				</tr>
			{:else if depositItems.length > 0}
				{#each depositItems as li}
					<tr>
						<td class="py-0.5 text-gray-600">{li.label}</td>
						<td class="py-0.5 text-right tabular-nums text-gray-600">–${fmt(Math.abs(li.totalAmount))}</td>
					</tr>
				{/each}
				<tr>
					<td colspan="2" class="py-0.5">
						<div class="border-t border-gray-800 pt-0.5"></div>
					</td>
				</tr>
				<tr>
					<td class="py-0.5 font-bold">Balance Due</td>
					<td class="py-0.5 text-right font-bold tabular-nums">${fmt(balanceDue)}</td>
				</tr>
			{:else}
				<tr>
					<td class="py-0.5 text-gray-500 text-xs italic">Balance due on arrival</td>
					<td class="py-0.5 text-right font-semibold tabular-nums">${fmt(grandTotal)}</td>
				</tr>
			{/if}
			</tbody>
		</table>
	{:else}
		<!-- No charges yet — draw blank lines -->
		<div class="mb-2 space-y-2">
			{#each Array(4) as _}
				<div class="flex items-end justify-between gap-4">
					<div class="h-px flex-1 border-b border-gray-300"></div>
					<div class="w-20 border-b border-gray-300 text-right text-xs text-gray-300">$_____</div>
				</div>
			{/each}
			<div class="flex items-end justify-between gap-4 border-t border-gray-800 pt-1">
				<span class="text-sm font-bold">Total</span>
				<div class="w-20 border-b border-gray-800 text-right text-xs">$_____</div>
			</div>
		</div>
	{/if}

	<!-- Policy / signature -->
	{#if isCheckedIn}
		<div class="mt-4 border-t border-gray-300 pt-3 text-xs text-gray-600">
			{#if property?.policyText}
				<p class="mb-2">{property.policyText}</p>
			{:else}
				<p class="mb-2">I agree to comply with motel regulations and to vacate my room by check-out time.</p>
			{/if}
			<div class="mt-4 flex items-end justify-between gap-8">
				<div class="flex-1">
					<div class="mb-0.5 h-px w-full border-b border-gray-600"></div>
					<div class="text-center text-[10px]">Guest Signature</div>
				</div>
				<div class="w-32">
					<div class="mb-0.5 h-px w-full border-b border-gray-600"></div>
					<div class="text-center text-[10px]">Date</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Confirmation footer -->
		<div class="mt-4 border-t border-gray-300 pt-3 text-xs text-gray-600">
			{#if property?.policyText}
				<p>{property.policyText}</p>
			{/if}
			{#if property?.cancellationPolicy}
				<p class="mt-1"><strong>Cancellation:</strong> {property.cancellationPolicy}</p>
			{:else if property}
				{@const feeDollars = ((property.cancellationFeeCents ?? 0) / 100).toFixed(2)}
				{@const noRefund = property.noRefundDays ?? 0}
				<p class="mt-1">
					<strong>Cancellation policy:</strong>
					{#if noRefund > 0}
						Cancellations within {noRefund} day{noRefund === 1 ? '' : 's'} of check-in receive no refund.
					{/if}
					{#if (property.cancellationFeeCents ?? 0) > 0}
						A ${feeDollars} cancellation fee applies to all cancellations.
					{/if}
					{#if noRefund === 0 && (property.cancellationFeeCents ?? 0) === 0}
						No cancellation fee.
					{/if}
				</p>
			{/if}
			{#if property?.depositNights && property.depositNights > 0}
				<p class="mt-1 text-gray-500">Deposit: {property.depositNights} night{property.depositNights === 1 ? '' : 's'} required at time of booking.</p>
			{/if}
			<p class="mt-2 italic">Please present this confirmation upon arrival. Thank you for choosing {property?.name}!</p>
		</div>
	{/if}

	<!-- Issued by / date (small, bottom) -->
	<div class="mt-4 text-right text-[10px] text-gray-400">
		Issued: {new Date().toLocaleDateString('en-CA')}
		{#if booking.clerk?.name || booking.clerkName}
			· Clerk: {booking.clerkName ?? booking.clerk?.name}
		{/if}
	</div>
</div>
