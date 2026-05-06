<script lang="ts">
	/**
	 * GroupCard — full folio for a multi-room group booking.
	 * Used when:
	 *   a) creating a new group (newRooms prop set from draw mode)
	 *   b) viewing/editing an existing group (groupId prop set)
	 */
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';

	type Channel  = { id: string; name: string };
	type User     = { id: string; name: string };

	type RoomSpec = {
		roomId: string;
		roomNumber: string;
		propertyName: string;
		checkIn: string;
		checkOut: string;
		roomConfigs: string[];
		rateLines: RateLine[];
		taxLines:  TaxLine[];
		// When true, this room pays on their own (excluded from group total)
		payOwn: boolean;
		// bookingId needed for payment operations on existing groups
		bookingId?: string;
		// Payment events loaded from existing group
		payments: PaymentEvent[];
		// Suggested deposit cents from pricing API (policy-aware)
		suggestedDepositCents?: number;
	};

	type PaymentEvent = {
		id: string;
		type: 'deposit' | 'final_charge' | 'refund';
		amount: number;     // cents
		paymentMethod: string;
		notes: string | null;
		chargedAt: string | null;
	};

	type RateLine = { id: string; label: string; qty: string; unit: string; total: string };
	type TaxLine  = { id: string; label: string; total: string };

	type Props = {
		open: boolean;
		groupId?: string;   // existing group
		newRooms?: {        // from draw mode → create new group
			roomId: string; roomNumber: string; propertyName: string;
			checkIn: string; checkOut: string; roomConfigs: string[];
		}[];
		channels: Channel[];
		users: User[];
		currentUserId: string;
		today: string;
	};

	let {
		open = $bindable(false),
		groupId,
		newRooms,
		channels, users, currentUserId, today
	}: Props = $props();

	// ── Group meta ────────────────────────────────────────────────────────────
	let groupName      = $state('');
	let organizerName  = $state('');
	let organizerPhone = $state('');
	let organizerEmail = $state('');
	let billingType    = $state<'master' | 'individual'>('master');
	let groupNotes     = $state('');

	// ── Per-room specs ────────────────────────────────────────────────────────
	let roomSpecs = $state<RoomSpec[]>([]);

	// ── Shared fields ─────────────────────────────────────────────────────────
	let channelId    = $state('');
	let depositAmt   = $state('');
	let depositMethod = $state('cash');

	// ── UI ────────────────────────────────────────────────────────────────────
	let saving   = $state(false);
	let saveError = $state('');
	let loading  = $state(false);

	// ── Folio transfer ────────────────────────────────────────────────────────
	type TransferForm = {
		paymentId: string;
		fromBookingId: string;
		fromRoomNumber: string;
		amount: string;           // dollars string, editable
		maxCents: number;
		toBooingIdx: number;      // index into roomSpecs
	};
	let transferForm = $state<TransferForm | null>(null);
	let transferBusy = $state(false);
	let transferError = $state('');

	// ── Tax presets ───────────────────────────────────────────────────────────
	let taxPresets = $state<{ id: string; label: string; ratePercent: number }[]>([]);

	// ── Derived ───────────────────────────────────────────────────────────────
	const totalCharges = $derived(
		roomSpecs.reduce((sum, r) => {
			if (r.payOwn) return sum; // excluded from group bill
			const rt = r.rateLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
			const tt = r.taxLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
			return sum + rt + tt;
		}, 0)
	);
	const depositCents = $derived(Math.round((parseFloat(depositAmt) || 0) * 100));
	// For existing groups: sum all payment events across all rooms
	const groupCollectedCents = $derived(
		roomSpecs.reduce((sum, r) => {
			const paid = r.payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
			const refunded = r.payments.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
			return sum + paid - refunded;
		}, 0)
	);
	// Balance uses either the new deposit input (new group) or collected payments (existing group)
	const effectivePaidCents = $derived(groupId ? groupCollectedCents : depositCents);
	const balanceCents = $derived(Math.round(totalCharges * 100) - effectivePaidCents);

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	$effect(() => {
		if (open) {
			if (groupId) loadGroup(groupId);
			else if (newRooms?.length) initNew(newRooms);
		} else {
			reset();
		}
	});

	function reset() {
		groupName = ''; organizerName = ''; organizerPhone = ''; organizerEmail = '';
		billingType = 'master'; groupNotes = '';
		roomSpecs = []; channelId = ''; depositAmt = ''; depositMethod = 'cash';
		saving = false; saveError = ''; loading = false;
		transferForm = null; transferBusy = false; transferError = '';
	}

	function defChannel(pref: string) {
		const match = channels.find(c => c.name.toLowerCase().includes(pref.toLowerCase()));
		return match?.id ?? channels[0]?.id ?? '';
	}

	function initNew(rooms: NonNullable<typeof newRooms>) {
		channelId = defChannel('phone');
		fetchTaxPresets();
		roomSpecs = rooms.map(r => ({
			roomId: r.roomId,
			roomNumber: r.roomNumber,
			propertyName: r.propertyName,
			checkIn: r.checkIn,
			checkOut: r.checkOut,
			roomConfigs: r.roomConfigs,
			rateLines: [{ id: crypto.randomUUID(), label: '', qty: String(nightsBetween(r.checkIn, r.checkOut)), unit: '', total: '' }],
			taxLines: [],
			payOwn: false,
			payments: []
		}));
		// Defer rate suggestions past the current reactive scope so we don't
		// write back to roomSpecs while the $effect is still tracking reads.
		const count = rooms.length;
		tick().then(() => {
			for (let i = 0; i < count; i++) suggestRoomRate(i, true);
		});
	}

	async function loadGroup(id: string) {
		loading = true;
		try {
			const r = await fetch(`/api/groups/${id}`);
			if (!r.ok) throw new Error();
			const g = await r.json();
			groupName      = g.name;
			organizerName  = g.organizerName ?? '';
			organizerPhone = g.organizerPhone ?? '';
			organizerEmail = g.organizerEmail ?? '';
			billingType    = g.billingType ?? 'master';
			groupNotes     = g.notes ?? '';
			channelId      = g.bookings?.[0]?.channelId ?? defChannel('phone');
			roomSpecs = (g.bookings ?? []).map((b: Record<string, unknown>) => {
				const rateLines = (b.lineItems as { type: string; label: string; quantity: number | null; unitAmount: number | null; totalAmount: number }[])
					.filter((li) => li.type === 'rate')
					.map((li) => ({
						id: crypto.randomUUID(),
						label: li.label,
						qty: li.quantity != null ? String(li.quantity) : '',
						unit: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : '',
						total: (li.totalAmount / 100).toFixed(2)
					}));
				const taxLines = (b.lineItems as { type: string; label: string; totalAmount: number }[])
					.filter((li) => li.type === 'tax')
					.map((li) => ({
						id: crypto.randomUUID(),
						label: li.label,
						total: (li.totalAmount / 100).toFixed(2)
					}));
				const roomData = b.room as { roomNumber: string } | null;
			return {
				roomId: (b.roomId as string) ?? '',
				roomNumber: roomData?.roomNumber ?? '',
				propertyName: '',
				checkIn: b.checkInDate as string,
				checkOut: b.checkOutDate as string,
				roomConfigs: [],
				rateLines: rateLines.length ? rateLines : [{ id: crypto.randomUUID(), label: '', qty: '', unit: '', total: '' }],
				taxLines,
				payOwn: false,
				bookingId: b.id as string,
				payments: ((b.paymentEvents ?? []) as {
					id: string; type: string; amount: number;
					paymentMethod: string; notes: string | null; chargedAt: string | null
				}[]).map(p => ({
					id: p.id,
					type: p.type as PaymentEvent['type'],
					amount: p.amount,
					paymentMethod: p.paymentMethod,
					notes: p.notes,
					chargedAt: p.chargedAt
				}))
			};
			});
			fetchTaxPresets();
		} catch { saveError = 'Could not load group.'; }
		finally { loading = false; }
	}

	async function fetchTaxPresets() {
		try {
			const r = await fetch('/api/tax-presets');
			if (r.ok) taxPresets = await r.json();
		} catch { /* ignore */ }
	}

	// ── Per-room helpers ──────────────────────────────────────────────────────

	function nightsBetween(a: string, b: string) {
		return Math.max(0, Math.round(
			(new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000
		));
	}

	function calcRateTotal(line: RateLine) {
		const qty = parseFloat(line.qty) || 0;
		const unit = parseFloat(line.unit) || 0;
		if (qty > 0 && unit > 0) line.total = (qty * unit).toFixed(2);
	}

	function roomRateTotal(spec: RoomSpec) {
		return spec.rateLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
	}
	function roomTaxTotal(spec: RoomSpec) {
		return spec.taxLines.reduce((s, l) => s + (parseFloat(l.total) || 0), 0);
	}

	let rateLoadingIdx = $state<number | null>(null);
	async function suggestRoomRate(idx: number, silent = false) {
		const spec = roomSpecs[idx];
		if (!spec || !spec.roomId || !spec.checkIn || !spec.checkOut) return;
		const hasRates = spec.rateLines.some(l => parseFloat(l.total) > 0);
		if (hasRates && !silent) {
			if (!window.confirm('Replace current rate lines with suggested pricing?')) return;
		}
		rateLoadingIdx = idx;
		try {
			const r = await fetch(`/api/pricing/suggest?roomId=${encodeURIComponent(spec.roomId)}&checkIn=${spec.checkIn}&checkOut=${spec.checkOut}`);
			if (r.ok) {
				const d = await r.json();
				if (d?.lines?.length) {
					roomSpecs[idx].rateLines = d.lines.map((l: { seasonName: string; nights: number; unitCents: number; totalCents: number }) => ({
						id: crypto.randomUUID(),
						label: `${l.seasonName} · ${l.nights} night${l.nights === 1 ? '' : 's'}`,
						qty: String(l.nights), unit: (l.unitCents / 100).toFixed(2), total: (l.totalCents / 100).toFixed(2)
					}));
				}
				// Update per-room suggested deposit from API (policy-aware)
				roomSpecs[idx].suggestedDepositCents = d.suggestedDepositCents ?? 0;
				// Re-compute overall suggested deposit as sum of all rooms' suggestions
				if (!depositAmt || depositAmt === '0.00') {
					const total = roomSpecs.reduce((s, rs) => s + (rs.suggestedDepositCents ?? 0), 0);
					if (total > 0) depositAmt = (total / 100).toFixed(2);
				}
			}
		} catch { /* ignore */ }
		finally { rateLoadingIdx = null; }
	}

	function addTaxLine(idx: number) {
		const newLine: TaxLine = { id: crypto.randomUUID(), label: '', total: '' };
		if (taxPresets.length === 1) {
			const p = taxPresets[0];
			const base = roomRateTotal(roomSpecs[idx]);
			newLine.label = p.label;
			newLine.total = (base * p.ratePercent / 100).toFixed(2);
		}
		roomSpecs[idx].taxLines = [...roomSpecs[idx].taxLines, newLine];
	}

	function applyTaxPreset(spec: RoomSpec, line: TaxLine, presetId: string) {
		const preset = taxPresets.find(p => p.id === presetId);
		if (!preset) return;
		line.label = preset.label;
		const base = roomRateTotal(spec);
		line.total = (base * preset.ratePercent / 100).toFixed(2);
	}

	// ── Save ──────────────────────────────────────────────────────────────────
	async function save() {
		if (!groupName.trim()) { saveError = 'Group name is required.'; return; }
		if (!channelId) { saveError = 'Channel is required.'; return; }
		saving = true; saveError = '';
		try {
			const body = {
				groupName: groupName.trim(),
				organizerName: organizerName.trim() || null,
				organizerPhone: organizerPhone.trim() || null,
				organizerEmail: organizerEmail.trim() || null,
				billingType, notes: groupNotes.trim() || null,
				channelId,
				clerkId: currentUserId,
				guestName: organizerName.trim() || null,
				guestPhone: organizerPhone.trim() || null,
				guestEmail: organizerEmail.trim() || null,
				depositAmount: depositCents > 0 ? depositCents : 0,
				depositMethod,
				rooms: roomSpecs.map(s => ({
					roomId: s.roomId,
					checkIn: s.checkIn,
					checkOut: s.checkOut,
					rateLines: s.rateLines.map(l => ({
						label: l.label, qty: parseFloat(l.qty) || null,
						unit: parseFloat(l.unit) || null, total: parseFloat(l.total) || 0
					})).filter(l => l.label && l.total),
					taxLines: s.taxLines.map(l => ({
						label: l.label, total: parseFloat(l.total) || 0
					})).filter(l => l.label && l.total)
				}))
			};
			const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) {
				const err = await res.json();
				saveError = err.error ?? 'Save failed.';
				return;
			}
			open = false;
			await invalidateAll();
		} catch { saveError = 'Network error.'; }
		finally { saving = false; }
	}

	// ── Folio transfer ────────────────────────────────────────────────────────
	function openTransfer(paymentId: string, fromSpec: RoomSpec, paymentAmount: number) {
		if (!fromSpec.bookingId) return;
		transferForm = {
			paymentId,
			fromBookingId: fromSpec.bookingId,
			fromRoomNumber: fromSpec.roomNumber,
			amount: (paymentAmount / 100).toFixed(2),
			maxCents: paymentAmount,
			toBooingIdx: roomSpecs.findIndex(s => s.bookingId !== fromSpec.bookingId && s.bookingId)
		};
		transferError = '';
	}

	async function executeTransfer() {
		if (!transferForm || !groupId) return;
		const targetSpec = roomSpecs[transferForm.toBooingIdx];
		if (!targetSpec?.bookingId) { transferError = 'Select a target room.'; return; }
		const amtCents = Math.round((parseFloat(transferForm.amount) || 0) * 100);
		if (amtCents <= 0) { transferError = 'Enter a valid amount.'; return; }
		if (amtCents > transferForm.maxCents) { transferError = `Max transferable: $${(transferForm.maxCents/100).toFixed(2)}`; return; }

		transferBusy = true; transferError = '';
		try {
			const r = await fetch(`/api/groups/${groupId}/transfer-payment`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					paymentEventId: transferForm.paymentId,
					fromBookingId: transferForm.fromBookingId,
					toBookingId: targetSpec.bookingId,
					amountCents: amtCents
				})
			});
			const d = await r.json();
			if (!r.ok) { transferError = d.error ?? 'Transfer failed.'; return; }
			transferForm = null;
			// Reload group to reflect new payment events
			await loadGroup(groupId);
		} catch { transferError = 'Network error.'; }
		finally { transferBusy = false; }
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
	}
	function fmtMoney(cents: number) {
		return '$' + Math.abs(cents / 100).toFixed(2);
	}
</script>

<CustomDialog
	bind:open
	title={groupId ? groupName || 'Group Booking' : 'New Group Booking'}
	description={`${roomSpecs.length} room${roomSpecs.length === 1 ? '' : 's'} · ${billingType === 'master' ? 'Master billing' : 'Individual billing'}`}
	dialogClass="sm:max-w-4xl"
	closeOnOutsideClick={false}
	interactOutsideBehavior="ignore"
>
	{#snippet content()}
		{#if loading}
			<div class="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
		{:else}
		<div class="flex flex-col gap-4 p-4">

			<!-- ── Group info ─────────────────────────────────────────────────── -->
			<section class="rounded-lg border border-border bg-card p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="sm:col-span-2 flex items-center gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Group</h3>
					<input bind:value={groupName} placeholder="Group name (e.g. Smith Wedding, Crane Co.)" autocomplete="off"
						class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold placeholder:font-normal placeholder:text-muted-foreground" />
					<select bind:value={billingType} class="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
						<option value="master">Master billing</option>
						<option value="individual">Individual billing</option>
					</select>
				</div>
				<div>
					<label class="mb-1 block text-xs text-muted-foreground">Organizer / Contact name</label>
					<input bind:value={organizerName} placeholder="Full name" autocomplete="off"
						class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
				</div>
				<div>
					<label class="mb-1 block text-xs text-muted-foreground">Phone</label>
					<input bind:value={organizerPhone} type="tel" placeholder="555-000-0000" autocomplete="off"
						class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
				</div>
				<div>
					<label class="mb-1 block text-xs text-muted-foreground">Email (optional)</label>
					<input bind:value={organizerEmail} type="email" placeholder="email@example.com" autocomplete="off"
						class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
				</div>
				<div>
					<label class="mb-1 block text-xs text-muted-foreground">Channel / Source</label>
					<select bind:value={channelId} class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
						{#each channels as ch}<option value={ch.id}>{ch.name}</option>{/each}
					</select>
				</div>
				<div class="sm:col-span-2">
					<label class="mb-1 block text-xs text-muted-foreground">Notes</label>
					<textarea bind:value={groupNotes} rows="2" placeholder="Special requests, group notes…" autocomplete="off"
						class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"></textarea>
				</div>
			</section>

			<!-- ── Room folio ─────────────────────────────────────────────────── -->
			<section class="rounded-lg border border-border bg-card p-3">
				<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room Folio</h3>

				<div class="space-y-4">
					{#each roomSpecs as spec, i}
						<div class="rounded-md border border-border bg-muted/20 p-3">
							<!-- Room header -->
						<div class="mb-2 flex items-center justify-between gap-2 flex-wrap">
							<div class="flex items-center gap-2">
								<span class="font-semibold text-sm">Rm {spec.roomNumber}</span>
								{#if spec.propertyName}
									<span class="text-xs text-muted-foreground">{spec.propertyName.split(' ')[0]}</span>
								{/if}
								<span class="text-xs text-muted-foreground">
									{fmtDate(spec.checkIn)} → {fmtDate(spec.checkOut)} · {nightsBetween(spec.checkIn, spec.checkOut)}n
								</span>
								<!-- Pay own toggle -->
								<button type="button"
									onclick={() => { spec.payOwn = !spec.payOwn; }}
									class={['rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
										spec.payOwn
											? 'border-orange-300 bg-orange-100 text-orange-800'
											: 'border-border bg-background text-muted-foreground hover:bg-muted'
									].join(' ')}
									title="Toggle whether this room pays separately or is billed to the group">
									{spec.payOwn ? '💳 Pay own' : '👥 Group bill'}
								</button>
							</div>
								<div class="flex items-center gap-2">
									<button type="button"
										onclick={() => suggestRoomRate(i)}
										disabled={rateLoadingIdx === i}
										class="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
										{rateLoadingIdx === i ? '…' : '↻ Suggest'}
									</button>
									<!-- Date adjustments -->
									<div class="flex items-center gap-1 text-xs">
										<input type="date" bind:value={spec.checkIn}
											class="rounded border border-input bg-background px-1.5 py-0.5 text-xs w-32" />
										<span class="text-muted-foreground">→</span>
										<input type="date" bind:value={spec.checkOut}
											class="rounded border border-input bg-background px-1.5 py-0.5 text-xs w-32" />
									</div>
								</div>
							</div>

							<!-- Rate lines -->
							<div class="space-y-1">
								{#each spec.rateLines as line, j}
									<div class="flex items-center gap-1">
										<input bind:value={line.label} placeholder="e.g. 3n @ $129" autocomplete="off"
											class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
										<input type="number" step="1" min="1" bind:value={line.qty}
											oninput={() => calcRateTotal(line)} placeholder="Qty"
											class="w-12 rounded border border-input bg-background px-1 py-1 text-center text-xs" />
										<input type="number" step="0.01" bind:value={line.unit}
											oninput={() => calcRateTotal(line)} placeholder="$/n"
											class="w-16 rounded border border-input bg-background px-2 py-1 text-xs" />
										<div class="relative w-20">
											<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
											<input type="number" step="0.01" bind:value={line.total}
												class="w-full rounded border border-input bg-background pl-5 pr-1 py-1 text-xs" />
										</div>
										<button type="button" onclick={() => { spec.rateLines = spec.rateLines.filter((_, k) => k !== j); }}
											class="px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
									</div>
								{/each}
								<button type="button"
									onclick={() => { spec.rateLines = [...spec.rateLines, { id: crypto.randomUUID(), label: '', qty: String(nightsBetween(spec.checkIn, spec.checkOut)), unit: '', total: '' }]; }}
									class="text-xs text-muted-foreground hover:text-foreground">+ rate line</button>
							</div>

							<!-- Tax lines -->
							<div class="mt-2 space-y-1">
								{#each spec.taxLines as line, j}
									<div class="flex items-center gap-1">
										{#if taxPresets.length}
											<select onchange={(e) => applyTaxPreset(spec, line, (e.target as HTMLSelectElement).value)}
												class="rounded border border-input bg-background px-1 py-1 text-xs">
												<option value="">Custom</option>
												{#each taxPresets as p}<option value={p.id}>{p.label}</option>{/each}
											</select>
										{/if}
										<input bind:value={line.label} placeholder="Tax" autocomplete="off"
											class="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs" />
										<div class="relative w-20">
											<span class="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
											<input type="number" step="0.01" bind:value={line.total}
												class="w-full rounded border border-input bg-background pl-5 pr-1 py-1 text-xs" />
										</div>
										<button type="button" onclick={() => { spec.taxLines = spec.taxLines.filter((_, k) => k !== j); }}
											class="px-1 text-xs text-muted-foreground hover:text-destructive">×</button>
									</div>
								{/each}
								<button type="button" onclick={() => addTaxLine(i)}
									class="text-xs text-muted-foreground hover:text-foreground">+ tax</button>
							</div>

						<!-- Room subtotal -->
						<div class={['mt-2 flex justify-end gap-4 border-t border-border pt-1.5 text-xs',
							spec.payOwn ? 'text-orange-500 line-through' : 'text-muted-foreground'
						].join(' ')}>
							<span>Charges: <strong class="text-foreground">${roomRateTotal(spec).toFixed(2)}</strong></span>
							{#if roomTaxTotal(spec) > 0}
								<span>Tax: <strong class="text-foreground">${roomTaxTotal(spec).toFixed(2)}</strong></span>
							{/if}
							<span>Room total: <strong class={spec.payOwn ? '' : 'text-foreground'}>${(roomRateTotal(spec) + roomTaxTotal(spec)).toFixed(2)}</strong></span>
							{#if spec.payOwn}
								<span class="font-semibold not-italic text-orange-700">excluded from group bill</span>
							{/if}
						</div>
						</div>
					{/each}
				</div>

				<!-- Grand total -->
				<div class="mt-3 border-t border-border pt-2 flex justify-end">
					<div class="text-sm font-bold">Total charges: {fmtMoney(Math.round(totalCharges * 100))}</div>
				</div>
			</section>

			<!-- ── Deposit (new group only) ──────────────────────────────────── -->
			{#if !groupId}
				<section class="rounded-lg border border-border bg-card p-3">
					<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Initial Deposit</h3>
					<p class="mb-2 text-xs text-muted-foreground">Recorded as a payment event against the first room. Visible on each room's card and in the group folio after saving.</p>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="mb-1 block text-xs text-muted-foreground">Amount (optional)</label>
							<div class="relative">
								<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
								<input type="number" step="0.01" min="0" bind:value={depositAmt} placeholder="0.00"
									class="w-full rounded-md border border-input bg-background pl-6 pr-3 py-1.5 text-sm" />
							</div>
						</div>
						<div>
							<label class="mb-1 block text-xs text-muted-foreground">Method</label>
							<select bind:value={depositMethod} class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
								<option value="cash">Cash</option>
								<option value="card">Card</option>
								<option value="etransfer">e-Transfer</option>
								<option value="check">Cheque</option>
								<option value="other">Other</option>
							</select>
						</div>
					</div>
				</section>
			{/if}

		<!-- ── Group Payments (existing groups) ─────────────────────────── -->
		{#if groupId}
			{@const allPayments = roomSpecs.flatMap(s =>
				s.payments.map(p => ({ ...p, roomNumber: s.roomNumber, bookingId: s.bookingId ?? '' }))
			).sort((a, b) => (a.chargedAt ?? '').localeCompare(b.chargedAt ?? ''))}
			<section class="rounded-lg border border-border bg-card p-3">
				<div class="mb-2 flex items-center justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group Payments</h3>
					{#if transferForm}
						<button type="button" onclick={() => { transferForm = null; transferError = ''; }}
							class="text-xs text-muted-foreground hover:text-foreground">✕ Cancel transfer</button>
					{/if}
				</div>

				{#if allPayments.length === 0}
					<p class="text-xs text-muted-foreground italic">No payments recorded yet.</p>
				{:else}
					<div class="space-y-0.5">
						{#each allPayments as p}
							<div class="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/40">
								<span class="w-10 shrink-0 font-medium">Rm {p.roomNumber}</span>
								<span class="text-muted-foreground capitalize">{p.type.replace('_', ' ')}</span>
								<span class="text-muted-foreground">· {p.paymentMethod}</span>
								{#if p.notes}
									<span class="text-muted-foreground truncate flex-1 italic">{p.notes}</span>
								{:else}
									<span class="flex-1"></span>
								{/if}
								<span class={p.type === 'refund' ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
									{p.type === 'refund' ? '+' : '−'}{fmtMoney(p.amount)}
								</span>
								<!-- Only show transfer button for non-refund payments when there are other rooms -->
								{#if p.type !== 'refund' && roomSpecs.length > 1}
									<button type="button"
										onclick={() => {
											const srcSpec = roomSpecs.find(s => s.bookingId === p.bookingId);
											if (srcSpec) openTransfer(p.id, srcSpec, p.amount);
										}}
										class="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
										title="Transfer part or all of this payment to another room">
										Transfer →
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Transfer form (inline) -->
				{#if transferForm}
					<div class="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm">
						<p class="text-xs font-semibold text-blue-800">Transfer from Rm {transferForm.fromRoomNumber}</p>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label class="mb-1 block text-xs text-muted-foreground">Amount ($)</label>
								<div class="relative">
									<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
									<input type="number" step="0.01" min="0.01"
										max={(transferForm.maxCents / 100).toFixed(2)}
										bind:value={transferForm.amount}
										class="w-full rounded border border-input bg-background pl-6 pr-2 py-1.5 text-sm" />
								</div>
								<p class="mt-0.5 text-[10px] text-muted-foreground">Max: {fmtMoney(transferForm.maxCents)}</p>
							</div>
							<div>
								<label class="mb-1 block text-xs text-muted-foreground">To room</label>
								<select bind:value={transferForm.toBooingIdx}
									class="w-full rounded border border-input bg-background px-2 py-1.5 text-sm">
									{#each roomSpecs as spec, idx}
										{#if spec.bookingId && spec.bookingId !== transferForm.fromBookingId}
											<option value={idx}>Rm {spec.roomNumber}</option>
										{/if}
									{/each}
								</select>
							</div>
						</div>
						{#if transferError}
							<p class="text-xs text-red-600">{transferError}</p>
						{/if}
						<div class="flex gap-2">
							<button type="button" onclick={executeTransfer} disabled={transferBusy}
								class="flex-1 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
								{transferBusy ? 'Transferring…' : 'Confirm transfer'}
							</button>
						</div>
						<p class="text-[10px] text-blue-700">A refund will be recorded on Rm {transferForm.fromRoomNumber} and a new deposit on the target room. Both entries are visible on their individual cards.</p>
					</div>
				{/if}
			</section>
		{/if}

		<!-- ── Balance summary ────────────────────────────────────────────── -->
		<div class="rounded-lg border border-border bg-card p-3 space-y-1 text-sm">
			<div class="flex justify-between text-muted-foreground">
				<span>Total charges</span>
				<span>{fmtMoney(Math.round(totalCharges * 100))}</span>
			</div>
			{#if !groupId && depositCents > 0}
				<div class="flex justify-between text-green-700">
					<span>Deposit ({depositMethod})</span>
					<span>− {fmtMoney(depositCents)}</span>
				</div>
			{:else if groupId && groupCollectedCents > 0}
				<div class="flex justify-between text-green-700">
					<span>Total collected</span>
					<span>− {fmtMoney(groupCollectedCents)}</span>
				</div>
			{/if}
			<div class={['flex justify-between font-semibold border-t border-border pt-1 mt-1',
				balanceCents > 0 ? 'text-amber-700' : 'text-green-700'
			].join(' ')}>
				<span>{balanceCents > 0 ? 'Balance due' : 'Paid in full'}</span>
				<span>{balanceCents > 0 ? fmtMoney(balanceCents) : '✓'}</span>
			</div>
		</div>

			{#if saveError}
				<p class="text-xs text-destructive">{saveError}</p>
			{/if}

		</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end gap-2 w-full">
			<button type="button" onclick={() => { open = false; }}
				class="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
			<button type="button" onclick={save} disabled={saving || loading}
				class="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
				{saving ? 'Saving…' : groupId ? 'Update Group' : `Book ${roomSpecs.length} Room${roomSpecs.length === 1 ? '' : 's'}`}
			</button>
		</div>
	{/snippet}
</CustomDialog>
