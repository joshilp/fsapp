<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import PropertyGeneral from '$lib/components/settings/PropertyGeneral.svelte';
	import PropertyPolicy from '$lib/components/settings/PropertyPolicy.svelte';
	import PropertyBooking from '$lib/components/settings/PropertyBooking.svelte';
	import PropertyTaxes from '$lib/components/settings/PropertyTaxes.svelte';
	import PropertyAddons from '$lib/components/settings/PropertyAddons.svelte';
	import PropertyRooms from '$lib/components/settings/PropertyRooms.svelte';
	import PropertyRates from '$lib/components/settings/PropertyRates.svelte';
	import PropertyChannex from '$lib/components/settings/PropertyChannex.svelte';
	import PropertyPayments from '$lib/components/settings/PropertyPayments.svelte';
	import Channels from '$lib/components/settings/Channels.svelte';

	let { data }: { data: PageData } = $props();

	const PROP_SECTIONS = ['general', 'policy', 'booking', 'rooms', 'taxes', 'addons', 'rates', 'payments', 'channex'] as const;
	const GLOBAL_SECTIONS = ['channels', 'email'] as const;
	type Section = typeof PROP_SECTIONS[number] | typeof GLOBAL_SECTIONS[number];

	let selectedPropId = $state(data.propertiesList[0]?.id ?? '');
	let activeSection = $state<Section>('general');

	// Add property dialog
	let addingProperty = $state(false);
	let newPropName = $state('');
	let savingNewProp = $state(false);

	const prop = $derived(data.propertiesList.find((p) => p.id === selectedPropId) ?? data.propertiesList[0]);
	const propRoomTypes = $derived(data.roomTypesList.filter((rt) => rt.propertyId === selectedPropId));
	const propRooms = $derived(data.roomsList.filter((r) => r.propertyId === selectedPropId));
	const propTaxes  = $derived(data.taxPresetsList.filter((t) => t.propertyId === selectedPropId));
	const propAddons = $derived(data.addonPresetsList.filter((a) => a.propertyId === selectedPropId));
	const propLosDiscounts = $derived(data.losDiscountsList.filter((l) => l.propertyId === selectedPropId));
	const propPromoCodes   = $derived(data.promoCodesList.filter((c) => c.propertyId === selectedPropId));

	const SECTION_LABELS: Record<Section, string> = {
		general: 'General',
		policy: 'Policy',
		booking: 'Booking',
		rooms: 'Rooms & Types',
		taxes: 'Taxes',
		addons: 'Add-Ons',
		rates: 'Rates & Promos',
		payments: 'Payments',
		channex: 'Channex',
		channels: 'Channels',
		email: 'Email',
	};

	function navClass(section: Section) {
		return [
			'flex w-full items-center rounded-md px-3 py-1.5 text-sm transition-colors text-left',
			activeSection === section
				? 'bg-primary/10 text-primary font-medium'
				: 'text-muted-foreground hover:bg-accent hover:text-foreground',
		].join(' ');
	}
</script>

<svelte:head><title>Settings</title></svelte:head>

<div class="flex flex-1 overflow-hidden">
	<!-- ── Sidebar ──────────────────────────────────────────────────────────── -->
	<aside class="w-52 shrink-0 border-r border-border bg-card overflow-y-auto flex flex-col py-4 px-2 gap-0.5">
		<p class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
			Properties
		</p>
		{#each data.propertiesList as p}
			<button
				class={[
					'flex w-full items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors text-left',
					selectedPropId === p.id
						? 'bg-primary/10 text-primary'
						: 'text-foreground hover:bg-accent',
				].join(' ')}
				onclick={() => { selectedPropId = p.id; }}
			>{p.name}</button>
		{/each}

		<!-- Add property -->
		{#if !addingProperty}
			<button
				onclick={() => { addingProperty = true; newPropName = ''; }}
				class="mt-1 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
			>
				<span class="text-base leading-none">+</span> Add property
			</button>
		{:else}
			<form method="POST" action="?/createProperty"
				use:enhance={() => {
					savingNewProp = true;
					return async ({ result, update }) => {
						savingNewProp = false;
						if (result.type === 'success') {
							addingProperty = false;
							newPropName = '';
							toast.success('Property created');
							await invalidateAll();
							if ('data' in result && result.data?.newPropertyId) {
								selectedPropId = result.data.newPropertyId as string;
							}
						} else {
							toast.error('Failed to create property');
						}
						await update({ reset: false });
					};
				}}
				class="px-2 pt-1 pb-2 space-y-1.5"
			>
				<input
					type="text"
					name="name"
					bind:value={newPropName}
					placeholder="Property name"
					autofocus
					class="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<div class="flex gap-1">
					<button type="submit" disabled={savingNewProp || !newPropName.trim()}
						class="flex-1 rounded bg-primary py-1 text-xs font-medium text-primary-foreground disabled:opacity-40">
						{savingNewProp ? '…' : 'Create'}
					</button>
					<button type="button" onclick={() => { addingProperty = false; }}
						class="flex-1 rounded border border-input py-1 text-xs text-muted-foreground hover:bg-muted">
						Cancel
					</button>
				</div>
			</form>
		{/if}

		<div class="my-2 mx-3 border-t border-border"></div>

		<p class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
			Property
		</p>
		{#each PROP_SECTIONS as s}
			<button class={navClass(s)} onclick={() => { activeSection = s; }}>
				{SECTION_LABELS[s]}
			</button>
		{/each}

		<div class="my-2 mx-3 border-t border-border"></div>

		<p class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
			Global
		</p>
		{#each GLOBAL_SECTIONS as s}
			<button class={navClass(s)} onclick={() => { activeSection = s; }}>
				{SECTION_LABELS[s]}
			</button>
		{/each}
	</aside>

	<!-- ── Content ──────────────────────────────────────────────────────────── -->
	<main class="flex-1 overflow-y-auto">
		<div class="max-w-2xl px-8 py-6">
			{#if prop && activeSection === 'general'}
				<PropertyGeneral {prop} />
				<!-- Danger zone: delete property (only if no bookings) -->
				{#if data.propertiesList.length > 1}
				<div class="mt-10 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
					<p class="text-sm font-semibold text-destructive mb-1">Delete property</p>
					<p class="text-xs text-muted-foreground mb-3">Permanently removes this property and all its settings. Cannot be undone. Properties with bookings cannot be deleted.</p>
					<form method="POST" action="?/deleteProperty"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									toast.success('Property deleted');
									selectedPropId = data.propertiesList.find(p => p.id !== prop?.id)?.id ?? '';
									await invalidateAll();
								} else {
									const msg = (result as { data?: { error?: string } }).data?.error ?? 'Delete failed';
									toast.error(msg);
								}
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={prop.id} />
						<button type="submit"
							onclick={(e) => { if (!confirm(`Delete "${prop.name}"? This cannot be undone.`)) e.preventDefault(); }}
							class="rounded border border-destructive/50 bg-white px-4 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
							Delete "{prop.name}"
						</button>
					</form>
				</div>
				{/if}
			{:else if prop && activeSection === 'policy'}
				<PropertyPolicy {prop} />
			{:else if prop && activeSection === 'booking'}
				<PropertyBooking {prop} roomTypes={propRoomTypes} />
			{:else if prop && activeSection === 'rooms'}
				<PropertyRooms {prop} rooms={propRooms} roomTypes={propRoomTypes} />
			{:else if prop && activeSection === 'taxes'}
				<PropertyTaxes {prop} presets={propTaxes} />
		{:else if prop && activeSection === 'addons'}
			<PropertyAddons {prop} presets={propAddons} />
		{:else if prop && activeSection === 'rates'}
			<PropertyRates {prop} roomTypes={propRoomTypes} losDiscounts={propLosDiscounts} promoCodes={propPromoCodes} />
		{:else if prop && activeSection === 'payments'}
			<PropertyPayments {prop} />
		{:else if prop && activeSection === 'channex'}
				<PropertyChannex {prop} roomTypes={propRoomTypes} />
			{:else if activeSection === 'channels'}
				<Channels channels={data.channelsList} />
			{:else if activeSection === 'email'}
				<div>
					<h2 class="mb-4 text-lg font-semibold">Email Notifications</h2>
					<p class="text-muted-foreground mb-4 text-sm">
						Configure email sending via Resend. Set the following in your
						<code class="bg-muted rounded px-1">.env</code> file:
					</p>
					<div class="space-y-4 text-sm">
						<div class="rounded-md border p-4 space-y-2 font-mono text-xs">
							<div><span class="font-semibold">RESEND_API_KEY</span>=re_xxxxxxxxxxxxxxxxxxxx</div>
							<div>
								<span class="font-semibold">RESEND_FROM_EMAIL</span>=reservations@yourmotel.com
								<span class="text-muted-foreground ml-2">(must be a verified domain in Resend)</span>
							</div>
							<div>
								<span class="font-semibold">RESEND_OPERATOR_EMAIL</span>=owner@yourmotel.com
								<span class="text-muted-foreground ml-2">(optional — new online booking alerts)</span>
							</div>
						</div>						<div class="rounded-md border p-4">
							<p class="mb-2 font-medium">When emails are sent</p>
							<ul class="text-muted-foreground list-disc pl-5 space-y-1">
								<li><strong>Booking confirmation</strong> — sent to guest when a booking is created</li>
								<li><strong>Online booking alert</strong> — sent to operator when a guest books online</li>
								<li><strong>Cancellation notice</strong> — sent to guest when a booking is cancelled</li>
								<li><strong>Pre-arrival</strong> — sent the day before check-in with self check-in link <span class="text-amber-600">(requires cron job — see below)</span></li>
							</ul>
						</div>
						<div class="rounded-md border border-amber-200 bg-amber-50 p-4">
							<p class="mb-2 font-medium text-amber-900">Pre-arrival cron job setup</p>
							<p class="text-xs text-amber-800 mb-2">Pre-arrival emails are triggered by a daily HTTP call to your server. Set this up on your hosting platform (e.g. Render Cron Jobs, Railway Cron, or an external cron service).</p>
							<div class="rounded bg-amber-100 px-3 py-2 font-mono text-xs text-amber-900 space-y-1">
								<div><span class="font-semibold">URL:</span> POST https://yourdomain.com/api/cron/pre-arrival</div>
								<div><span class="font-semibold">Header:</span> Authorization: Bearer &lt;CRON_SECRET&gt;</div>
								<div><span class="font-semibold">Schedule:</span> daily at 08:00 local time</div>
							</div>
							<p class="text-xs text-amber-700 mt-2">Also add <code class="bg-amber-100 rounded px-1">CRON_SECRET=your-secret-here</code> to your .env file.</p>
						</div>
						<p class="text-muted-foreground text-xs">
							If <code class="bg-muted rounded px-1">RESEND_API_KEY</code> is blank, email is silently
							disabled. Get a free key at
							<a href="https://resend.com" target="_blank" class="underline text-primary">resend.com</a>.
						</p>

						<!-- Email template customization (per property) -->
						{#if prop}
						<div class="border-t border-border pt-5 mt-2">
							<p class="font-medium mb-1">Email template — {prop.name}</p>
							<p class="text-muted-foreground text-xs mb-3">Customize the message guests receive. These are added to the standard confirmation and pre-arrival emails.</p>
							<form method="POST" action="?/updateEmailTemplates"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') toast.success('Email template saved');
										else toast.error('Save failed');
										await update({ reset: false });
									};
								}}
								class="space-y-4 max-w-lg"
							>
								<input type="hidden" name="id" value={prop.id} />
								<div>
									<label class="block text-xs font-medium mb-1" for="emailNote">Custom note (shown near top of emails)</label>
									<textarea id="emailNote" name="emailNote" rows="3"
										placeholder="e.g. We're so glad you chose us! Check-in is at the front office — please ring the bell after 9 PM."
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
										value={prop.emailNote ?? ''}></textarea>
								</div>
								<div>
									<label class="block text-xs font-medium mb-1" for="emailSig">Signature / sign-off</label>
									<input id="emailSig" name="emailSignature" type="text"
										placeholder="e.g. The Team at Lakeview Motel · 250-555-0199"
										class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
										value={prop.emailSignature ?? ''} />
								</div>
								<button type="submit" class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
									Save template
								</button>
							</form>
						</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</main>
</div>


