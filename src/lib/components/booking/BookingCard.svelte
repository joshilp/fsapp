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
	import { toast } from 'svelte-sonner';

	type Channel = { id: string; name: string };
	type User    = { id: string; name: string };
	type NewBooking = {
		propertyId: string;
		propertyName: string;
		roomId?: string;                  // optional — empty for inventory-sourced bookings
		roomNumber?: string;              // optional — empty for inventory-sourced bookings
		roomConfigs?: string[];
		requestedRoomTypeId?: string;     // set when booking from inventory grid
		requestedRoomTypeName?: string;   // display name for the requested room type
		checkIn: string;
		checkOut: string;
	};
	type RateLine = { id: string; label: string; qty: string; unit: string; total: string };
	type TaxLine  = { id: string; presetId: string; label: string; percent: string; total: string; appliesToRoom: boolean; appliesToAddon: boolean };
	type Payment  = { id: string; type: string; amount: number; paymentMethod: string; notes: string | null; chargedAt: number | null };
	type TaxPreset = { id: string; label: string; ratePercent: number };
	type AddonPreset = { id: string; name: string; defaultUnitCents: number | null; isTaxable: boolean };
	type AddonLine  = { id: string; presetId: string; label: string; qty: string; unit: string; total: string; isTaxable: boolean };
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
		propertyId?: string;
	};

	let { open = $bindable(false), newBooking, groupRooms, bookingId, channels, users, currentUserId, today, propertyName, propertyId: propertyIdProp }: Props = $props();

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

	// ── Inventory-sourced booking state ───────────────────────────────────────
	// Set when the card is opened from the Inventory grid (drag on Available row).
	// Allows optional room assignment; if left blank the booking is saved as unassigned.
	let requestedRoomTypeId_ = $state('');
	let availRooms = $state<{ id: string; roomNumber: string; roomTypeName: string }[]>([]);
	let availRoomsLoading = $state(false);
	let roomPickerDismissed = $state(false);   // lets operator proceed to folio as unassigned

	async function loadAvailableRooms() {
		if (!requestedRoomTypeId_ || !checkIn || !checkOut || checkIn >= checkOut) return;
		availRoomsLoading = true;
		try {
			const r = await fetch(
				`/api/rooms/available?roomTypeId=${encodeURIComponent(requestedRoomTypeId_)}&checkIn=${checkIn}&checkOut=${checkOut}`
			);
			if (r.ok) availRooms = await r.json();
		} catch { /* ignore */ }
		finally { availRoomsLoading = false; }
	}

	function pickAvailRoom(id: string) {
		const r = availRooms.find((x) => x.id === id);
		if (!r) { roomId_ = ''; return; }
		roomId_ = r.id;
		roomNumber_ = r.roomNumber;
		suggestRate(true);
	}
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
	let rateLines  = $state<RateLine[]>([{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }]);
	let addonLines = $state<AddonLine[]>([]);
	let taxLines   = $state<TaxLine[]>([]);
	let taxPresets  = $state<TaxPreset[]>([]);
	let addonPresets    = $state<AddonPreset[]>([]);
	let addonPickerOpen = $state(false);
	let rateLoading = $state(false);
	let minNightWarning = $state<string | null>(null);

	// ── Payments ──────────────────────────────────────────────────────────────
	let payments     = $state<Payment[]>([]);
	let ccInfo       = $state<{ lastFour: string | null; cardType: string | null } | null>(null);
	let ccCapturing  = $state(false);
	let ccCardType   = $state('Visa');
	let ccLastFour   = $state('');
	let ccExpiry     = $state('');  // MM/YY
	let ccName       = $state('');
	let ccBusy       = $state(false);

	// ── Elavon Converge ───────────────────────────────────────────────────────
	let elavonPanelOpen   = $state(false);
	let elavonToken       = $state('');       // Checkout.js session token
	let elavonTokenBusy   = $state(false);
	let elavonCharging    = $state(false);
	let elavonChargeAmt   = $state('');       // dollars string
	let elavonChargeType  = $state<'deposit'|'final_charge'>('final_charge');
	let elavonChargeError = $state('');
	let addingPay    = $state(false);
	let payAmt       = $state<number | ''>('');
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
	let legendOpen = $state(false);

	// ── Left-panel tab ─────────────────────────────────────────────────────────
	let leftTab = $state<'guest' | 'stay' | 'notes' | 'history'>('guest');

	// ── Payment row ⋮ menu ─────────────────────────────────────────────────────
	let openPayMenu = $state<string | null>(null);

	// ── History timeline (populated from fetchCard) ────────────────────────────
	let bookingCreatedAt   = $state<number | null>(null);
	let bookingClerkName   = $state('');
	let bookingCheckedInAt  = $state<number | null>(null);
	let bookingCheckedOutAt = $state<number | null>(null);
	let bookingCancelledAt  = $state<number | null>(null);
	let priorStay_ = $state<{ roomNumber: string | null; checkInDate: string; checkOutDate: string } | null>(null);

	// ── Deposit confirm prompt ─────────────────────────────────────────────────
	let depositPromptPayId  = $state<string | null>(null);
	let depositPromptBusy   = $state(false);

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

	// ── Send Confirmation ──────────────────────────────────────────────────────
	let confirmBusy  = $state(false);
	let confirmSentAt = $state<string | null>(null); // ISO string or null

	// ── Self Check-in Link ────────────────────────────────────────────────────
	let selfCheckinUrl       = $state('');
	let selfCheckinAt_       = $state<number | null>(null);
	let selfCheckinLinkBusy  = $state(false);
	let selfCheckinCopied    = $state(false);
	// Property details for the email preview
	let propLogoUrl  = $state<string | null>(null);
	let propAddress  = $state<string | null>(null);
	let propPhone    = $state<string | null>(null);
	let propCheckInTime  = $state('2:00 PM');
	let propCheckOutTime = $state('10:30 AM');
	let propElavonEnabled = $state(false); // true when property has Elavon credentials on file

	function buildEmailSubject() {
		return `Booking Confirmation — ${propName || 'Your Reservation'}`;
	}

	function buildEmailBody() {
		const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
		const n = nights;
		const totalDollars = grandTotal > 0 ? `$${grandTotal.toFixed(2)}` : 'TBD';
		const paid = (collected - refunded) / 100;
		const balance = Math.max(0, grandTotal - (collected - refunded) / 100);
		const lines: string[] = [];
		lines.push(`Hi ${guestName || 'Guest'},`);
		lines.push('');
		lines.push(`Your booking at ${propName} is confirmed. Here are the details:`);
		lines.push('');
		lines.push(`  Check-in:   ${checkIn ? fmtDate(checkIn) : '—'}  (after ${propCheckInTime || '2:00 PM'})`);
		lines.push(`  Check-out:  ${checkOut ? fmtDate(checkOut) : '—'}  (by ${propCheckOutTime || '10:30 AM'})`);
		lines.push(`  Duration:   ${n} night${n === 1 ? '' : 's'}`);
		if (roomNumber_) lines.push(`  Room:       ${roomNumber_}${roomTypeName ? ' – ' + roomTypeName : ''}`);
		lines.push('');
		if (grandTotal > 0) {
			lines.push(`  Total:      ${totalDollars}`);
			if (paid > 0) lines.push(`  Deposit:    $${paid.toFixed(2)} received`);
			if (balance > 0) lines.push(`  Balance due: $${balance.toFixed(2)} on arrival`);
		}
		if (propAddress) { lines.push(''); lines.push(`Address: ${propAddress}`); }
		if (propPhone)   lines.push(`Phone:   ${propPhone}`);
		lines.push('');
		lines.push('Please present this confirmation upon arrival. We look forward to your stay!');
		lines.push('');
		lines.push(`— ${propName}`);
		return lines.join('\n');
	}

	function buildMailtoHref() {
		const subject = encodeURIComponent(buildEmailSubject());
		const body = encodeURIComponent(buildEmailBody());
		const to = encodeURIComponent(guestEmail ?? '');
		return `mailto:${to}?subject=${subject}&body=${body}`;
	}

	async function markConfirmationSent() {
		if (!bookingId) return;
		confirmBusy = true;
		try {
			const r = await fetch(`/api/booking/${bookingId}/send-confirmation`, { method: 'POST' });
			if (r.ok) {
				const d = await r.json();
				confirmSentAt = d.confirmationSentAt;
			} else {
				toast.error('Failed to send confirmation email.');
			}
		} catch { toast.error('Failed to send confirmation email.'); } finally { confirmBusy = false; }
	}

	async function getSelfCheckinLink() {
		if (!bookingId || selfCheckinLinkBusy) return;
		selfCheckinLinkBusy = true;
		try {
			const r = await fetch(`/api/booking/${bookingId}/self-checkin-link`);
			const d = await r.json();
			if (r.ok) selfCheckinUrl = d.url;
			else toast.error(d.error ?? 'Failed to get link');
		} catch { toast.error('Network error'); }
		finally { selfCheckinLinkBusy = false; }
	}

	async function copySelfCheckinLink() {
		if (!selfCheckinUrl) await getSelfCheckinLink();
		if (!selfCheckinUrl) return;
		try {
			await navigator.clipboard.writeText(selfCheckinUrl);
			selfCheckinCopied = true;
			setTimeout(() => { selfCheckinCopied = false; }, 2500);
		} catch { toast.error('Could not copy to clipboard'); }
	}

	async function copyConfirmationText() {
		try {
			await navigator.clipboard.writeText(buildEmailBody());
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Could not copy — try selecting the text manually');
		}
	}

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

	async function confirmBooking(undo = false) {
		if (!bookingId || toggleBusy) return;
		toggleBusy = true; toggleMsg = '';
		try {
			const r = await fetch(`/api/booking/${bookingId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undo }) });
			const d = await r.json();
			if (!r.ok) { toggleMsg = d.error ?? 'Error'; return; }
			status = d.status;
		} catch { toggleMsg = 'Network error.'; }
		finally { toggleBusy = false; await invalidateAll(); }
	}

	async function saveCC() {
		if (!bookingId || ccBusy) return;
		const [expM, expY] = ccExpiry.split('/').map(s => s.trim());
		const lastFour = ccLastFour.replace(/\D/g, '').slice(-4);
		if (lastFour.length !== 4) { toast.error('Enter 4-digit last four.'); return; }
		ccBusy = true;
		try {
			const r = await fetch(`/api/booking/${bookingId}/save-cc`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cardType: ccCardType, lastFour, expiryMonth: expM, expiryYear: expY ? (expY.length === 2 ? '20'+expY : expY) : '', cardholderName: ccName })
			});
			const d = await r.json();
			if (!r.ok) { toast.error(d.error ?? 'Save failed'); return; }
			ccInfo = { lastFour: d.lastFour, cardType: d.cardType };
			ccCapturing = false; ccLastFour = ''; ccExpiry = ''; ccName = '';
			toast.success('Card on file saved.');
		} catch { toast.error('Network error.'); }
		finally { ccBusy = false; }
	}

	async function deleteCC() {
		if (!bookingId || ccBusy) return;
		ccBusy = true;
		try {
			await fetch(`/api/booking/${bookingId}/save-cc`, { method: 'DELETE' });
			ccInfo = null;
			toast.success('Card removed.');
		} catch { toast.error('Network error.'); }
		finally { ccBusy = false; }
	}

	// ── Elavon helpers ────────────────────────────────────────────────────────

	async function openElavonPanel() {
		if (!bookingId) return;
		elavonPanelOpen = true;
		elavonToken = '';
		elavonChargeError = '';
		elavonTokenBusy = true;
		try {
			const r = await fetch(`/api/booking/${bookingId}/checkout-token`);
			const d = await r.json();
			if (!r.ok) { elavonChargeError = d.error ?? 'Failed to get session token'; return; }
			elavonToken = d.token;
			// Initialise Checkout.js hosted fields once token is ready
			initCheckoutJs(elavonToken);
		} catch { elavonChargeError = 'Network error getting token'; }
		finally { elavonTokenBusy = false; }
	}

	function initCheckoutJs(token: string) {
		// ConvergeEmbeddedPayment is injected by the Checkout.js script tag.
		// We only call this in-browser; SSR guard via the typeof check.
		if (typeof window === 'undefined') return;
		const w = window as unknown as Record<string, unknown>;
		if (typeof w['ConvergeEmbeddedPayment'] !== 'undefined') {
			(w['ConvergeEmbeddedPayment'] as { init: (t: string, cb: object) => void })
				.init(token, {
					onTokenGenerated: (t: string) => { elavonDoCharge(t); },
					onError: (msg: string) => { elavonChargeError = msg; },
				});
		}
	}

	async function elavonDoCharge(paymentToken: string) {
		if (!bookingId || elavonCharging) return;
		if (!elavonChargeAmt || parseFloat(elavonChargeAmt) <= 0) {
			elavonChargeError = 'Enter a valid amount.'; return;
		}
		elavonCharging = true; elavonChargeError = '';
		try {
			const r = await fetch(`/api/booking/${bookingId}/charge`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: paymentToken, amountDollars: parseFloat(elavonChargeAmt).toFixed(2), type: elavonChargeType }),
			});
			const d = await r.json();
			if (!r.ok) { elavonChargeError = d.error ?? 'Charge failed'; return; }
			toast.success(`Charged $${elavonChargeAmt} — approval ${d.approvalCode}`);
			elavonPanelOpen = false; elavonChargeAmt = '';
			if (bookingId) await fetchCard(bookingId);
		} catch { elavonChargeError = 'Network error.'; }
		finally { elavonCharging = false; }
	}

	async function elavonRefundPayment(txnId: string, amountDollars: string) {
		if (!bookingId) return;
		try {
			const r = await fetch(`/api/booking/${bookingId}/refund`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ txnId, amountDollars }),
			});
			const d = await r.json();
			if (!r.ok) { toast.error(d.error ?? 'Refund failed'); return; }
			toast.success('Refund processed');
			if (bookingId) await fetchCard(bookingId);
		} catch { toast.error('Network error.'); }
	}

	async function elavonVoidPayment(txnId: string) {
		if (!bookingId) return;
		try {
			const r = await fetch(`/api/booking/${bookingId}/void`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ txnId }),
			});
			const d = await r.json();
			if (!r.ok) { toast.error(d.error ?? 'Void failed'); return; }
			toast.success('Transaction voided');
			if (bookingId) await fetchCard(bookingId);
		} catch { toast.error('Network error.'); }
	}

	async function toggleCheckin() {
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
	type GuestSuggestion = { id: string; name: string; phone: string | null; email: string | null; street: string | null; city: string | null; provinceState: string | null };
	let suggestions   = $state<GuestSuggestion[]>([]);
	let showSuggest   = $state(false);
	let nameTimer: ReturnType<typeof setTimeout>;

	// ── Derived ───────────────────────────────────────────────────────────────
	const nights = $derived.by(() => {
		if (!checkIn || !checkOut) return 0;
		return Math.max(0, Math.round((new Date(checkOut+'T12:00:00').getTime() - new Date(checkIn+'T12:00:00').getTime()) / 86400000));
	});
	const rateTotal          = $derived(rateLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const addonTotal            = $derived(addonLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const taxableAddonTotal     = $derived(addonLines.filter(l => l.isTaxable).reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const nonTaxableAddonTotal  = $derived(addonLines.filter(l => !l.isTaxable).reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const chargeableSubtotal = $derived(rateTotal + taxableAddonTotal); // base used for % tax calc
	const taxTotal           = $derived(taxLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0));
	const grandTotal         = $derived(rateTotal + addonTotal + taxTotal);
	const collected  = $derived(payments.filter(p => p.type !== 'refund' && (p as { status?: string }).status !== 'pending').reduce((s, p) => s + p.amount, 0));
	const pending    = $derived(payments.filter(p => p.type === 'deposit' && (p as { status?: string }).status === 'pending').reduce((s, p) => s + p.amount, 0));
	const refunded   = $derived(payments.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0));
	const balanceCents = $derived(Math.round(grandTotal * 100) - collected + refunded);
	const isOta      = $derived(['bookingcom','expedia','airbnb','other'].includes(bookingType));
	const isNew      = $derived(!bookingId);

	// Auto-suggest deposit is handled inside suggestRate() once rate lines are fetched.
	const cardTitle = $derived(roomNumber_ ? `Room ${roomNumber_}${propName ? ' · '+propName : ''}` : 'New Booking');
	// Only show date summary in header for existing bookings — new bookings have dates right in the Stay section
	const cardDesc  = $derived(!isNew && checkIn && checkOut ? `${fmt(checkIn)} → ${fmt(checkOut)} · ${nights} night${nights===1?'':'s'}` : '');

	const statusLabel = $derived(({ reserved:'Pending', confirmed:'Confirmed', checked_in:'Checked In', checked_out:'Checked Out', cancelled:'Cancelled', blocked:'Blocked' } as Record<string,string>)[status] ?? status);
	const statusCls   = $derived(({ reserved:'bg-amber-100 text-amber-700 border-amber-200', confirmed:'bg-blue-100 text-blue-700 border-blue-200', checked_in:'bg-green-100 text-green-700 border-green-200', checked_out:'bg-gray-100 text-gray-600 border-gray-200', cancelled:'bg-red-100 text-red-600 border-red-200' } as Record<string,string>)[status] ?? 'bg-muted text-muted-foreground border-border');

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
		taxLines = []; taxPresets = []; addonLines = []; addonPresets = []; payments = []; ccInfo = null;
		ccCapturing = false; ccCardType = 'Visa'; ccLastFour = ''; ccExpiry = ''; ccName = ''; ccBusy = false;
		requestedRoomTypeId_ = ''; availRooms = []; roomPickerDismissed = false;
		addingPay = false; payAmt = ''; payMethod = 'cash'; payType = 'final_charge'; payNotes = ''; payErr = '';
		depositPromptPayId = null; depositPromptBusy = false;
		suggestions = []; showSuggest = false;
		depositAmt = ''; cancelPreview = null; cancelOpen = false; cancelBusy = false;
		minNightWarning = null;
		confirmBusy = false; confirmSentAt = null;
		selfCheckinUrl = ''; selfCheckinAt_ = null; selfCheckinLinkBusy = false; selfCheckinCopied = false;
		propLogoUrl = null; propAddress = null; propPhone = null;
		leftTab = 'guest'; openPayMenu = null;
		legendOpen = false;
		bookingCreatedAt = null; bookingClerkName = ''; bookingCheckedInAt = null;
		bookingCheckedOutAt = null; bookingCancelledAt = null; priorStay_ = null;
	}

	function initNew(nb: NewBooking) {
		propId = nb.propertyId; propName = nb.propertyName;
		// Read only from nb (not reactive state) to avoid tracked dependencies inside the $effect
		roomId_ = nb.roomId ?? '';
		roomNumber_ = nb.roomNumber || nb.requestedRoomTypeName || '';
		roomConfigs_ = nb.roomConfigs ?? []; selConfig = nb.roomConfigs?.[0] ?? '';
		checkIn = nb.checkIn; checkOut = nb.checkOut;
		channelId = defChannel('phone');
		requestedRoomTypeId_ = nb.requestedRoomTypeId ?? '';
		// Open to Guest tab — room assignment is now in the right panel
		if (requestedRoomTypeId_) leftTab = 'guest';
		fetchTaxPresets();
		if (requestedRoomTypeId_) {
			loadAvailableRooms();
		} else {
			suggestRate(true); // auto-fill rates silently on open
		}
	}

	function initGroup(gr: { roomId: string; roomNumber: string; checkIn: string; checkOut: string; roomConfigs: string[] }[]) {
		if (!gr.length) return;
		const first = gr[0];
		propId = propertyIdProp ?? '';
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
			const r = await fetch(`/api/tax-presets${propId ? `?propertyId=${encodeURIComponent(propId)}` : ''}`);
			if (r.ok) {
				taxPresets = await r.json();
				autoApplyTaxes(chargeableSubtotal);
			}
		} catch { /* ignore */ }
		// Fetch addon presets in parallel
		fetchAddonPresets();
	}

	async function fetchAddonPresets() {
		if (!propId) return;
		try {
			const r = await fetch(`/api/addon-presets?propertyId=${encodeURIComponent(propId)}`);
			if (r.ok) addonPresets = await r.json();
		} catch { /* ignore */ }
	}

	function pickAddonPreset(line: AddonLine, presetId: string) {
		const p = addonPresets.find(x => x.id === presetId);
		line.presetId = presetId;
		if (p) {
			line.label = p.name;
			line.isTaxable = p.isTaxable;
			if (p.defaultUnitCents !== null) {
				line.unit = (p.defaultUnitCents / 100).toFixed(2);
				if (!line.qty) line.qty = '1';
				const q = parseFloat(line.qty) || 1;
				line.total = ((p.defaultUnitCents / 100) * q).toFixed(2);
			}
		}
	}

	function calcAddonTotal(l: AddonLine) {
		const q = parseFloat(l.qty) || 0, u = parseFloat(l.unit) || 0;
		if (q && u) l.total = (q * u).toFixed(2);
	}

	function addAddonFromPreset(p: AddonPreset) {
		addonLines = [...addonLines, {
			id: crypto.randomUUID(),
			presetId: p.id,
			label: p.name,
			qty: '1',
			unit: (p.defaultUnitCents / 100).toFixed(2),
			total: (p.defaultUnitCents / 100).toFixed(2),
			isTaxable: p.isTaxable
		}];
		addonPickerOpen = false;
	}

	function addCustomAddon(taxable: boolean) {
		addonLines = [...addonLines, { id: crypto.randomUUID(), presetId: '', label: '', qty: '1', unit: '', total: '', isTaxable: taxable }];
		addonPickerOpen = false;
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
		propLogoUrl = b.room?.property?.logoUrl ?? null;
		propAddress = b.room?.property?.address ?? null;
		propPhone   = b.room?.property?.phone ?? null;
		propCheckInTime  = b.room?.property?.checkinTime  ?? '2:00 PM';
		propCheckOutTime = b.room?.property?.checkoutTime ?? '10:30 AM';
		propElavonEnabled = !!(b.property?.elavonMerchantId);
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
		confirmSentAt = b.confirmationSentAt ? new Date(b.confirmationSentAt).toISOString() : null;
		selfCheckinAt_ = b.selfCheckinAt ?? null;
			bookingCreatedAt   = b.createdAt ?? null;
			bookingClerkName   = b.clerk?.name ?? '';
			bookingCheckedInAt  = b.checkedInAt ?? null;
			bookingCheckedOutAt = b.checkedOutAt ?? null;
			bookingCancelledAt  = b.cancelledAt ?? null;
			priorStay_ = d.priorStay ?? null;
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
			const rates  = (b.lineItems ?? []).filter((l: {type:string}) => l.type === 'rate');
			const extras = (b.lineItems ?? []).filter((l: {type:string}) => l.type === 'extra');
			const taxes  = (b.lineItems ?? []).filter((l: {type:string}) => l.type === 'tax');
			rateLines = rates.length ? rates.map((l: {id:string;label:string;quantity:number|null;unitAmount:number|null;totalAmount:number}) => ({
				id: l.id, label: l.label,
				qty: String(l.quantity ?? ''),
				unit: l.unitAmount ? (l.unitAmount/100).toFixed(2) : '',
				total: (l.totalAmount/100).toFixed(2)
			})) : [{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }];
			addonLines = extras.map((l: {id:string;label:string;quantity:number|null;unitAmount:number|null;totalAmount:number}) => ({
				id: l.id, presetId: '', label: l.label,
				qty: String(l.quantity ?? '1'),
				unit: l.unitAmount ? (l.unitAmount/100).toFixed(2) : '',
				total: (l.totalAmount/100).toFixed(2),
				isTaxable: true  // legacy extras treated as taxable; future saves will persist the flag
			}));
			taxLines = taxes.map((l: {id:string;label:string;totalAmount:number}) => ({ id: l.id, presetId: '', label: l.label, percent: '', total: (l.totalAmount/100).toFixed(2), appliesToRoom: true, appliesToAddon: true }));
			fetchAddonPresets();
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
		line.percent = String(p.ratePercent);
		line.appliesToRoom  = p.appliesToRoom  ?? true;
		line.appliesToAddon = p.appliesToAddon ?? true;
		const base = (line.appliesToRoom ? rateTotal : 0) + (line.appliesToAddon ? taxableAddonTotal : 0);
		line.total = (base * p.ratePercent / 100).toFixed(2);
	}

	/** Recalculate dollar amounts for any tax lines that have a percent set. */
	function recalcPercentTaxes(sub: number) {
		taxLines = taxLines.map(l => {
			const pct = parseFloat(l.percent);
			if (!pct) return l;
			const base = (l.appliesToRoom ? rateTotal : 0) + (l.appliesToAddon ? taxableAddonTotal : 0);
			if (!base) return l;
			return { ...l, total: (base * pct / 100).toFixed(2) };
		});
	}

	/** Auto-create tax lines from all configured presets (only when none exist yet). */
	function autoApplyTaxes(sub: number) {
		if (!taxPresets.length || taxLines.length > 0 || sub <= 0) return;
		taxLines = taxPresets.map(p => {
			const appliesToRoom  = p.appliesToRoom  ?? true;
			const appliesToAddon = p.appliesToAddon ?? true;
			const base = (appliesToRoom ? rateTotal : 0) + (appliesToAddon ? taxableAddonTotal : 0);
			return {
				id: crypto.randomUUID(),
				presetId: p.id,
				label: p.label,
				percent: String(p.ratePercent),
				total: base > 0 ? (base * p.ratePercent / 100).toFixed(2) : '',
				appliesToRoom,
				appliesToAddon
			};
		});
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
				const sub = (d.subtotalCents ?? 0) / 100;
				// Auto-apply preset taxes if none yet, otherwise recalculate percent-based ones
				if (taxLines.length === 0) autoApplyTaxes(sub);
				else recalcPercentTaxes(sub);
				// Surface min-nights warning so operator is aware
				minNightWarning = d.minNightWarning ?? null;
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

	function pickGuest(s: GuestSuggestion) {
		guestId = s.id; guestName = s.name;
		if (s.phone) guestPhone = s.phone;
		if (s.email) guestEmail = s.email;
		if (s.street) guestStreet = s.street;
		if (s.city) guestCity = s.city;
		if (s.provinceState) guestProv = s.provinceState;
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
		const amt = typeof payAmt === 'number' ? payAmt : parseFloat(String(payAmt));
		if (!amt || amt <= 0 || isNaN(amt)) { payErr = 'Enter a valid amount'; return; }
		payBusy = true;
		const fd = new FormData();
		fd.set('bookingId', bookingId);
		fd.set('amount', amt.toFixed(2));
		fd.set('method', payMethod); fd.set('type', payType);
		if (payNotes) fd.set('notes', payNotes);
	try {
		const res = await fetch('/booking?/addPayment', { method: 'POST', body: fd });
		if (!res.ok) {
			const d = await res.json().catch(() => ({}));
			payErr = (d as { data?: { error?: string } }).data?.error ?? 'Failed to record payment — please try again.';
			payBusy = false;
			return;
		}
		addingPay = false; payAmt = ''; payNotes = '';
		toast.success('Payment recorded.');
		await fetchCard(bookingId);
	} catch { payErr = 'Network error'; }
	payBusy = false;
	}

	async function markPaymentReceived(payId: string) {
		if (!bookingId) return;
		// If booking is Pending, show the confirm-booking dialog instead of auto-promoting
		if (status === 'reserved') {
			depositPromptPayId = payId;
			return;
		}
		// Already confirmed or beyond — just mark received with no status change
		const r = await fetch(`/api/payment-events/${payId}/receive`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ promote: false })
		});
		if (r.ok) await fetchCard(bookingId);
	}

	async function resolveDepositPrompt(confirm: boolean) {
		if (!bookingId || !depositPromptPayId) return;
		depositPromptBusy = true;
		try {
			const r = await fetch(`/api/payment-events/${depositPromptPayId}/receive`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ promote: confirm })
			});
			if (r.ok) {
				const d = await r.json();
				if (d.promoted) {
					status = 'confirmed';
					toast.success('Booking confirmed — confirmation email sent.');
				} else {
					toast.success('Deposit marked received.');
				}
				depositPromptPayId = null;
				await fetchCard(bookingId);
			} else {
				toast.error('Failed — please try again.');
			}
		} catch { toast.error('Network error.'); }
		finally { depositPromptBusy = false; }
	}

	async function deletePayment(payId: string) {
		if (!bookingId) return;
		if (!window.confirm('Delete this payment record? This cannot be undone.')) return;
		try {
		await fetch(`/api/payment-events/${payId}`, { method: 'DELETE' });
		await fetchCard(bookingId);
	} catch { toast.error('Failed to delete payment — please try again.'); }
	}
</script>

<!-- Elavon Checkout.js — loaded once; only used when property has credentials -->
<svelte:head>
	{#if propElavonEnabled}
	<script src="https://api.convergepay.com/hosted-payments/Checkout.js"></script>
	{/if}
</svelte:head>

<CustomDialog bind:open title={cardTitle} description={cardDesc} dialogClass="sm:max-w-4xl" interactOutsideBehavior="ignore">

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

		<!-- Status flow bar (existing bookings only) -->
		{#if bookingId && status !== 'cancelled'}
			{@const LEGEND = [
				{ key: 'reserved',    label: 'Pending',     desc: 'New booking — deposit not yet received.' },
				{ key: 'confirmed',   label: 'Confirmed',   desc: 'Deposit received or manually confirmed.' },
				{ key: 'checked_in',  label: 'Checked In',  desc: 'Guest has arrived and is on property.' },
				{ key: 'checked_out', label: 'Checked Out', desc: 'Stay complete — room returned to housekeeping.' },
			]}
			<div class="mx-4 mt-3 rounded-md border border-border bg-muted/20 px-3 py-2.5">
				<div class="flex items-center justify-between gap-3">
					<!-- Primary action -->
					<div class="flex items-center gap-2">
						{#if status === 'reserved'}
							<button type="button" onclick={() => confirmBooking()} disabled={toggleBusy}
								class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
								Confirm booking →
							</button>
						{:else if status === 'confirmed'}
							<button type="button" onclick={toggleCheckin} disabled={toggleBusy}
								class="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
								Check in →
							</button>
						{:else if status === 'checked_in'}
							<button type="button" onclick={toggleCheckout} disabled={toggleBusy}
								class="rounded-md bg-gray-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-gray-700 disabled:opacity-50">
								Check out →
							</button>
						{:else if status === 'checked_out'}
							<span class="text-xs font-medium text-muted-foreground">Stay complete</span>
						{/if}
						{#if toggleMsg}
							<span class={['text-xs', toggleMsg.startsWith('⚠') ? 'text-amber-700' : 'text-destructive'].join(' ')}>{toggleMsg}</span>
						{/if}
					</div>
					<!-- Undo link + legend toggle -->
					<div class="flex items-center gap-3">
						{#if status === 'confirmed'}
							<button type="button" onclick={() => confirmBooking(true)} disabled={toggleBusy}
								class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">↩ revert to pending</button>
						{:else if status === 'checked_in'}
							<button type="button" onclick={toggleCheckin} disabled={toggleBusy}
								class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">↩ undo check-in</button>
						{:else if status === 'checked_out'}
							<button type="button" onclick={toggleCheckout} disabled={toggleBusy}
								class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">↩ undo checkout</button>
						{/if}
						<!-- Legend popover trigger -->
						<button type="button" title="Status legend"
							onclick={() => legendOpen = !legendOpen}
							class="text-muted-foreground/60 hover:text-muted-foreground text-xs leading-none">ⓘ</button>
					</div>
				</div>
				<!-- Inline legend (collapsible) -->
				{#if legendOpen}
					<div class="mt-2 border-t border-border pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
						{#each LEGEND as l}
							<div class="flex items-start gap-1.5 text-[11px]">
								<span class={['mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 font-semibold leading-none',
									l.key === status
										? statusCls
										: 'bg-muted text-muted-foreground border-border'
								].join(' ')}>{l.label}</span>
								<span class="text-muted-foreground">{l.desc}</span>
							</div>
						{/each}
					</div>
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
				<input type="hidden" name="bookingId"            value={bookingId ?? ''} />
				<input type="hidden" name="intent"               bind:value={intent} />
				<input type="hidden" name="propertyId"           value={propId} />
				<input type="hidden" name="roomId"               value={roomId_} />
				<input type="hidden" name="checkIn"              value={checkIn} />
				<input type="hidden" name="checkOut"             value={checkOut} />
				<input type="hidden" name="requestedRoomTypeId"  value={requestedRoomTypeId_} />
				<input type="hidden" name="channelId"            value={channelId} />
				<input type="hidden" name="bookingType" value={bookingType} />
				<input type="hidden" name="guestId"     value={guestId} />
				<input type="hidden" name="clerkUserId" value={currentUserId} />
		<input type="hidden" name="rateCount"   value={rateLines.length} />
		<input type="hidden" name="addonCount"  value={addonLines.length} />
		<input type="hidden" name="taxCount"    value={taxLines.length} />

			<!-- Source — full-width chip strip above both panels -->
			<div class="flex flex-wrap gap-1.5 px-4 pt-4">
				{#each BOOKING_TYPES as bt}
					<button type="button" onclick={() => pickType(bt.id)}
						class={['rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
							bookingType === bt.id
								? 'bg-foreground text-background border-foreground'
								: 'bg-background text-muted-foreground border-border hover:border-foreground/40'
						].join(' ')}>
						{bt.label}
					</button>
				{/each}
			</div>

			<div class="grid gap-4 px-4 pb-4 pt-3 lg:grid-cols-2">

			<!-- ── LEFT: tabs(Guest | Stay | Notes) ─────────────────────────────── -->
			<div class="flex flex-col gap-3">

				<!-- Tab bar -->
				<div class="flex border-b border-border">
					{#each (['guest', 'stay', 'notes', 'history'] as const) as tab}
						<button type="button" onclick={() => leftTab = tab}
							class={['relative px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
								leftTab === tab
									? 'border-foreground text-foreground'
									: 'border-transparent text-muted-foreground hover:text-foreground'
							].join(' ')}>
							{tab === 'guest' ? 'Guest' : tab === 'stay' ? 'Stay' : tab === 'notes' ? 'Notes' : 'History'}
							{#if tab === 'notes' && notes.trim()}
								<span class="absolute top-1.5 right-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
							{/if}
						</button>
					{/each}
				</div>

					<!-- Guest tab -->
					{#if leftTab === 'guest'}
					<section class="rounded-lg border border-border bg-card p-3">
						<div class="space-y-2">
							<div class="relative">
								<Input name="guestName" placeholder="Full name" bind:value={guestName}
									oninput={onNameInput}
									onfocus={() => { if (suggestions.length) showSuggest = true; }}
									onblur={() => setTimeout(() => showSuggest = false, 150)}
									autocomplete="new-password"
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
							<div class="grid grid-cols-2 gap-2">
					<Input name="guestPhone" type="tel" placeholder="Phone" bind:value={guestPhone}
								oninput={onPhoneInput}
								onfocus={() => { if (suggestions.length) showSuggest = true; }}
								onblur={() => setTimeout(() => showSuggest = false, 150)}
								autocomplete="new-password"
								class="h-9" />
							<Input name="guestEmail" type="email" placeholder="Email (optional)" bind:value={guestEmail} autocomplete="new-password" class="h-9" />
							</div>
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
					{/if}

					<!-- Stay tab -->
					{#if leftTab === 'stay'}
					<section class="rounded-lg border border-border bg-card p-3">
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="mb-1 block text-xs text-muted-foreground" for="bc-ci">Check-in</label>
						<input id="bc-ci" type="date" bind:value={checkIn}
								oninput={() => {
									if (checkOut <= checkIn) checkOut = nextDay(checkIn);
									if (requestedRoomTypeId_) loadAvailableRooms();
								}}
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required />
							</div>
							<div>
								<label class="mb-1 block text-xs text-muted-foreground" for="bc-co">Check-out</label>
						<input id="bc-co" type="date" bind:value={checkOut}
								oninput={() => { if (requestedRoomTypeId_) loadAvailableRooms(); }}
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
						{#if isOta}
							<div class="mt-2">
								<label class="mb-1 block text-xs text-muted-foreground">OTA confirmation #</label>
								<Input name="otaConfirmationNumber" placeholder="e.g. BDC-12345" bind:value={otaRef} class="h-8 text-sm" />
							</div>
						{:else}
							<input type="hidden" name="otaConfirmationNumber" value="" />
						{/if}
				</section>

				{/if}

				<!-- Notes tab -->
				{#if leftTab === 'notes'}
				<section class="rounded-lg border border-border bg-card p-3">
					<textarea name="notes" bind:value={notes} rows="5" placeholder="Special requests, info…"
						class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"></textarea>
					{#if status === 'checked_out' && checkoutNotes}
						<div class="mt-2 rounded bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
							<span class="font-semibold">Checkout notes:</span> {checkoutNotes}
						</div>
					{/if}
				</section>
				{/if}

				<!-- History tab -->
				{#if leftTab === 'history'}
				{#if isNew}
					<p class="text-xs text-muted-foreground italic px-1">History is available after the booking is saved.</p>
				{:else}
					<div class="space-y-0 text-xs">
						{#snippet event(ts: number | null, label: string, sub?: string, cls?: string)}
							<div class="flex gap-3 pb-3 relative">
								<div class="flex flex-col items-center">
									<span class={['mt-0.5 h-2 w-2 rounded-full shrink-0 border-2', cls ?? 'border-border bg-background'].join(' ')}></span>
									<div class="w-px flex-1 bg-border"></div>
								</div>
								<div class="pb-0.5 min-w-0">
									<p class="font-medium text-foreground">{label}</p>
									{#if sub}<p class="text-muted-foreground">{sub}</p>{/if}
									{#if ts}<p class="text-muted-foreground/70 mt-0.5">{new Date(ts).toLocaleString('en-CA', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</p>{/if}
								</div>
							</div>
						{/snippet}

						{#if priorStay_}
							{@render event(null, 'Moved from Room ' + (priorStay_.roomNumber ?? '?'), `${fmt(priorStay_.checkInDate)} → ${fmt(priorStay_.checkOutDate)}`, 'border-orange-400 bg-orange-100')}
						{/if}
						{@render event(bookingCreatedAt, 'Booking created', bookingClerkName ? `by ${bookingClerkName}` : undefined, 'border-blue-400 bg-blue-100')}
					{#if confirmSentAt}
						{@render event(new Date(confirmSentAt).getTime(), 'Confirmation sent', guestEmail || undefined, 'border-teal-400 bg-teal-100')}
					{/if}
					{#if selfCheckinAt_}
						{@render event(selfCheckinAt_, 'Self check-in completed', undefined, 'border-purple-400 bg-purple-100')}
					{/if}
						{#each payments as p}
							{@render event(p.chargedAt, `${fmtPayType(p.type)} · ${fmtMoney(p.amount)}`, `${p.paymentMethod}${(p as {status?:string}).status === 'pending' ? ' (pending)' : ''}`, p.type === 'refund' ? 'border-red-400 bg-red-100' : 'border-green-400 bg-green-100')}
						{/each}
						{#if bookingCheckedInAt}
							{@render event(bookingCheckedInAt, 'Checked in', undefined, 'border-green-500 bg-green-200')}
						{/if}
						{#if bookingCheckedOutAt}
							{@render event(bookingCheckedOutAt, 'Checked out', undefined, 'border-gray-400 bg-gray-200')}
						{/if}
						{#if bookingCancelledAt}
							{@render event(bookingCancelledAt, 'Cancelled', undefined, 'border-red-500 bg-red-200')}
						{/if}
					</div>
				{/if}
				{/if}

			</div><!-- /left -->

			<!-- ── RIGHT: Room picker (inventory new booking) OR Folio ──────────── -->
			<div class="flex flex-col gap-4">

			{#if requestedRoomTypeId_ && isNew && !roomId_ && !roomPickerDismissed}
				<!-- ── Room assignment panel ───────────────────────────────────── -->
				<section class="rounded-lg border-2 border-teal-400 bg-teal-50/60 dark:bg-teal-950/20 p-4 flex flex-col gap-4">
					<div>
						<h3 class="text-sm font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
							<span>🛏</span> Assign a Room
						</h3>
						<p class="text-xs text-teal-700/80 dark:text-teal-300/80 mt-1">
							Booking from inventory grid for <strong>{roomNumber_}</strong>. Pick a specific room or queue as unassigned.
						</p>
					</div>

					{#if availRoomsLoading}
						<p class="text-sm text-muted-foreground animate-pulse">Checking availability…</p>
					{:else if availRooms.length === 0 && checkIn && checkOut}
						<p class="text-sm text-amber-700">All rooms of this type are fully booked for these dates.</p>
						<button type="button" onclick={() => roomPickerDismissed = true}
							class="w-full rounded-lg bg-teal-600 text-white py-2.5 text-sm font-semibold hover:bg-teal-700 transition-colors">
							Queue as Unassigned →
						</button>
					{:else}
						<select
							class="w-full rounded-md border border-teal-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
							value=""
							onchange={(e) => pickAvailRoom((e.target as HTMLSelectElement).value)}
						>
							<option value="" disabled>— Choose a room —</option>
							{#each availRooms as r}
								<option value={r.id}>Room {r.roomNumber} – {r.roomTypeName}</option>
							{/each}
						</select>
						<p class="text-[10px] text-teal-600 -mt-2">{availRooms.length} room{availRooms.length === 1 ? '' : 's'} available</p>
						<button type="button" onclick={() => roomPickerDismissed = true}
							class="text-xs text-teal-600 hover:text-teal-800 text-center underline underline-offset-2">
							Queue as unassigned instead
						</button>
					{/if}
				</section>
			{:else}

				<!-- ── Folio ───────────────────────────────────────────────────── -->
					<section class="rounded-lg border border-border bg-card p-3">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folio</h3>
							<button type="button" onclick={suggestRate} disabled={rateLoading}
								class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
								{rateLoading ? '…' : '↻ Suggest rate'}
							</button>
						</div>

						{#if minNightWarning}
							<div class="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
								<span class="shrink-0 font-bold">⚠</span>
								<span>{minNightWarning} You can still save — operator override.</span>
								<button type="button" onclick={() => minNightWarning = null}
									class="ml-auto shrink-0 text-amber-600 hover:text-amber-900">✕</button>
							</div>
						{/if}

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

				<!-- Hidden form fields for all add-ons (server-side parsing) -->
				{#each addonLines as line, i}
					<input type="hidden" name="addon-label-{i}"   value={line.label} />
					<input type="hidden" name="addon-qty-{i}"     value={line.qty} />
					<input type="hidden" name="addon-unit-{i}"    value={line.unit} />
					<input type="hidden" name="addon-total-{i}"   value={line.total} />
					<input type="hidden" name="addon-taxable-{i}" value={line.isTaxable ? '1' : '0'} />
				{/each}

				<!-- Add-Ons -->
				<div class="mt-3 space-y-1.5">
					<div class="flex items-center justify-between">
						<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Add-Ons</p>
						<button type="button" onclick={() => addonPickerOpen = true}
							class="text-xs text-muted-foreground hover:text-foreground">+ add-on</button>
					</div>
					{#each addonLines as line}
						<div class="flex items-center gap-1.5">
							<input placeholder="Label" bind:value={line.label}
								class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
							<input type="number" step="1" min="1" placeholder="Qty" bind:value={line.qty}
								oninput={() => calcAddonTotal(line)}
								class="w-12 rounded border border-input bg-background px-1 py-1 text-center text-xs" />
							<input type="number" step="0.01" placeholder="$/ea" bind:value={line.unit}
								oninput={() => calcAddonTotal(line)}
								class="w-16 rounded border border-input bg-background px-2 py-1 text-xs" />
							<div class="relative w-20">
								<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
								<input type="number" step="0.01" bind:value={line.total}
									class="w-full rounded border border-input bg-background pl-5 pr-1 py-1 text-xs" />
							</div>
							<!-- Subtle taxable indicator — click to toggle if needed -->
							<button type="button" title={line.isTaxable ? 'Taxable — click to mark non-taxable' : 'Non-taxable — click to mark taxable'}
								onclick={() => line.isTaxable = !line.isTaxable}
								class="shrink-0 w-5 text-center text-[10px] leading-none {line.isTaxable ? 'text-teal-500/70 hover:text-teal-700' : 'text-gray-400/60 hover:text-gray-600'}">
								{line.isTaxable ? 'T' : '—'}
							</button>
							<button type="button" onclick={() => addonLines = addonLines.filter(l => l.id !== line.id)}
								class="shrink-0 px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
						</div>
					{/each}
					{#if addonLines.length === 0}
						<p class="text-xs italic text-muted-foreground/50">None yet</p>
					{/if}
				</div>

				<!-- Tax lines -->
				<div class="mt-3 space-y-1.5">
					<div class="border-t border-border pt-2 mb-2">
						<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Taxes</p>
					</div>
					{#each taxLines as line, i}
						{@const taxBase = (line.appliesToRoom ? rateTotal : 0) + (line.appliesToAddon ? taxableAddonTotal : 0)}
						<div class="flex items-center gap-1">
							{#if taxPresets.length}
								<select onchange={(e) => applyPreset(line, (e.target as HTMLSelectElement).value)}
									class="rounded border border-input bg-background px-1 py-1 text-xs shrink-0">
									<option value="">Custom</option>
									{#each taxPresets as p}<option value={p.id} selected={line.presetId===p.id}>{p.label}</option>{/each}
								</select>
							{/if}
							<input name="tax-label-{i}" placeholder="Label" bind:value={line.label}
								class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
							<div class="relative w-14 shrink-0">
								<input type="number" min="0" max="100" step="0.01" placeholder="%" bind:value={line.percent}
									oninput={() => {
										const pct = parseFloat(line.percent);
										if (pct >= 0) line.total = (taxBase * pct / 100).toFixed(2);
									}}
									class="w-full rounded border border-input bg-background px-2 pr-4 py-1 text-xs" />
								<span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
							</div>
							<div class="relative w-16 shrink-0">
								<span class="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
								<input name="tax-total-{i}" type="number" step="0.01" bind:value={line.total}
									oninput={() => { if (line.percent) line.percent = ''; }}
									class={['w-full rounded border border-input bg-background pl-4 pr-1 py-1 text-xs',
										line.percent ? 'text-muted-foreground' : ''].join(' ')} />
							</div>
							<button type="button" onclick={() => taxLines = taxLines.filter(l => l.id !== line.id)}
								class="shrink-0 px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
						</div>
					{/each}
					<button type="button" onclick={() => {
						taxLines = [...taxLines, { id: crypto.randomUUID(), presetId: '', label: '', percent: '', total: '', appliesToRoom: true, appliesToAddon: true }];
					}} class="text-xs text-muted-foreground hover:text-foreground">+ tax line</button>
				</div>

				<!-- Non-taxable add-ons (display only — populated by picker) -->
				<!-- Totals summary — grocery-receipt style: show each tax with its base -->
				<div class="mt-3 border-t border-border pt-2 space-y-1 text-sm">
					{#each taxLines as line}
						{#if parseFloat(line.total) > 0}
							{@const taxBase = (line.appliesToRoom ? rateTotal : 0) + (line.appliesToAddon ? taxableAddonTotal : 0)}
							<div class="flex justify-between text-muted-foreground text-xs">
								<span>
									{line.label || 'Tax'}{line.percent ? ` (${line.percent}%)` : ''}
									<span class="ml-1 opacity-60">on ${taxBase.toFixed(2)}</span>
								</span>
								<span>${parseFloat(line.total).toFixed(2)}</span>
							</div>
						{/if}
					{/each}
					<div class="flex justify-between font-semibold text-base border-t border-border pt-1 mt-0.5">
						<span>Total charges</span><span>${grandTotal.toFixed(2)}</span>
					</div>
				</div>

				<!-- Add-on picker overlay -->
				{#if addonPickerOpen}
					<div class="fixed inset-0 z-[200] flex items-center justify-center">
						<div class="absolute inset-0 bg-black/50" role="button" tabindex="-1"
							onclick={() => addonPickerOpen = false} onkeydown={() => {}}></div>
						<div class="relative z-10 w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="text-sm font-semibold">Add an Add-On</h3>
								<button type="button" onclick={() => addonPickerOpen = false}
									class="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
							</div>
							{#if addonPresets.length}
								{#if addonPresets.some(p => p.isTaxable)}
									<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Taxable</p>
									<div class="mb-3 space-y-1">
										{#each addonPresets.filter(p => p.isTaxable) as p}
											<button type="button" onclick={() => addAddonFromPreset(p)}
												class="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted text-left">
												<span>{p.name}</span>
												<span class="text-xs text-muted-foreground">${(p.defaultUnitCents / 100).toFixed(2)} / ea</span>
											</button>
										{/each}
									</div>
								{/if}
								{#if addonPresets.some(p => !p.isTaxable)}
									<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Non-Taxable</p>
									<div class="mb-3 space-y-1">
										{#each addonPresets.filter(p => !p.isTaxable) as p}
											<button type="button" onclick={() => addAddonFromPreset(p)}
												class="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted text-left">
												<span>{p.name}</span>
												<span class="text-xs text-muted-foreground">${(p.defaultUnitCents / 100).toFixed(2)} / ea</span>
											</button>
										{/each}
									</div>
								{/if}
							{:else}
								<p class="mb-3 text-sm text-muted-foreground">No presets configured. Enter manually below.</p>
							{/if}
							<div class="flex gap-2 border-t border-border pt-3">
								<button type="button" onclick={() => addCustomAddon(true)}
									class="flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
									+ Custom (taxable)
								</button>
								<button type="button" onclick={() => addCustomAddon(false)}
									class="flex-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
									+ Custom (no tax)
								</button>
							</div>
						</div>
					</div>
				{/if}

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
								{#if depositAmt && parseFloat(depositAmt) > 0}
								<label class="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2">
									<input type="checkbox" name="depositReceived" value="true"
										class="h-4 w-4 rounded border-input accent-teal-600" />
									<span class="text-xs text-foreground font-medium">Deposit received now</span>
									<span class="text-[10px] text-muted-foreground">(leave unchecked to note it as pending)</span>
								</label>
								{/if}
							{:else}
							<!-- Existing booking: payment history as ledger rows -->
							{#if payments.length}
								<div class="mb-2 space-y-0.5">
									{#each payments as p}
						<div class={['flex items-center gap-1 rounded px-2 py-1 text-xs',
										(p as { status?: string }).status === 'pending'
											? 'bg-amber-50 border border-amber-200'
											: 'hover:bg-muted/40'
									].join(' ')}>
										<div class="min-w-0 flex-1">
											<span class="text-muted-foreground">{fmtPayType(p.type)} · {p.paymentMethod}</span>
											{#if (p as { status?: string }).status === 'pending'}
												<span class="ml-1 text-[10px] font-semibold text-amber-700 rounded-full bg-amber-100 px-1.5 py-0.5">PENDING</span>
											{/if}
											{#if p.notes}
												<p class="mt-0.5 text-[10px] italic text-muted-foreground/70 truncate">{p.notes}</p>
											{/if}
										</div>
											<span class={['shrink-0 font-medium', p.type === 'refund' ? 'text-destructive' : (p as { status?: string }).status === 'pending' ? 'text-amber-600' : 'text-green-700'].join(' ')}>
												{p.type === 'refund' ? '+' : '−'}{fmtMoney(p.amount)}
											</span>
											<!-- ⋮ context menu -->
											<div class="relative shrink-0">
												<button type="button"
													onclick={() => openPayMenu = openPayMenu === p.id ? null : p.id}
													class="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground leading-none"
												>⋮</button>
												{#if openPayMenu === p.id}
													<button type="button" class="fixed inset-0 z-40 cursor-default" onclick={() => openPayMenu = null}
														aria-label="Close menu"></button>
													<div class="absolute right-0 top-full z-50 min-w-[148px] rounded-md border border-border bg-background py-1 shadow-lg">
														{#if (p as { status?: string }).status === 'pending'}
															<button type="button"
																onclick={() => { markPaymentReceived(p.id); openPayMenu = null; }}
																class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted">
																✓ Mark received
															</button>
															<div class="my-1 border-t border-border"></div>
														{/if}
														<button type="button"
															onclick={() => { deletePayment(p.id); openPayMenu = null; }}
															class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-destructive hover:bg-muted">
															Delete payment
														</button>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
								{:else}
									<p class="mb-2 text-xs text-muted-foreground italic">No payments recorded yet.</p>
								{/if}

								<!-- Deposit confirm prompt -->
							{#if depositPromptPayId}
								<div class="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
									<p class="mb-1 font-medium text-blue-900">Deposit received — confirm this booking?</p>
									<p class="mb-3 text-xs text-blue-700">Confirming will update the status to <strong>Confirmed</strong> and send a confirmation email to the guest.</p>
									<div class="flex gap-2">
										<button type="button" onclick={() => resolveDepositPrompt(true)} disabled={depositPromptBusy}
											class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
											{depositPromptBusy ? '…' : 'Confirm booking'}
										</button>
										<button type="button" onclick={() => resolveDepositPrompt(false)} disabled={depositPromptBusy}
											class="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50">
											Skip for now
										</button>
									</div>
								</div>
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
													autocomplete="off"
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
									<input type="text" bind:value={payNotes} placeholder="Notes (optional)"
										class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" />
									{#if payErr}<p class="text-xs text-destructive">{payErr}</p>{/if}
										<div class="flex gap-2">
											<button type="button" onclick={recordPayment} disabled={payBusy}
												class="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
												{payBusy ? 'Saving…' : 'Record payment'}
											</button>
											<button type="button" onclick={() => { addingPay = false; payAmt = ''; payErr = ''; }}
												class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
										</div>
									</div>
								{/if}

							<!-- CC on file -->
							<div class="mt-2">
								{#if ccInfo}
									<div class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
										<span class="font-medium">💳 {ccInfo.cardType ?? 'Card'} ••••{ccInfo.lastFour}</span>
										<button type="button" onclick={() => ccCapturing = true}
											class="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground">update</button>
										<button type="button" onclick={deleteCC} disabled={ccBusy}
											class="text-destructive/70 hover:text-destructive">remove</button>
									</div>
								{:else if !ccCapturing}
									<button type="button" onclick={() => ccCapturing = true}
										class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">+ capture card on file</button>
								{/if}
								{#if ccCapturing}
									<div class="mt-1.5 space-y-2 rounded-md border border-border bg-muted/30 p-3">
										<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Card on file</p>
										<div class="grid grid-cols-2 gap-2">
											<div>
												<label class="mb-0.5 block text-xs text-muted-foreground">Type</label>
												<select bind:value={ccCardType} class="w-full rounded border border-input bg-background px-2 py-1 text-xs">
													<option>Visa</option><option>Mastercard</option><option>Amex</option>
													<option>Discover</option><option>Debit</option><option>Other</option>
												</select>
											</div>
											<div>
												<label class="mb-0.5 block text-xs text-muted-foreground">Last 4 digits</label>
												<input type="text" maxlength="4" inputmode="numeric" bind:value={ccLastFour}
													placeholder="1234" class="w-full rounded border border-input bg-background px-2 py-1 text-xs" />
											</div>
											<div>
												<label class="mb-0.5 block text-xs text-muted-foreground">Expiry (MM/YY)</label>
												<input type="text" maxlength="5" bind:value={ccExpiry}
													placeholder="09/27" class="w-full rounded border border-input bg-background px-2 py-1 text-xs" />
											</div>
											<div>
												<label class="mb-0.5 block text-xs text-muted-foreground">Cardholder name</label>
												<input type="text" bind:value={ccName}
													placeholder="J. Smith" class="w-full rounded border border-input bg-background px-2 py-1 text-xs" />
											</div>
										</div>
										<div class="flex gap-2">
											<button type="button" onclick={saveCC} disabled={ccBusy}
												class="flex-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
												{ccBusy ? 'Saving…' : 'Save card'}
											</button>
											<button type="button" onclick={() => { ccCapturing = false; ccLastFour = ''; ccExpiry = ''; ccName = ''; }}
												class="rounded-md border border-input px-3 py-1 text-xs hover:bg-muted">Cancel</button>
										</div>
									</div>
						{/if}
					</div>
					{/if}

					<!-- Elavon Converge charge panel (only when property has credentials) -->
					{#if !isNew && propElavonEnabled}
						<div class="mt-2">
							{#if !elavonPanelOpen}
								<button type="button" onclick={openElavonPanel}
									class="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
									💳 Charge card via Elavon
								</button>
							{:else}
								<div class="mt-1 rounded-md border border-blue-200 bg-blue-50/40 p-3 space-y-2">
									<div class="flex items-center justify-between">
										<p class="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Elavon Converge — Charge Card</p>
										<button type="button" onclick={() => { elavonPanelOpen = false; elavonChargeError = ''; }}
											class="text-xs text-muted-foreground hover:text-foreground">✕ close</button>
									</div>
									{#if elavonTokenBusy}
										<p class="text-xs text-muted-foreground">Loading secure payment fields…</p>
									{:else if elavonChargeError}
										<p class="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{elavonChargeError}</p>
									{/if}

									<!-- Amount + type -->
									<div class="grid grid-cols-2 gap-2">
										<div>
											<label class="mb-0.5 block text-xs text-muted-foreground">Amount ($)</label>
											<input type="number" step="0.01" min="0" bind:value={elavonChargeAmt}
												placeholder={balanceCents > 0 ? (balanceCents/100).toFixed(2) : '0.00'}
												class="w-full rounded border border-input bg-background px-2 py-1 text-xs" />
										</div>
										<div>
											<label class="mb-0.5 block text-xs text-muted-foreground">Type</label>
											<select bind:value={elavonChargeType}
												class="w-full rounded border border-input bg-background px-2 py-1 text-xs">
												<option value="deposit">Deposit</option>
												<option value="final_charge">Final charge</option>
											</select>
										</div>
									</div>

									<!-- Checkout.js hosted card fields render here -->
									<div id="ssl_hosted_payment_fields_container" class="min-h-[80px] rounded border border-border bg-background p-2"></div>

									<div class="flex gap-2">
										<button type="button"
											disabled={elavonCharging || elavonTokenBusy || !elavonToken}
											onclick={() => {
												if (typeof window !== 'undefined') {
													const w = window as unknown as Record<string, unknown>;
													if (typeof w['ConvergeEmbeddedPayment'] !== 'undefined') {
														(w['ConvergeEmbeddedPayment'] as { pay: () => void }).pay();
													}
												}
											}}
											class="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
											{elavonCharging ? 'Processing…' : 'Charge card'}
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/if}

				<!-- Balance row (always visible for existing bookings) -->
				{#if !isNew}
						<div class={['mt-3 flex items-center justify-between rounded-md border px-3 py-2.5 text-sm font-semibold', balanceCents > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'].join(' ')}>
							<div>
								<span>{balanceCents > 0 ? 'Balance due' : 'Paid in full'}</span>
								{#if balanceCents > 0}
									<span class="ml-2 text-xs font-normal opacity-70">(${(collected/100).toFixed(2)} of ${grandTotal.toFixed(2)} received)</span>
								{/if}
								{#if pending > 0}
									<div class="mt-0.5 text-[10px] font-normal text-amber-600">⏳ Deposit pending: ${(pending/100).toFixed(2)} not yet collected</div>
								{/if}
							</div>
							<div class="flex items-center gap-3">
								<a href="/booking/{bookingId}/receipt" target="_blank"
									class="text-[11px] font-normal underline underline-offset-2 opacity-60 hover:opacity-100">
									receipt ↗
								</a>
								<span class="text-base">{balanceCents > 0 ? fmtMoney(balanceCents) : '✓'}</span>
							</div>
						</div>
				{/if}
					</div><!-- /payments section -->
			</section>

		{/if}<!-- end room picker / folio swap -->

			</div><!-- /right -->

				</div><!-- /grid -->
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

					<!-- Send Confirmation — always visible, disabled when no guest email -->
					<span title={!guestEmail ? 'No guest email on file' : undefined}>
					<CustomDialog
						title="Send Confirmation"
						disabled={!guestEmail}
						dialogClass="sm:max-w-xl"
					>
					{#snippet trigger()}
						<span class="flex items-center gap-1">
							✉ Send Confirmation
							{#if confirmSentAt}
								<span class="text-[10px] text-muted-foreground font-normal">
									(sent {new Date(confirmSentAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })})
								</span>
							{/if}
						</span>
					{/snippet}
						{#snippet content()}
							<div class="space-y-4">
								<!-- Email preview card -->
								<div class="rounded-lg border border-border bg-white text-sm shadow-sm overflow-hidden">
									<!-- Header with logo -->
									<div class="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center gap-3">
										{#if propLogoUrl}
											<img src={propLogoUrl} alt={propName} class="h-10 w-auto object-contain" />
										{:else}
											<div class="text-base font-bold tracking-tight text-gray-800">{propName}</div>
										{/if}
										<div class="ml-auto text-xs text-gray-400 text-right">
											<div class="font-semibold text-gray-600">Booking Confirmation</div>
											{#if propAddress}<div>{propAddress}</div>{/if}
											{#if propPhone}<div>{propPhone}</div>{/if}
										</div>
									</div>
									<!-- Body -->
									<div class="px-5 py-4 space-y-3 text-gray-700">
										<p>Hi <strong>{guestName || 'Guest'}</strong>,</p>
										<p>Your booking is confirmed. Here are the details:</p>
										<table class="w-full text-xs mt-2">
											<tbody>
												<tr class="border-b border-gray-100">
													<td class="py-1.5 pr-4 text-gray-500 w-28">Check-in</td>
													<td class="py-1.5 font-medium">
														{checkIn ? new Date(checkIn + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
														<span class="text-gray-400 font-normal ml-1">after {propCheckInTime}</span>
													</td>
												</tr>
												<tr class="border-b border-gray-100">
													<td class="py-1.5 pr-4 text-gray-500">Check-out</td>
													<td class="py-1.5 font-medium">
														{checkOut ? new Date(checkOut + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
														<span class="text-gray-400 font-normal ml-1">by {propCheckOutTime}</span>
													</td>
												</tr>
												<tr class="border-b border-gray-100">
													<td class="py-1.5 pr-4 text-gray-500">Duration</td>
													<td class="py-1.5">{nights} night{nights === 1 ? '' : 's'}</td>
												</tr>
												{#if roomNumber_}
													<tr class="border-b border-gray-100">
														<td class="py-1.5 pr-4 text-gray-500">Room</td>
														<td class="py-1.5">{roomNumber_}{roomTypeName ? ' – ' + roomTypeName : ''}</td>
													</tr>
												{/if}
												{#if grandTotal > 0}
													<tr class="border-b border-gray-100">
														<td class="py-1.5 pr-4 text-gray-500">Total</td>
														<td class="py-1.5 font-semibold">${grandTotal.toFixed(2)}</td>
													</tr>
													{#if (collected - refunded) > 0}
														<tr class="border-b border-gray-100">
															<td class="py-1.5 pr-4 text-gray-500">Deposit</td>
															<td class="py-1.5 text-green-700">${((collected - refunded) / 100).toFixed(2)} received</td>
														</tr>
														{@const balDue = Math.max(0, grandTotal - (collected - refunded) / 100)}
														{#if balDue > 0}
															<tr>
																<td class="py-1.5 pr-4 text-gray-500">Balance due</td>
																<td class="py-1.5 font-semibold text-amber-700">${balDue.toFixed(2)} on arrival</td>
															</tr>
														{/if}
													{/if}
												{/if}
											</tbody>
										</table>
										<p class="text-xs text-gray-500 pt-1 italic">Please bring this confirmation upon arrival. We look forward to your stay!</p>
									</div>
									<!-- Footer -->
									<div class="bg-gray-50 border-t border-gray-200 px-5 py-2 text-xs text-gray-400">
										{propName}{propAddress ? ' · ' + propAddress : ''}{propPhone ? ' · ' + propPhone : ''}
									</div>
								</div>
								<!-- Sending to -->
								<p class="text-xs text-muted-foreground">
									Sending to: <strong class="text-foreground">{guestEmail}</strong>
									{#if confirmSentAt}
										· Last sent {new Date(confirmSentAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
									{/if}
								</p>
							</div>
						{/snippet}
						{#snippet footer()}
							<div class="flex w-full items-center justify-between gap-2">
								<button type="button"
									onclick={copyConfirmationText}
									class="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
									Copy text
								</button>
								<a
									href={buildMailtoHref()}
									target="_blank"
									rel="noopener"
									onclick={() => markConfirmationSent()}
									class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium flex items-center gap-1.5">
									✉ Open in Mail App
								</a>
							</div>
						{/snippet}
				</CustomDialog>
				</span>

				<!-- Self Check-in Link — confirmed/checked_in bookings only -->
				{#if status === 'confirmed' || status === 'reserved'}
					<div class="relative">
						{#if selfCheckinAt_}
							<!-- Already completed: show badge -->
							<span class="flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs text-purple-700">
								✓ Self check-in done
							</span>
						{:else}
							<button type="button"
								onclick={copySelfCheckinLink}
								disabled={selfCheckinLinkBusy}
								class="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
								{selfCheckinLinkBusy ? 'Generating…' : selfCheckinCopied ? '✓ Copied!' : '🔗 Self check-in link'}
							</button>
							{#if selfCheckinUrl && !selfCheckinCopied}
								<div class="absolute bottom-full mb-1 left-0 z-50 w-64 rounded-md border border-border bg-popover p-2 text-xs shadow-md">
									<p class="text-muted-foreground mb-1">Share this link with your guest:</p>
									<p class="break-all font-mono text-[10px] text-foreground select-all">{selfCheckinUrl}</p>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Folio link -->
					{#if selfCheckinUrl}
						{@const folioUrl = selfCheckinUrl.replace('/checkin/', '/folio/')}
						<a href={folioUrl} target="_blank" rel="noopener"
							class="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted inline-block">
							📄 View folio
						</a>
					{/if}
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
					{#if status === 'confirmed' || status === 'reserved'}
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
