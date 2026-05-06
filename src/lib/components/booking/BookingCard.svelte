<script lang="ts">
	/**
	 * Unified booking card — full lifecycle: reservation → check-in → checkout.
	 * newBooking prop = creating fresh; bookingId prop = viewing/editing existing.
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import GroupCard from './GroupCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	type Channel = { id: string; name: string };
	type User    = { id: string; name: string };
	type NewBooking = { propertyId: string; propertyName: string; roomId: string; roomNumber: string; roomConfigs: string[]; checkIn: string; checkOut: string };
	type RateLine = { id: string; label: string; qty: string; unit: string; total: string };
	type TaxLine  = { id: string; presetId: string; label: string; total: string };
	type Payment  = { id: string; type: string; amount: number; paymentMethod: string; notes: string | null; chargedAt: number | null };
	type TaxPreset = { id: string; label: string; ratePercent: number };
	type BookingType = 'walkin' | 'phone' | 'website' | 'bookingcom' | 'expedia' | 'airbnb' | 'other';

	const BOOKING_TYPES: { id: BookingType; label: string; channelMatch: string }[] = [
		{ id: 'walkin',     label: 'Walk-In',     channelMatch: 'Direct' },
		{ id: 'phone',      label: 'Phone',       channelMatch: 'Direct' },
		{ id: 'website',    label: 'Website',     channelMatch: 'Website' },
		{ id: 'bookingcom', label: 'Booking.com', channelMatch: 'Booking.com' },
		{ id: 'expedia',    label: 'Expedia',     channelMatch: 'Expedia' },
		{ id: 'airbnb',     label: 'Airbnb',      channelMatch: 'Airbnb' },
		{ id: 'other',      label: 'Other',       channelMatch: 'Direct' },
	];

	type GroupRoom = { roomId: string; roomNumber: string; checkIn: string; checkOut: string; roomConfigs: string[] };

	type Props = {
		open: boolean;
		newBooking?: NewBooking;
		groupRooms?: GroupRoom[];
		bookingId?: string;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		today: string;
		propertyName?: string;
	};

	let { open = $bindable(false), newBooking, groupRooms, bookingId, channels, users, currentUserId, today, propertyName }: Props = $props();

	// ── UI state ──────────────────────────────────────────────────────────────
	let loading   = $state(false);
	let saving    = $state(false);
	let saveError = $state('');
	let formEl: HTMLFormElement | undefined = $state();

	// ── Booking fields ────────────────────────────────────────────────────────
	let status       = $state('confirmed');
	let propId       = $state('');
	let propName     = $state('');
	let roomId_      = $state('');
	let roomNumber_  = $state('');
	let roomTypeName = $state('');
	let roomConfigs_ = $state<string[]>([]);
	let selConfig    = $state('');
	let checkIn      = $state(today);
	let checkOut     = $state('');
	let channelId    = $state('');
	let bookingType  = $state<BookingType>('phone');
	let intent       = $state<'save' | 'checkIn' | 'checkOut'>('save');
	let otaRef       = $state('');
	let notes        = $state('');
	let checkoutNotes = $state('');
	let showCheckoutBar = $state(false);

	// ── Guest ─────────────────────────────────────────────────────────────────
	let guestId      = $state('');
	let guestName    = $state('');
	let guestPhone   = $state('');
	let guestEmail   = $state('');
	let guestStreet  = $state('');
	let guestCity    = $state('');
	let guestProv    = $state('');
	let guestCountry = $state('');
	let guestRating  = $state<number | null>(null);
	let guestRatingNotes = $state<string | null>(null);
	let showAddress  = $state(false);
	let numAdults    = $state(1);
	let numChildren  = $state(0);
	let vehMake      = $state('');
	let vehColour    = $state('');
	let vehPlate     = $state('');
	let waiverSigned = $state(false);

	// ── Charges ───────────────────────────────────────────────────────────────
	let rateLines = $state<RateLine[]>([{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }]);
	let taxLines  = $state<TaxLine[]>([]);
	let taxPresets = $state<TaxPreset[]>([]);
	let rateLoading = $state(false);

	// ── Payments ──────────────────────────────────────────────────────────────
	let payments     = $state<Payment[]>([]);
	let ccInfo       = $state<{ lastFour: string | null; cardType: string | null } | null>(null);
	let addingPay    = $state(false);
	let payAmt       = $state('');
	let payMethod    = $state('cash');
	let payType      = $state('final_charge');
	let payNotes     = $state('');
	let payErr       = $state('');
	let payBusy      = $state(false);

	// ── Group info ────────────────────────────────────────────────────────────
	let groupInfo = $state<{ id: string; name: string; billingType: string; organizerName: string | null } | null>(null);
	let groupCardOpen = $state(false);

	// ── Toggle check-in / check-out ────────────────────────────────────────────
	let toggleBusy = $state(false);
	let toggleMsg  = $state('');

	// ── Cancel booking ─────────────────────────────────────────────────────────
	let cancelBusy   = $state(false);
	let cancelPreview = $state<{
		daysToCheckin: number;
		depositPaidCents: number;
		cancellationFeeCents: number;
		refundCents: number;
		noRefund: boolean;
	} | null>(null);
	let cancelOpen = $state(false);

	async function openCancelDialog() {
		if (!bookingId) return;
		cancelBusy = true;
		try {
			// Fetch real policy preview from server
			const r = await fetch(`/api/booking/${bookingId}/cancel`);
			if (r.ok) {
				cancelPreview = await r.json();
			} else {
				// Fallback: local estimate
				const checkInMs = new Date(checkIn + 'T12:00:00').getTime();
				const todayMs   = (() => { const d = new Date(); d.setHours(12,0,0,0); return d.getTime(); })();
				cancelPreview = {
					daysToCheckin: Math.round((checkInMs - todayMs) / 86400000),
					depositPaidCents: collected - refunded,
					cancellationFeeCents: 2500,
					refundCents: 0,
					noRefund: false
				};
			}
			cancelOpen = true;
		} finally { cancelBusy = false; }
	}

	async function confirmCancel() {
		if (!bookingId) return;
		cancelBusy = true;
		try {
			const r = await fetch(`/api/booking/${bookingId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
			const d = await r.json();
			if (!r.ok) { toggleMsg = d.error ?? 'Cancel failed'; cancelOpen = false; return; }
			cancelPreview = d;
			cancelOpen = false;
			status = 'cancelled';
			await invalidateAll();
			await fetchCard(bookingId);
		} catch { toggleMsg = 'Network error.'; }
		finally { cancelBusy = false; }
	}

	// ── Deposit auto-suggest ───────────────────────────────────────────────────
	// suggestDeposit reads the first rate line's first-night unit price and fills
	// the depositAmount input if it's empty.
	let depositAmt = $state('');

	async function toggleCheckin() {
		if (!bookingId || toggleBusy) return;
		toggleBusy = true; toggleMsg = '';
		try {
			const r = await fetch(`/api/booking/${bookingId}/toggle-checkin`, { method: 'POST' });
			const d = await r.json();
			if (!r.ok) { toggleMsg = d.error ?? 'Error'; return; }
			status = d.status;
		} catch { toggleMsg = 'Network error.'; }
		finally { toggleBusy = false; await invalidateAll(); }
	}

	async function toggleCheckout() {
		if (!bookingId || toggleBusy) return;
		if (status !== 'checked_in' && status !== 'checked_out') {
			toggleMsg = 'Check in the guest first.'; return;
		}
		toggleBusy = true; toggleMsg = '';
		try {
			const r = await fetch(`/api/booking/${bookingId}/toggle-checkout`, { method: 'POST' });
			const d = await r.json();
			if (!r.ok) { toggleMsg = d.error ?? 'Error'; return; }
			status = d.status;
			if (d.unpaid && status === 'checked_out') {
				toggleMsg = '⚠ Checked out with unpaid balance.';
			}
		} catch { toggleMsg = 'Network error.'; }
		finally { toggleBusy = false; await invalidateAll(); }
	}
	let suggestions   = $state<{ id: string; name: string; phone: string | null }[]>([]);
	let showSuggest   = $state(false);
	let nameTimer: ReturnType<typeof setTimeout>;

	// ── Derived ───────────────────────────────────────────────────────────────
	const nights = $derived.by(() => {
		if (!checkIn || !checkOut) return 0;
		return Math.max(0, Math.round((new Date(checkOut+'T12:00:00').getTime() - new Date(checkIn+'T12:00:00').getTime()) / 86400000));
	});
	const rateTotal  = $derived(rateLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const taxTotal   = $derived(taxLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const grandTotal = $derived(rateTotal + taxTotal);
	const collected  = $derived(payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0));
	const refunded   = $derived(payments.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0));
	const balanceCents = $derived(Math.round(grandTotal * 100) - collected + refunded);
	const isOta      = $derived(['bookingcom','expedia','airbnb','other'].includes(bookingType));
	const isNew      = $derived(!bookingId);

	// Auto-suggest deposit when rate lines change (only if no deposit set yet)
	$effect(() => {
		if (!isNew || depositAmt) return;
		const firstUnit = parseFloat(rateLines[0]?.unit || '');
		if (firstUnit > 0) depositAmt = firstUnit.toFixed(2);
	});
	const cardTitle = $derived(roomNumber_ ? `Room ${roomNumber_}${propName ? ' · '+propName : ''}` : 'New Booking');
	const cardDesc  = $derived(checkIn && checkOut ? `${fmt(checkIn)} → ${fmt(checkOut)} · ${nights} night${nights===1?'':'s'}` : '');

	const statusLabel = $derived(({ confirmed:'Reserved', checked_in:'Checked In', checked_out:'Checked Out', cancelled:'Cancelled', blocked:'Blocked' } as Record<string,string>)[status] ?? status);
	const statusCls   = $derived(({ confirmed:'bg-blue-100 text-blue-700 border-blue-200', checked_in:'bg-green-100 text-green-700 border-green-200', checked_out:'bg-gray-100 text-gray-600 border-gray-200', cancelled:'bg-red-100 text-red-600 border-red-200' } as Record<string,string>)[status] ?? 'bg-muted text-muted-foreground border-border');

	const RATING: Record<number,{label:string;cls:string}> = {
		1:{label:'★ Excellent',cls:'bg-green-100 text-green-800'},
		2:{label:'★ Good',cls:'bg-lime-100 text-lime-800'},
		3:{label:'☆ Neutral',cls:'bg-gray-100 text-gray-600'},
		4:{label:'⚠ Caution',cls:'bg-yellow-100 text-yellow-800'},
		5:{label:'⛔ Block',cls:'bg-red-100 text-red-800'},
	};

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	$effect(() => {
		if (open) {
			if (bookingId) fetchCard(bookingId);
			else if (groupRooms?.length) initGroup(groupRooms);
			else if (newBooking) initNew(newBooking);
		} else {
			reset();
		}
	});

	function reset() {
		loading = false; saving = false; saveError = '';
		status = 'confirmed'; propId = ''; propName = ''; roomId_ = ''; roomNumber_ = '';
		roomTypeName = ''; roomConfigs_ = []; selConfig = ''; checkIn = today; checkOut = '';
		channelId = ''; bookingType = 'phone'; otaRef = ''; notes = ''; checkoutNotes = '';
		showCheckoutBar = false; intent = 'save';
		guestId = ''; guestName = ''; guestPhone = ''; guestEmail = ''; guestStreet = '';
		guestCity = ''; guestProv = ''; guestCountry = ''; guestRating = null; guestRatingNotes = null;
		showAddress = false; numAdults = 1; numChildren = 0; vehMake = ''; vehColour = ''; vehPlate = '';
		waiverSigned = false;
		rateLines = [{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }];
		taxLines = []; taxPresets = []; payments = []; ccInfo = null;
		addingPay = false; payAmt = ''; payMethod = 'cash'; payType = 'final_charge'; payNotes = ''; payErr = '';
		suggestions = []; showSuggest = false;
		depositAmt = ''; cancelPreview = null; cancelOpen = false; cancelBusy = false;
	}

	function initNew(nb: NewBooking) {
		propId = nb.propertyId; propName = nb.propertyName;
		roomId_ = nb.roomId; roomNumber_ = nb.roomNumber;
		roomConfigs_ = nb.roomConfigs; selConfig = nb.roomConfigs[0] ?? '';
		checkIn = nb.checkIn; checkOut = nb.checkOut;
		channelId = defChannel('phone');
		fetchTaxPresets();
		suggestRate(true); // auto-fill rates silently on open
	}

	function initGroup(gr: { roomId: string; roomNumber: string; checkIn: string; checkOut: string; roomConfigs: string[] }[]) {
		if (!gr.length) return;
		const first = gr[0];
		propName = propertyName ?? '';
		roomId_ = first.roomId; roomNumber_ = first.roomNumber;
		roomConfigs_ = first.roomConfigs; selConfig = first.roomConfigs[0] ?? '';
		checkIn = first.checkIn; checkOut = first.checkOut;
		channelId = defChannel('phone');
		fetchTaxPresets();
		suggestRate(true);
	}

	async function fetchTaxPresets() {
		try {
			const r = await fetch('/api/tax-presets');
			if (r.ok) taxPresets = await r.json();
		} catch { /* ignore */ }
	}

	async function fetchCard(id: string) {
		loading = true;
		try {
			const r = await fetch(`/api/booking/card/${id}`);
			if (!r.ok) throw new Error('Load failed');
			const d = await r.json();
			const b = d.booking;
			status = b.status; propId = b.propertyId;
			propName = b.room?.property?.name ?? propertyName ?? '';
			roomId_ = b.roomId ?? ''; roomNumber_ = b.room?.roomNumber ?? '';
			roomTypeName = b.room?.roomType?.name ?? '';
			roomConfigs_ = b.roomConfigs ?? []; selConfig = b.roomConfig ?? roomConfigs_[0] ?? '';
			checkIn = b.checkInDate; checkOut = b.checkOutDate;
			channelId = b.channelId ?? ''; otaRef = b.otaConfirmationNumber ?? '';
			notes = b.notes ?? ''; checkoutNotes = b.checkoutNotes ?? '';
			numAdults = b.numAdults; numChildren = b.numChildren;
			vehMake = b.vehicleMake ?? ''; vehColour = b.vehicleColour ?? ''; vehPlate = b.vehiclePlate ?? '';
			waiverSigned = b.waiverSigned ?? false;
			taxPresets = d.presets ?? []; ccInfo = d.cc ?? null;
			payments = b.paymentEvents ?? [];
			groupInfo = d.groupInfo ?? null;
			const chName = b.channel?.name ?? '';
			const mt = BOOKING_TYPES.find(t => t.channelMatch.toLowerCase() === chName.toLowerCase());
			bookingType = mt?.id ?? (b.channel?.isOta ? 'bookingcom' : 'phone');
			if (b.guest) {
				const g = b.guest;
				guestId = g.id; guestName = g.name; guestPhone = g.phone ?? '';
				guestEmail = g.email ?? ''; guestStreet = g.street ?? '';
				guestCity = g.city ?? ''; guestProv = g.provinceState ?? '';
				guestCountry = g.country ?? '';
				guestRating = g.rating; guestRatingNotes = g.ratingNotes;
				showAddress = b.status !== 'confirmed';
			}
			const rates = (b.lineItems ?? []).filter((l: {type:string}) => l.type === 'rate' || l.type === 'extra');
			const taxes = (b.lineItems ?? []).filter((l: {type:string}) => l.type === 'tax');
			rateLines = rates.length ? rates.map((l: {id:string;label:string;quantity:number|null;unitAmount:number|null;totalAmount:number}) => ({
				id: l.id, label: l.label,
				qty: String(l.quantity ?? ''),
				unit: l.unitAmount ? (l.unitAmount/100).toFixed(2) : '',
				total: (l.totalAmount/100).toFixed(2)
			})) : [{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }];
			taxLines = taxes.map((l: {id:string;label:string;totalAmount:number}) => ({ id: l.id, presetId: '', label: l.label, total: (l.totalAmount/100).toFixed(2) }));
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fmt(iso: string) {
		return new Date(iso+'T12:00:00').toLocaleDateString('en-CA', { weekday:'short', month:'short', day:'numeric' });
	}
	function nextDay(iso: string) {
		const d = new Date(iso+'T12:00:00'); d.setDate(d.getDate()+1);
		return d.toISOString().slice(0,10);
	}
	function fmtMoney(cents: number) { return '$'+(cents/100).toFixed(2); }
	function fmtPayType(t: string) { return ({deposit:'Deposit',final_charge:'Charge',refund:'Refund'} as Record<string,string>)[t] ?? t; }

	function defChannel(type: BookingType) {
		const match = BOOKING_TYPES.find(t => t.id === type)?.channelMatch ?? 'Direct';
		return channels.find(c => c.name.toLowerCase() === match.toLowerCase())?.id
			?? channels.find(c => c.name === 'Direct')?.id ?? channels[0]?.id ?? '';
	}

	function pickType(t: BookingType) { bookingType = t; channelId = defChannel(t); }

	function calcRateTotal(l: RateLine) {
		const q = parseFloat(l.qty)||0, u = parseFloat(l.unit)||0;
		if (q && u) l.total = (q*u).toFixed(2);
	}

	function applyPreset(line: TaxLine, pid: string) {
		const p = taxPresets.find(x => x.id === pid); if (!p) return;
		line.presetId = pid; line.label = p.label;
		line.total = ((Math.round(rateTotal*100) * p.ratePercent / 100) / 100).toFixed(2);
	}

	async function suggestRate(force = false) {
		if (!roomId_ || !checkIn || !checkOut || checkIn >= checkOut) return;
		if (!force) {
			const hasRates = rateLines.some(l => parseFloat(l.total) > 0);
			if (hasRates) {
				const ok = window.confirm('This will replace the current rate lines with the suggested pricing. Continue?');
				if (!ok) return;
			}
		}
		rateLoading = true;
		try {
			const r = await fetch(`/api/pricing/suggest?roomId=${encodeURIComponent(roomId_)}&checkIn=${checkIn}&checkOut=${checkOut}`);
			if (r.ok) {
				const d = await r.json();
				if (d?.lines?.length) rateLines = d.lines.map((l: {seasonName:string;nights:number;unitCents:number;totalCents:number}) => ({
					id: crypto.randomUUID(),
					label: `${l.seasonName} · ${l.nights} night${l.nights===1?'':'s'}`,
					qty: String(l.nights), unit: (l.unitCents/100).toFixed(2), total: (l.totalCents/100).toFixed(2)
				}));
				// Set deposit suggestion from API (policy-aware), only if empty
				if (!depositAmt && d.suggestedDepositCents > 0) {
					depositAmt = (d.suggestedDepositCents / 100).toFixed(2);
				}
			}
		} catch { /* ignore */ } finally { rateLoading = false; }
	}

	async function onNameInput() {
		clearTimeout(nameTimer);
		if (guestName.length < 2) { suggestions = []; showSuggest = false; return; }
		nameTimer = setTimeout(async () => {
			try {
				const r = await fetch(`/api/guests?name=${encodeURIComponent(guestName)}`);
				if (r.ok) { suggestions = await r.json(); showSuggest = suggestions.length > 0; }
			} catch { /* ignore */ }
		}, 250);
	}

	let phoneTimer: ReturnType<typeof setTimeout>;
	async function onPhoneInput() {
		clearTimeout(phoneTimer);
		const digits = guestPhone.replace(/\D/g, '');
		if (digits.length < 3) { suggestions = []; showSuggest = false; return; }
		phoneTimer = setTimeout(async () => {
			try {
				const r = await fetch(`/api/guests?phone=${encodeURIComponent(guestPhone)}`);
				if (r.ok) { suggestions = await r.json(); showSuggest = suggestions.length > 0; }
			} catch { /* ignore */ }
		}, 250);
	}

	function pickGuest(s: { id: string; name: string; phone: string | null }) {
		guestId = s.id; guestName = s.name;
		if (s.phone) guestPhone = s.phone;
		showSuggest = false;
	}

	function submitWith(i: 'save' | 'checkIn' | 'checkOut') {
		intent = i;
		if (i === 'checkIn') showAddress = true;
		tick().then(() => formEl?.requestSubmit());
	}

	function handleEnhance() {
		saving = true; saveError = '';
		return async ({ result }: { result: { type: string; data?: unknown } }) => {
			saving = false;
			if (result.type === 'redirect' || result.type === 'success') {
				open = false; await invalidateAll();
			} else if (result.type === 'failure') {
				saveError = (result.data as { error?: string })?.error ?? 'Save failed';
			}
		};
	}

	async function recordPayment() {
		if (!bookingId) return;
		payErr = '';
		const amt = parseFloat(payAmt);
		if (!amt || amt <= 0) { payErr = 'Enter a valid amount'; return; }
		payBusy = true;
		const fd = new FormData();
		fd.set('bookingId', bookingId); fd.set('amount', payAmt);
		fd.set('method', payMethod); fd.set('type', payType);
		if (payNotes) fd.set('notes', payNotes);
		try {
			await fetch('/booking?/addPayment', { method: 'POST', body: fd });
			addingPay = false; payAmt = ''; payNotes = '';
			await fetchCard(bookingId);
		} catch { payErr = 'Network error'; }
		payBusy = false;
	}
</script>

<CustomDialog bind:open title={cardTitle} description={cardDesc} dialogClass="sm:max-w-3xl" interactOutsideBehavior="ignore">

	{#snippet actions()}
		<span class={['rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusCls].join(' ')}>{statusLabel}</span>
	{/snippet}

	{#snippet content()}
		{#if loading}
			<div class="flex items-center justify-center py-16 text-sm text-muted-foreground">Loading…</div>
		{:else}
			<!-- Error -->
			{#if saveError}
				<div class="mx-4 mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>
			{/if}

			<!-- Group banner -->
			{#if groupInfo}
				<div class="mx-4 mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs flex items-center gap-2 text-blue-800">
					<span class="text-base">👥</span>
					<span>Part of group: <strong>{groupInfo.name}</strong>{#if groupInfo.organizerName} · {groupInfo.organizerName}{/if}</span>
					<button type="button" onclick={() => { groupCardOpen = true; }}
						class="ml-auto rounded border border-blue-300 px-2 py-0.5 hover:bg-blue-100 font-medium">
						View Group →
					</button>
				</div>
			{/if}

			<!-- Check-in / Check-out toggles (existing bookings only) -->
			{#if bookingId && status !== 'cancelled'}
				<div class="mx-4 mt-3 flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
					<span class="text-xs text-muted-foreground font-medium">Status:</span>
					<button type="button"
						onclick={toggleCheckin}
						disabled={toggleBusy || status === 'checked_out'}
						class={['flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
							status === 'checked_in' || status === 'checked_out'
								? 'border-green-300 bg-green-100 text-green-800'
								: 'border-border bg-background text-muted-foreground hover:bg-muted'
						].join(' ')}>
						{status === 'checked_in' || status === 'checked_out' ? '✓' : '○'} Checked In
					</button>
					<button type="button"
						onclick={toggleCheckout}
						disabled={toggleBusy || status === 'confirmed'}
						class={['flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
							status === 'checked_out'
								? 'border-gray-400 bg-gray-100 text-gray-700'
								: 'border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40'
						].join(' ')}>
						{status === 'checked_out' ? '✓' : '○'} Checked Out
					</button>
					{#if toggleMsg}
						<span class={['text-xs ml-1', toggleMsg.startsWith('⚠') ? 'text-amber-700' : 'text-destructive'].join(' ')}>{toggleMsg}</span>
					{/if}
				</div>
			{/if}

			<!-- Guest rating warning -->
			{#if guestRating && guestRating >= 4}
				<div class={['mx-4 mt-3 rounded-md border px-3 py-2 text-sm', guestRating===5 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'].join(' ')}>
					<strong>{RATING[guestRating]?.label}</strong>{#if guestRatingNotes} — {guestRatingNotes}{/if}
				</div>
			{/if}

			<form id="bc-form" bind:this={formEl} method="POST" action="/booking?/saveCard" use:enhance={handleEnhance} autocomplete="off">
				<!-- Hidden fields -->
				<input type="hidden" name="bookingId"   value={bookingId ?? ''} />
				<input type="hidden" name="intent"      bind:value={intent} />
				<input type="hidden" name="propertyId"  value={propId} />
				<input type="hidden" name="roomId"      value={roomId_} />
				<input type="hidden" name="channelId"   value={channelId} />
				<input type="hidden" name="bookingType" value={bookingType} />
				<input type="hidden" name="guestId"     value={guestId} />
				<input type="hidden" name="clerkUserId" value={currentUserId} />
				<input type="hidden" name="rateCount"   value={rateLines.length} />
				<input type="hidden" name="taxCount"    value={taxLines.length} />
				{#if !isOta}<input type="hidden" name="otaConfirmationNumber" value="" />{/if}

				<div class="grid gap-5 p-4 sm:grid-cols-2">

					<!-- ╔═══════════════════════════════════════╗
					     ║  LEFT: Stay · Source · Guest          ║
					     ╚═══════════════════════════════════════╝ -->
					<div class="space-y-5">

						<!-- Stay -->
						<section class="rounded-lg border border-border bg-card p-3">
							<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</h3>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="mb-1 block text-xs text-muted-foreground" for="bc-ci">Check-in</label>
									<input id="bc-ci" name="checkIn" type="date" bind:value={checkIn}
										oninput={() => { if (checkOut <= checkIn) checkOut = nextDay(checkIn); }}
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required />
								</div>
								<div>
									<label class="mb-1 block text-xs text-muted-foreground" for="bc-co">Check-out</label>
									<input id="bc-co" name="checkOut" type="date" bind:value={checkOut}
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required />
								</div>
							</div>
							{#if roomConfigs_.length > 1}
								<div class="mt-2">
									<label class="mb-1 block text-xs text-muted-foreground">Room config</label>
									<select name="roomConfig" bind:value={selConfig} class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
										{#each roomConfigs_ as c}<option value={c}>{c}</option>{/each}
									</select>
								</div>
							{:else}
								<input type="hidden" name="roomConfig" value={selConfig} />
							{/if}
						</section>

						<!-- Source -->
						<section class="rounded-lg border border-border bg-card p-3">
							<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</h3>
							<div class="flex flex-wrap gap-1.5">
								{#each BOOKING_TYPES as bt}
									<button type="button" onclick={() => pickType(bt.id)}
										class={['rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors', bookingType===bt.id ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border hover:border-foreground/40'].join(' ')}>
										{bt.label}
									</button>
								{/each}
							</div>
							{#if isOta}
								<div class="mt-2">
									<Input name="otaConfirmationNumber" placeholder="OTA confirmation #" bind:value={otaRef} class="h-8 text-sm" />
								</div>
							{/if}
						</section>

						<!-- Guest -->
						<section class="rounded-lg border border-border bg-card p-3">
							<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest</h3>
							<div class="space-y-2">
								<div class="relative">
								<Input name="guestName" placeholder="Full name" bind:value={guestName}
									oninput={onNameInput}
									onfocus={() => { if (suggestions.length) showSuggest = true; }}
									onblur={() => setTimeout(() => showSuggest = false, 150)}
									autocomplete="off"
									class="h-9" />
									{#if showSuggest}
										<div class="absolute left-0 right-0 top-full z-30 rounded-md border border-border bg-background shadow-lg">
											{#each suggestions as s}
												<button type="button" onclick={() => pickGuest(s)}
													class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
													<span class="font-medium">{s.name}</span>
													{#if s.phone}<span class="text-muted-foreground text-xs">{s.phone}</span>{/if}
												</button>
											{/each}
										</div>
									{/if}
								</div>
								{#if guestRating && RATING[guestRating]}
									<span class={['inline-block rounded-full px-2 py-0.5 text-xs font-medium', RATING[guestRating].cls].join(' ')}>{RATING[guestRating].label}</span>
								{/if}
								<Input name="guestPhone" type="tel" placeholder="Phone" bind:value={guestPhone}
									oninput={onPhoneInput}
									onfocus={() => { if (suggestions.length) showSuggest = true; }}
									onblur={() => setTimeout(() => showSuggest = false, 150)}
									autocomplete="off"
									class="h-9" />
								<Input name="guestEmail" type="email" placeholder="Email (optional)" bind:value={guestEmail} autocomplete="off" class="h-9" />
								<div class="flex gap-3">
									<div class="flex-1"><label class="mb-1 block text-xs text-muted-foreground">Adults</label>
										<input name="numAdults" type="number" min="1" max="20" bind:value={numAdults} class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
									<div class="flex-1"><label class="mb-1 block text-xs text-muted-foreground">Children</label>
										<input name="numChildren" type="number" min="0" max="20" bind:value={numChildren} class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
								</div>
								<button type="button" onclick={() => showAddress = !showAddress}
									class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
									<span>{showAddress ? '▼' : '▶'}</span>
									<span>{showAddress ? 'Hide address / vehicle' : 'Address, vehicle & waiver'}</span>
								</button>
								{#if showAddress}
									<div class="space-y-2 pt-1">
										<Input name="guestStreet" placeholder="Street" bind:value={guestStreet} class="h-8 text-sm" />
										<div class="grid grid-cols-2 gap-2">
											<Input name="guestCity" placeholder="City" bind:value={guestCity} class="h-8 text-sm" />
											<Input name="guestProvince" placeholder="Province/State" bind:value={guestProv} class="h-8 text-sm" />
										</div>
										<Input name="guestCountry" placeholder="Country" bind:value={guestCountry} class="h-8 text-sm" />
										<div class="grid grid-cols-3 gap-2">
											<Input name="vehicleMake" placeholder="Make" bind:value={vehMake} class="h-8 text-sm" />
											<Input name="vehicleColour" placeholder="Colour" bind:value={vehColour} class="h-8 text-sm" />
											<Input name="vehiclePlate" placeholder="Plate" bind:value={vehPlate} class="h-8 text-sm" />
										</div>
										<label class="flex cursor-pointer select-none items-center gap-2 text-sm">
											<input type="checkbox" name="waiverSigned" bind:checked={waiverSigned} class="h-4 w-4 rounded" />
											<span>Waiver signed</span>
											{#if waiverSigned}<span class="text-green-600 text-xs">✓</span>{/if}
										</label>
									</div>
								{/if}
							</div>
						</section>
					</div>

				<!-- ╔═══════════════════════════════════════╗
				     ║  RIGHT: Folio ledger                  ║
				     ╚═══════════════════════════════════════╝ -->
				<div class="space-y-5">

					<!-- Folio -->
					<section class="rounded-lg border border-border bg-card p-3">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folio</h3>
							<button type="button" onclick={suggestRate} disabled={rateLoading}
								class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
								{rateLoading ? '…' : '↻ Suggest rate'}
							</button>
						</div>

						<!-- Rate charge lines -->
						<div class="space-y-1.5">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Room charges</p>
							{#each rateLines as line, i}
								<div class="flex items-center gap-1">
									<input name="rate-label-{i}" placeholder="e.g. 3 nights @ $129" bind:value={line.label}
										class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
									<input name="rate-qty-{i}" type="number" step="1" min="1" placeholder="Qty" bind:value={line.qty}
										oninput={() => calcRateTotal(line)} class="w-12 rounded border border-input bg-background px-1 py-1 text-center text-xs" />
									<input name="rate-unit-{i}" type="number" step="0.01" placeholder="$/n" bind:value={line.unit}
										oninput={() => calcRateTotal(line)} class="w-16 rounded border border-input bg-background px-2 py-1 text-xs" />
									<div class="relative w-20">
										<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
										<input name="rate-total-{i}" type="number" step="0.01" bind:value={line.total}
											class="w-full rounded border border-input bg-background pl-5 pr-1 py-1 text-xs" />
									</div>
									<button type="button" onclick={() => rateLines = rateLines.filter(l => l.id !== line.id)}
										class="shrink-0 px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
								</div>
							{/each}
							<button type="button" onclick={() => rateLines = [...rateLines, { id: crypto.randomUUID(), label: '', qty: String(nights||1), unit: '', total: '' }]}
								class="text-xs text-muted-foreground hover:text-foreground">+ charge line</button>
						</div>

						<!-- Tax lines -->
						<div class="mt-3 space-y-1.5">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Taxes</p>
							{#each taxLines as line, i}
								<div class="flex items-center gap-1">
									{#if taxPresets.length}
										<select onchange={(e) => applyPreset(line, (e.target as HTMLSelectElement).value)}
											class="rounded border border-input bg-background px-1 py-1 text-xs">
											<option value="">Custom</option>
											{#each taxPresets as p}<option value={p.id} selected={line.presetId===p.id}>{p.label}</option>{/each}
										</select>
									{/if}
									<input name="tax-label-{i}" placeholder="Tax label" bind:value={line.label}
										class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
									<div class="relative w-20">
										<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
										<input name="tax-total-{i}" type="number" step="0.01" bind:value={line.total}
											class="w-full rounded border border-input bg-background pl-5 pr-1 py-1 text-xs" />
									</div>
									<button type="button" onclick={() => taxLines = taxLines.filter(l => l.id !== line.id)}
										class="shrink-0 px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
								</div>
							{/each}
							<button type="button" onclick={() => {
								const newLine = { id: crypto.randomUUID(), presetId: '', label: '', total: '' };
								if (taxPresets.length === 1) applyPreset(newLine, taxPresets[0].id);
								taxLines = [...taxLines, newLine];
							}} class="text-xs text-muted-foreground hover:text-foreground">+ tax line</button>
						</div>

						<!-- Divider + totals -->
						<div class="mt-3 border-t border-border pt-2 space-y-1 text-sm">
							<div class="flex justify-between text-muted-foreground"><span>Subtotal</span><span>${rateTotal.toFixed(2)}</span></div>
							{#if taxTotal > 0}<div class="flex justify-between text-muted-foreground"><span>Tax</span><span>${taxTotal.toFixed(2)}</span></div>{/if}
							<div class="flex justify-between font-semibold text-base"><span>Total charges</span><span>${grandTotal.toFixed(2)}</span></div>
						</div>

						<!-- Payments -->
						<div class="mt-4 border-t border-border pt-3">
							<div class="mb-1.5 flex items-center justify-between">
								<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Payments received</p>
								{#if bookingId && status !== 'checked_out' && status !== 'cancelled'}
									<button type="button" onclick={() => addingPay = !addingPay}
										class="text-xs text-muted-foreground hover:text-foreground">+ Add payment</button>
								{/if}
							</div>

							{#if isNew}
								<!-- New booking: initial deposit row -->
								<div class="grid grid-cols-2 gap-2">
									<div>
										<label class="mb-1 block text-xs text-muted-foreground">
											Deposit (optional)
											{#if depositAmt && parseFloat(depositAmt) > 0}
												<span class="ml-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-800 font-medium">suggested: ${parseFloat(depositAmt).toFixed(2)}</span>
											{/if}
										</label>
										<div class="relative">
											<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
											<input name="depositAmount" type="number" step="0.01" min="0" placeholder="0.00"
												bind:value={depositAmt}
												class="w-full rounded-md border border-input bg-background pl-6 pr-3 py-1.5 text-sm" />
										</div>
									</div>
									<div>
										<label class="mb-1 block text-xs text-muted-foreground">Method</label>
										<select name="depositMethod" class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
											<option value="cash">Cash</option><option value="card">Card</option>
											<option value="etransfer">e-Transfer</option><option value="check">Cheque</option><option value="other">Other</option>
										</select>
									</div>
								</div>
							{:else}
								<!-- Existing booking: payment history as ledger rows -->
								{#if payments.length}
									<div class="mb-2 space-y-0.5">
										{#each payments as p}
											<div class="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted/40">
												<span class="text-muted-foreground">{fmtPayType(p.type)} · {p.paymentMethod}</span>
												<span class={p.type === 'refund' ? 'text-destructive font-medium' : 'text-green-700 font-medium'}>
													{p.type === 'refund' ? '+' : '−'}{fmtMoney(p.amount)}
												</span>
											</div>
										{/each}
									</div>
								{:else}
									<p class="mb-2 text-xs text-muted-foreground italic">No payments recorded yet.</p>
								{/if}

								<!-- Inline add-payment form -->
								{#if addingPay}
									<div class="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-3">
										<div class="grid grid-cols-2 gap-2">
											<div>
												<label class="mb-1 block text-xs text-muted-foreground">Amount</label>
												<div class="relative">
													<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
													<input type="number" step="0.01" min="0.01" bind:value={payAmt}
														placeholder={balanceCents > 0 ? (balanceCents/100).toFixed(2) : ''}
														class="w-full rounded border border-input bg-background pl-5 pr-2 py-1.5 text-sm" />
												</div>
											</div>
											<div>
												<label class="mb-1 block text-xs text-muted-foreground">Type</label>
												<select bind:value={payType} class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm">
													<option value="final_charge">Charge</option>
													<option value="deposit">Deposit</option>
													<option value="refund">Refund</option>
												</select>
											</div>
										</div>
										<select bind:value={payMethod} class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm">
											<option value="cash">Cash</option><option value="card">Card</option>
											<option value="etransfer">e-Transfer</option><option value="check">Cheque</option><option value="other">Other</option>
										</select>
										{#if payErr}<p class="text-xs text-destructive">{payErr}</p>{/if}
										<div class="flex gap-2">
											<button type="button" onclick={recordPayment} disabled={payBusy}
												class="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
												{payBusy ? 'Saving…' : 'Record payment'}
											</button>
											<button type="button" onclick={() => { addingPay = false; payErr = ''; }}
												class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
										</div>
									</div>
								{/if}

								{#if ccInfo}
									<p class="mt-1.5 text-xs text-muted-foreground">CC on file: {ccInfo.cardType ?? ''} ••••{ccInfo.lastFour ?? ''}</p>
								{/if}
							{/if}
						</div>

						<!-- Balance row (always visible for existing bookings) -->
						{#if !isNew}
							<div class={['mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm font-semibold', balanceCents > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'].join(' ')}>
								<div>
									<span>{balanceCents > 0 ? 'Balance due' : 'Paid in full'}</span>
									{#if balanceCents > 0}
										<span class="ml-2 text-xs font-normal opacity-70">(${(collected/100).toFixed(2)} of ${grandTotal.toFixed(2)} received)</span>
									{/if}
								</div>
								<span class="text-base">{balanceCents > 0 ? fmtMoney(balanceCents) : '✓'}</span>
							</div>
						{/if}
					</section>

					<!-- Notes -->
					<section class="rounded-lg border border-border bg-card p-3">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
						<textarea name="notes" bind:value={notes} rows="3" placeholder="Special requests, info…"
							class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"></textarea>
						{#if status === 'checked_out' && checkoutNotes}
							<div class="mt-1 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground"><strong>Checkout:</strong> {checkoutNotes}</div>
						{/if}
					</section>

				</div><!-- /right -->
				</div><!-- /grid -->

				<!-- Checkout bar -->
				{#if showCheckoutBar && status === 'checked_in'}
					<div class="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
						<label class="block text-xs font-medium">Checkout notes (optional)</label>
						<textarea name="checkoutNotes" bind:value={checkoutNotes} rows="2"
							class="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm"></textarea>
					</div>
				{/if}
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<div class="flex w-full flex-wrap items-center justify-between gap-2">
			<div class="flex gap-1.5">
				{#if bookingId}
					<a href="/booking/{bookingId}/print" target="_blank" rel="noopener"
						class="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">Print slip</a>
					{#if status === 'checked_in'}
						<a href="/booking/{bookingId}/move"
							class="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">Move room</a>
					{/if}
					{#if status !== 'cancelled' && status !== 'checked_out'}
						<button type="button" onclick={openCancelDialog} disabled={cancelBusy}
							class="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">
							Cancel booking…
						</button>
					{/if}
				{/if}
			</div>
			<div class="flex items-center gap-2">
				{#if status === 'confirmed'}
					<Button type="button" onclick={() => submitWith('checkIn')} disabled={saving}>Check In →</Button>
				{:else if status === 'checked_in'}
					{#if !showCheckoutBar}
						<Button type="button" variant="outline" onclick={() => showCheckoutBar = true}>Check Out…</Button>
					{:else}
						<Button type="button" onclick={() => submitWith('checkOut')} disabled={saving}>Confirm Check Out →</Button>
					{/if}
				{/if}
				<Button form="bc-form" type="submit"
					variant={status==='confirmed'||status==='checked_in' ? 'outline' : 'default'}
					disabled={saving}
					onclick={() => { intent = 'save'; }}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			</div>
		</div>
	{/snippet}

</CustomDialog>

<!-- Cancel confirmation dialog -->
<CustomDialog
	bind:open={cancelOpen}
	title="Cancel booking?"
	description="This cannot be undone. The booking will be marked cancelled."
	dialogClass="sm:max-w-md"
	interactOutsideBehavior="ignore"
>
	{#snippet content()}
		{#if cancelPreview}
			<div class="space-y-3 text-sm">
				<div class="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
					<div class="flex justify-between"><span class="text-muted-foreground">Days until check-in</span><span class="font-medium">{cancelPreview.daysToCheckin < 0 ? 'Already past' : cancelPreview.daysToCheckin + ' days'}</span></div>
					<div class="flex justify-between"><span class="text-muted-foreground">Deposit / payments received</span><span class="font-medium">{fmtMoney(cancelPreview.depositPaidCents)}</span></div>
					<div class="flex justify-between"><span class="text-muted-foreground">Cancellation fee</span><span class="font-medium text-red-700">{fmtMoney(cancelPreview.cancellationFeeCents)}</span></div>
					{#if cancelPreview.noRefund}
						<div class="flex justify-between font-semibold text-red-700"><span>No refund</span><span>Within no-refund window</span></div>
					{:else if cancelPreview.refundCents > 0}
						<div class="flex justify-between font-semibold text-green-700"><span>Refund</span><span>{fmtMoney(cancelPreview.refundCents)}</span></div>
					{:else}
						<div class="text-muted-foreground italic text-xs">No refund (no deposit recorded)</div>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">The cancellation fee will be added as a charge line and any refund recorded as a payment in the folio. Actual policy is applied server-side.</p>
			</div>
		{/if}
	{/snippet}
	{#snippet footer()}
		<div class="flex justify-end gap-2 w-full">
			<button type="button" onclick={() => cancelOpen = false}
				class="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">Keep booking</button>
			<button type="button" onclick={confirmCancel} disabled={cancelBusy}
				class="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
				{cancelBusy ? 'Cancelling…' : 'Yes, cancel booking'}
			</button>
		</div>
	{/snippet}
</CustomDialog>

<!-- Group Card (opened via "View Group →" banner) -->
{#if groupInfo}
	<GroupCard
		bind:open={groupCardOpen}
		groupId={groupInfo.id}
		{channels}
		{users}
		{currentUserId}
		{today}
	/>
{/if}
