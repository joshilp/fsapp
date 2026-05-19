<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = {
		id: string;
		publicId?: string | null;
		bookingEnabled?: boolean | null;
		bookingDescription?: string | null;
		heroImageUrl?: string | null;
		accentColour?: string | null;
	};
	type RoomType = { id: string; name: string; category: string };

	let { prop, roomTypes }: { prop: Prop; roomTypes: RoomType[] } = $props();
	let saving = $state(false);
</script>

<h2 class="mb-5 text-lg font-semibold">Booking Page</h2>

<form method="POST" action="?/updatePropertyBooking"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') toast.success('Saved');
			else toast.error('Save failed');
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="id" value={prop.id} />
	<div class="max-w-lg space-y-5">
		<div class="flex items-center gap-3">
			<input type="checkbox" id="book-enabled-{prop.id}" name="bookingEnabled" value="1"
				checked={prop.bookingEnabled ?? true}
				class="h-4 w-4 rounded border-border" />
			<Label for="book-enabled-{prop.id}" class="font-normal cursor-pointer">
				Online bookings enabled
			</Label>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="book-desc-{prop.id}">Booking page description</Label>
			<textarea id="book-desc-{prop.id}" name="bookingDescription" rows="3"
				placeholder="A short welcome message shown on your booking page…"
				class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none resize-none"
			>{prop.bookingDescription ?? ''}</textarea>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="book-hero-{prop.id}">Hero image URL</Label>
			<Input id="book-hero-{prop.id}" name="heroImageUrl" type="url"
				placeholder="https://…/banner.jpg" value={prop.heroImageUrl ?? ''} />
			<p class="text-[11px] text-muted-foreground">Background image in the booking page header.</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="book-accent-{prop.id}">Accent colour</Label>
			<div class="flex items-center gap-2">
				<input type="color" id="book-accent-{prop.id}" name="accentColour"
					value={prop.accentColour ?? '#d97706'}
					class="h-10 w-14 rounded border border-border cursor-pointer p-0.5" />
				<Input name="accentColourText" value={prop.accentColour ?? '#d97706'}
					placeholder="#d97706" class="w-28 font-mono text-xs" />
			</div>
			<p class="text-[11px] text-muted-foreground">Used for buttons and highlights on the booking page.</p>
		</div>
	</div>
	<div class="mt-6">
		<Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	</div>
</form>

<!-- Booking URL & IDs (read-only) -->
<div class="mt-8 pt-6 border-t border-border max-w-lg">
	<p class="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reference IDs</p>
	{#if prop.publicId}
		<div class="mb-3 flex flex-col gap-1">
			<Label class="text-xs text-muted-foreground">Booking URL</Label>
			<div class="flex items-center gap-2">
				<code class="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono break-all">/book/{prop.publicId}</code>
				<a href="/book/{prop.publicId}" target="_blank"
					class="text-xs text-primary hover:underline shrink-0">Preview ↗</a>
			</div>
		</div>
	{/if}
	<div class="flex flex-col gap-1 mb-2">
		<Label class="text-xs text-muted-foreground">Property ID <span class="text-[10px]">(for TEST_PROPERTY_ID)</span></Label>
		<code class="rounded bg-muted px-3 py-1.5 text-xs font-mono break-all select-all">{prop.id}</code>
	</div>
	{#each roomTypes as rt}
		<div class="flex flex-col gap-1 mb-2">
			<Label class="text-xs text-muted-foreground">Room type ID — {rt.name} <span class="text-[10px]">(for TEST_ROOM_TYPE_ID)</span></Label>
			<code class="rounded bg-muted px-3 py-1.5 text-xs font-mono break-all select-all">{rt.id}</code>
		</div>
	{/each}
</div>
