<script lang="ts">
	import type { PageData } from './$types';
	import PropertyGeneral from '$lib/components/settings/PropertyGeneral.svelte';
	import PropertyPolicy from '$lib/components/settings/PropertyPolicy.svelte';
	import PropertyBooking from '$lib/components/settings/PropertyBooking.svelte';
	import PropertyTaxes from '$lib/components/settings/PropertyTaxes.svelte';
	import PropertyRooms from '$lib/components/settings/PropertyRooms.svelte';
	import PropertyChannex from '$lib/components/settings/PropertyChannex.svelte';
	import Channels from '$lib/components/settings/Channels.svelte';

	let { data }: { data: PageData } = $props();

	const PROP_SECTIONS = ['general', 'policy', 'booking', 'rooms', 'taxes', 'channex'] as const;
	const GLOBAL_SECTIONS = ['channels', 'email'] as const;
	type Section = typeof PROP_SECTIONS[number] | typeof GLOBAL_SECTIONS[number];

	let selectedPropId = $state(data.propertiesList[0]?.id ?? '');
	let activeSection = $state<Section>('general');

	const prop = $derived(data.propertiesList.find((p) => p.id === selectedPropId) ?? data.propertiesList[0]);
	const propRoomTypes = $derived(data.roomTypesList.filter((rt) => rt.propertyId === selectedPropId));
	const propRooms = $derived(data.roomsList.filter((r) => r.propertyId === selectedPropId));
	const propTaxes = $derived(data.taxPresetsList.filter((t) => t.propertyId === selectedPropId));

	const SECTION_LABELS: Record<Section, string> = {
		general: 'General',
		policy: 'Policy',
		booking: 'Booking',
		rooms: 'Rooms & Types',
		taxes: 'Taxes',
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
			{:else if prop && activeSection === 'policy'}
				<PropertyPolicy {prop} />
			{:else if prop && activeSection === 'booking'}
				<PropertyBooking {prop} roomTypes={propRoomTypes} />
			{:else if prop && activeSection === 'rooms'}
				<PropertyRooms {prop} rooms={propRooms} roomTypes={propRoomTypes} />
			{:else if prop && activeSection === 'taxes'}
				<PropertyTaxes {prop} presets={propTaxes} />
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
						</div>
						<div class="rounded-md border p-4">
							<p class="mb-2 font-medium">When emails are sent</p>
							<ul class="text-muted-foreground list-disc pl-5 space-y-1">
								<li><strong>Booking confirmation</strong> — sent to guest when a booking is created</li>
								<li><strong>Online booking alert</strong> — sent to operator when a guest books online</li>
								<li><strong>Cancellation notice</strong> — sent to guest when a booking is cancelled</li>
							</ul>
						</div>
						<p class="text-muted-foreground text-xs">
							If <code class="bg-muted rounded px-1">RESEND_API_KEY</code> is blank, email is silently
							disabled. Get a free key at
							<a href="https://resend.com" target="_blank" class="underline text-primary">resend.com</a>.
						</p>
					</div>
				</div>
			{/if}
		</div>
	</main>
</div>


