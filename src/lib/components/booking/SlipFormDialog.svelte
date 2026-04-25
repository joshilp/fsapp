<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	type Channel = { id: string; name: string };
	type User = { id: string; name: string };

	type Props = {
		open: boolean;
		propertyId: string;
		propertyName: string;
		roomId: string;
		roomNumber: string;
		roomConfigs?: string[] | null;
		checkIn: string;
		checkOut: string;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		// Optional pre-fill from OTA import
		prefilledGuestName?: string;
		prefilledGuestPhone?: string;
		prefilledChannelId?: string;
		prefilledOtaConfirmation?: string;
		prefilledNotes?: string;
		onSuccess?: () => void;
	};

	let {
		open = $bindable(false),
		propertyId,
		propertyName,
		roomId,
		roomNumber,
		roomConfigs = null,
		checkIn = $bindable(),
		checkOut = $bindable(),
		channels,
		users,
		currentUserId,
		prefilledGuestName = '',
		prefilledGuestPhone = '',
		prefilledChannelId,
		prefilledOtaConfirmation = '',
		prefilledNotes = '',
		onSuccess
	}: Props = $props();

	let selectedRoomConfig = $state(roomConfigs?.[0] ?? '');

	// ─── Form state ───────────────────────────────────────────────────────────

	let guestName = $state(prefilledGuestName);
	let guestPhone = $state(prefilledGuestPhone);
	let selectedChannelId = $state(
		prefilledChannelId
			?? channels.find((c) => c.name === 'Direct')?.id
			?? channels[0]?.id
			?? ''
	);
	let notes = $state(prefilledNotes);
	let otaConfirmationNumber = $state(prefilledOtaConfirmation);
	let depositAmount = $state('');
	let depositMethod = $state('card');
	let showDeposit = $state(false);
	let showCc = $state(false);
	let ccNumber = $state('');
	let ccExpiry = $state('');
	let ccCardName = $state('');
	let clerkMode = $state<'user' | 'other'>('user');
	let clerkUserId = $state(currentUserId);
	let clerkName = $state('');
	let walkIn = $state(false);
	let serverError = $state('');
	let submitting = $state(false);

	// ─── Guest autocomplete ───────────────────────────────────────────────────

	type GuestHit = { id: string; name: string; phone: string | null; email: string | null; street: string | null; city: string | null; provinceState: string | null };
	let suggestions = $state<GuestHit[]>([]);
	let lookupTimer: ReturnType<typeof setTimeout> | null = null;

	async function runLookup(params: string) {
		if (!params) { suggestions = []; return; }
		try {
			const res = await fetch(`/api/guests?${params}`);
			if (res.ok) suggestions = await res.json();
		} catch { suggestions = []; }
	}

	function onPhoneInput() {
		suggestions = [];
		if (lookupTimer) clearTimeout(lookupTimer);
		const digits = guestPhone.replace(/\D/g, '');
		if (digits.length < 3) return;
		lookupTimer = setTimeout(() => runLookup(`phone=${encodeURIComponent(digits)}`), 350);
	}

	function onNameInput() {
		suggestions = [];
		if (lookupTimer) clearTimeout(lookupTimer);
		if (guestName.length < 2) return;
		lookupTimer = setTimeout(() => runLookup(`name=${encodeURIComponent(guestName)}`), 350);
	}

	function applyGuest(hit: GuestHit) {
		guestName = hit.name;
		guestPhone = hit.phone ?? '';
		suggestions = [];
	}

	function closeSuggestions() {
		// Small delay so click on a suggestion registers first
		setTimeout(() => { suggestions = []; }, 150);
	}

	// ─── Reset on open ────────────────────────────────────────────────────────

	$effect(() => {
		if (open) {
			guestName = '';
			guestPhone = '';
			suggestions = [];
			selectedChannelId = channels.find((c) => c.name === 'Direct')?.id ?? channels[0]?.id ?? '';
			notes = '';
			depositAmount = '';
			depositMethod = 'card';
			showDeposit = false;
			showCc = false;
			ccNumber = '';
			ccExpiry = '';
			ccCardName = '';
			clerkMode = 'user';
			clerkUserId = currentUserId;
			clerkName = '';
			walkIn = false;
			serverError = '';
			submitting = false;
		}
	});

	const nights = $derived(() => {
		if (!checkIn || !checkOut) return 0;
		return Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	});

	function advanceDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		return d.toISOString().slice(0, 10);
	}
</script>

<CustomDialog
	bind:open
	title={walkIn ? 'Walk-In Check-In' : 'New Booking'}
	description="{propertyName} — Room {roomNumber}"
	dialogClass="sm:max-w-lg"
>
	{#snippet content()}
		<form
			method="POST"
			action="?/createBooking"
			class="flex flex-col gap-4 p-1"
			use:enhance={() => {
				submitting = true;
				serverError = '';
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') {
						const bookingId = (result.data as { bookingId?: string })?.bookingId;
						if (walkIn && bookingId) {
							open = false;
							await goto(`/booking/${bookingId}/checkin`);
						} else {
							open = false;
							onSuccess?.();
							await update();
						}
					} else if (result.type === 'failure') {
						serverError = (result.data?.error as string) ?? 'Something went wrong';
						await update({ reset: false });
					} else {
						await update();
					}
				};
			}}
		>
			<!-- Hidden fields -->
			<input type="hidden" name="propertyId" value={propertyId} />
			<input type="hidden" name="roomId" value={roomId} />
			{#if selectedRoomConfig}
				<input type="hidden" name="roomConfig" value={selectedRoomConfig} />
			{/if}

			<!-- Room config picker (only shown for dual-config rooms) -->
			{#if roomConfigs && roomConfigs.length > 1}
				<div class="flex flex-col gap-1.5">
					<Label for="roomConfigSelect">Room Configuration</Label>
					<select
						id="roomConfigSelect"
						bind:value={selectedRoomConfig}
						class="border-input bg-background rounded-md border px-3 py-2 text-sm"
					>
						{#each roomConfigs as cfg}
							<option value={cfg}>{cfg}</option>
						{/each}
					</select>
				</div>
			{/if}

			{#if serverError}
				<div class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
					{serverError}
				</div>
			{/if}

			<!-- Walk-in toggle -->
			<!-- svelte-ignore a11y_label_has_associated_control -->
			<label class="flex cursor-pointer items-center gap-2.5">
				<div
					role="checkbox"
					aria-checked={walkIn}
					tabindex="0"
					class={[
						'relative h-5 w-9 rounded-full transition-colors',
						walkIn ? 'bg-primary' : 'bg-muted-foreground/30'
					].join(' ')}
					onclick={() => (walkIn = !walkIn)}
					onkeydown={(e) => e.key === ' ' && (walkIn = !walkIn)}
				>
					<span
						class={[
							'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
							walkIn ? 'translate-x-4' : 'translate-x-0.5'
						].join(' ')}
					></span>
				</div>
				<span class="text-sm font-medium">Walk-in</span>
				<span class="text-muted-foreground text-xs">(skip straight to check-in form)</span>
			</label>

			<!-- Dates -->
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="checkIn">Check-in</Label>
					<Input
						id="checkIn"
						name="checkIn"
						type="date"
						bind:value={checkIn}
						oninput={() => { if (checkOut <= checkIn) checkOut = advanceDay(checkIn); }}
						required
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="checkOut">
						Check-out
						{#if nights() > 0}
							<span class="text-muted-foreground ml-1 font-normal">({nights()} night{nights() === 1 ? '' : 's'})</span>
						{/if}
					</Label>
					<Input id="checkOut" name="checkOut" type="date" bind:value={checkOut} required />
				</div>
			</div>

			<!-- Guest — name + phone with shared floating autocomplete -->
			<div class="relative">
				<div class="grid grid-cols-2 gap-3">
					<div class="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
						<Label for="guestName">Guest name <span class="text-destructive">*</span></Label>
						<Input
							id="guestName"
							name="guestName"
							bind:value={guestName}
							placeholder="Full name"
							required
							autocomplete="off"
							oninput={onNameInput}
							onblur={closeSuggestions}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<Label for="guestPhone">Phone</Label>
						<Input
							id="guestPhone"
							name="guestPhone"
							type="tel"
							bind:value={guestPhone}
							placeholder="555-000-0000"
							autocomplete="off"
							oninput={onPhoneInput}
							onblur={closeSuggestions}
						/>
					</div>
				</div>

				<!-- Floating autocomplete dropdown — does NOT affect form height -->
				{#if suggestions.length > 0}
					<div
						class="border-border bg-background absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-lg"
						role="listbox"
					>
						{#each suggestions as hit}
							<button
								type="button"
								class="hover:bg-muted flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
								onmousedown={() => applyGuest(hit)}
							>
								<span class="flex-1 font-medium">{hit.name}</span>
								{#if hit.phone}
									<span class="text-muted-foreground shrink-0 font-mono text-xs">{hit.phone}</span>
								{/if}
								{#if hit.city}
									<span class="text-muted-foreground shrink-0 text-xs">{hit.city}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Channel -->
			<div class="flex flex-col gap-1.5">
				<Label>Channel</Label>
				<div class="flex flex-wrap gap-1.5">
					{#each channels as ch}
						<button
							type="button"
							class={[
								'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
								selectedChannelId === ch.id
									? 'bg-primary text-primary-foreground border-primary'
									: 'border-border hover:bg-muted'
							].join(' ')}
							onclick={() => (selectedChannelId = ch.id)}
						>
							{ch.name}
						</button>
					{/each}
				</div>
				<input type="hidden" name="channelId" value={selectedChannelId} />
			</div>

			<!-- OTA confirmation # (shown when non-Direct channel) -->
			{#if channels.find((c) => c.id === selectedChannelId)?.name !== 'Direct'}
				<div class="flex flex-col gap-1.5">
					<Label for="otaConf">OTA Confirmation #</Label>
					<input id="otaConf" name="otaConfirmationNumber" type="text"
						bind:value={otaConfirmationNumber}
						placeholder="e.g. BDC-12345678"
						class="border-input bg-background rounded-md border px-3 py-2 text-sm shadow-sm" />
				</div>
			{/if}

			<!-- Notes -->
			<div class="flex flex-col gap-1.5">
				<Label for="notes">Notes</Label>
				<textarea
					id="notes"
					name="notes"
					bind:value={notes}
					rows="2"
					placeholder="Special requests, etc."
					class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
				></textarea>
			</div>

			<!-- Deposit (toggle, hidden for walk-in since it's done at check-in) -->
			{#if !walkIn}
				<div class="flex flex-col gap-2">
					<button
						type="button"
						class="text-primary flex items-center gap-1 text-sm font-medium"
						onclick={() => (showDeposit = !showDeposit)}
					>
						<span class="text-base leading-none">{showDeposit ? '▾' : '▸'}</span>
						Deposit
					</button>
					{#if showDeposit}
						<div class="flex gap-3">
							<div class="flex flex-col gap-1.5">
								<Label for="depositAmount">Amount ($)</Label>
								<Input
									id="depositAmount"
									name="depositAmount"
									type="number"
									min="0"
									step="0.01"
									bind:value={depositAmount}
									placeholder="0.00"
									class="w-28"
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label>Method</Label>
								<div class="flex gap-1.5">
									{#each ['card', 'cash', 'cheque'] as method}
										<button
											type="button"
											class={[
												'rounded-md border px-2.5 py-1.5 text-sm capitalize transition-colors',
												depositMethod === method
													? 'bg-primary text-primary-foreground border-primary'
													: 'border-border hover:bg-muted'
											].join(' ')}
											onclick={() => (depositMethod = method)}
										>{method}</button>
									{/each}
								</div>
								<input type="hidden" name="depositMethod" value={depositMethod} />
							</div>
						</div>
					{/if}
				</div>

				<!-- CC (toggle) -->
				<div class="flex flex-col gap-2">
					<button
						type="button"
						class="text-primary flex items-center gap-1 text-sm font-medium"
						onclick={() => (showCc = !showCc)}
					>
						<span class="text-base leading-none">{showCc ? '▾' : '▸'}</span>
						Credit card
						<span class="text-muted-foreground font-normal">(stored encrypted, cleared after charge)</span>
					</button>
					{#if showCc}
						<div class="grid grid-cols-2 gap-3">
							<div class="col-span-2 flex flex-col gap-1.5">
								<Label for="ccNumber">Card number</Label>
								<Input
									id="ccNumber"
									name="ccNumber"
									inputmode="numeric"
									bind:value={ccNumber}
									placeholder="•••• •••• •••• ••••"
									autocomplete="off"
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="ccExpiry">Expiry (MM/YY)</Label>
								<Input id="ccExpiry" name="ccExpiry" bind:value={ccExpiry} placeholder="MM/YY" class="w-24" />
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="ccCardName">Name on card</Label>
								<Input id="ccCardName" name="ccCardName" bind:value={ccCardName} autocomplete="off" />
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Clerk -->
			<div class="flex flex-col gap-1.5">
				<Label for="clerkSelect">Clerk</Label>
				<div class="flex items-center gap-2">
					<select
						id="clerkSelect"
						class="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-1.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
						onchange={(e) => {
							const val = (e.target as HTMLSelectElement).value;
							if (val === '__other__') {
								clerkMode = 'other';
								clerkUserId = '';
							} else {
								clerkMode = 'user';
								clerkUserId = val;
							}
						}}
					>
						{#each users as u}
							<option value={u.id} selected={u.id === currentUserId}>{u.name}</option>
						{/each}
						<option value="__other__">Other (type name)…</option>
					</select>
					{#if clerkMode === 'other'}
						<Input name="clerkName" bind:value={clerkName} placeholder="Clerk name" class="w-36" />
					{:else}
						<input type="hidden" name="clerkUserId" value={clerkUserId} />
					{/if}
				</div>
			</div>

			<!-- Submit -->
			<div class="mt-1 flex justify-end gap-2">
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={submitting}>
					{#if submitting}
						Saving…
					{:else if walkIn}
						Walk In → Check In
					{:else}
						Create Booking
					{/if}
				</Button>
			</div>
		</form>
	{/snippet}
</CustomDialog>
