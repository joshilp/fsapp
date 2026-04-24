<script lang="ts">
	import { enhance } from '$app/forms';
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
		checkIn: string;
		checkOut: string;
		channels: Channel[];
		users: User[];
		currentUserId: string;
		onSuccess?: () => void;
	};

	let {
		open = $bindable(false),
		propertyId,
		propertyName,
		roomId,
		roomNumber,
		checkIn = $bindable(),
		checkOut = $bindable(),
		channels,
		users,
		currentUserId,
		onSuccess
	}: Props = $props();

	// Form state
	let guestName = $state('');
	let guestPhone = $state('');
	let selectedChannelId = $state(channels.find((c) => c.name === 'Direct')?.id ?? channels[0]?.id ?? '');
	let notes = $state('');
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
	let serverError = $state('');
	let submitting = $state(false);

	// Reset form when dialog opens
	$effect(() => {
		if (open) {
			guestName = '';
			guestPhone = '';
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
			serverError = '';
			submitting = false;
		}
	});

	const nights = $derived(() => {
		if (!checkIn || !checkOut) return 0;
		const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
		return Math.round(ms / 86400000);
	});
</script>

<CustomDialog
	bind:open
	title="New Booking"
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
						open = false;
						onSuccess?.();
						await update();
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

			{#if serverError}
				<div class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
					{serverError}
				</div>
			{/if}

			<!-- Dates -->
			<div class="grid grid-cols-2 gap-3">
				<div class="flex flex-col gap-1.5">
					<Label for="checkIn">Check-in</Label>
					<Input id="checkIn" name="checkIn" type="date" bind:value={checkIn} required />
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

			<!-- Guest -->
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
					/>
				</div>
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

			<!-- Notes -->
			<div class="flex flex-col gap-1.5">
				<Label for="notes">Notes</Label>
				<textarea
					id="notes"
					name="notes"
					bind:value={notes}
					rows="2"
					placeholder="Special requests, OTA confirmation #, etc."
					class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
				></textarea>
			</div>

			<!-- Deposit (toggle) -->
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
									>
										{method}
									</button>
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

			<!-- Clerk -->
			<div class="flex flex-col gap-1.5">
				<Label>Clerk</Label>
				<div class="flex items-center gap-2">
					<select
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
					{submitting ? 'Saving…' : 'Create Booking'}
				</Button>
			</div>
		</form>
	{/snippet}
</CustomDialog>
