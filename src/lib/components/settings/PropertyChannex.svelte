<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string; channexPropertyId?: string | null };
	type RoomType = {
		id: string; name: string; category: string;
		channexRoomTypeId?: string | null; channexRatePlanId?: string | null;
	};

	let { prop, roomTypes }: { prop: Prop; roomTypes: RoomType[] } = $props();
	let savingProp = $state(false);
	let syncing = $state(false);

	async function syncNow() {
		syncing = true;
		try {
			const res = await fetch('/api/ari/sync-all', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ propertyId: prop.id })
			});
			const data = await res.json();
			if (data.ok) {
				toast.success(`Sync complete — ${data.synced} room type(s) pushed, ${data.skipped} skipped (no Channex ID), ${data.errors} error(s)`);
			} else {
				toast.error(data.error ?? 'Sync failed');
			}
		} catch {
			toast.error('Sync request failed');
		} finally {
			syncing = false;
		}
	}
</script>

<h2 class="mb-2 text-lg font-semibold">Channex</h2>
<p class="mb-5 text-sm text-muted-foreground">
	Channex distributes your availability and rates to Booking.com, Expedia, Airbnb, and more.
	<a href="https://channex.io" target="_blank" rel="noopener" class="text-primary underline">channex.io ↗</a>
</p>

<div class="mb-6 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 max-w-xl">
	<strong>Setup:</strong>
	<ol class="list-decimal pl-5 mt-1 space-y-1 text-xs">
		<li>Create properties in Channex matching your properties here</li>
		<li>Create room types and one rate plan ("Standard") per room type in Channex</li>
		<li>Paste the UUIDs below (find them in the Channex dashboard URL or API)</li>
		<li>Add <code class="bg-amber-100 rounded px-1">CHANNEX_API_KEY</code> to your <code class="bg-amber-100 rounded px-1">.env</code></li>
		<li>Register webhook: <code class="bg-amber-100 rounded px-1 break-all">https://yourdomain.com/api/channex/webhook</code></li>
	</ol>
</div>

<!-- Property Channex ID -->
<form method="POST" action="?/updateChannexProperty"
	use:enhance={() => {
		savingProp = true;
		return async ({ result, update }) => {
			savingProp = false;
			if (result.type === 'success') toast.success('Channex ID saved');
			else toast.error('Save failed');
			await update({ reset: false });
		};
	}}
	class="mb-6 max-w-md"
>
	<input type="hidden" name="id" value={prop.id} />
	<div class="flex flex-col gap-1.5 mb-3">
		<Label for="cx-prop-{prop.id}">Channex Property ID</Label>
		<Input id="cx-prop-{prop.id}" name="channexPropertyId"
			placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			value={prop.channexPropertyId ?? ''}
			class="font-mono text-xs" />
	</div>
	<Button type="submit" size="sm" disabled={savingProp}>
		{savingProp ? 'Saving…' : 'Save'}
	</Button>
</form>

<!-- Room type Channex IDs -->
{#if roomTypes.length > 0}
	<div class="border-t border-border pt-5">
		<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room Type IDs</p>
		<div class="max-w-xl space-y-3">
			{#each roomTypes as rt}
				<form method="POST" action="?/updateRoomTypeChannex"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') toast.success(`${rt.name} saved`);
							else toast.error('Save failed');
							await update({ reset: false });
						};
					}}
					class="flex items-end gap-2 flex-wrap"
				>
					<input type="hidden" name="id" value={rt.id} />
					<div class="flex flex-col gap-1 flex-1 min-w-0">
						<span class="text-xs text-muted-foreground">{rt.category}: {rt.name} — Room Type ID</span>
						<Input name="channexRoomTypeId"
							placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
							value={rt.channexRoomTypeId ?? ''}
							class="font-mono text-xs h-8" />
					</div>
					<div class="flex flex-col gap-1 flex-1 min-w-0">
						<span class="text-xs text-muted-foreground">Rate Plan ID</span>
						<Input name="channexRatePlanId"
							placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
							value={rt.channexRatePlanId ?? ''}
							class="font-mono text-xs h-8" />
					</div>
					<Button type="submit" size="sm" class="h-8 shrink-0">Save</Button>
				</form>
			{/each}
		</div>
	</div>
{/if}

<!-- Bulk sync -->
<div class="border-t border-border pt-5 mt-5">
	<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Force re-sync</p>
	<p class="mb-3 text-xs text-muted-foreground max-w-md">
		Pushes today + 365 days of availability, rates, and restrictions to Channex for all configured room types.
		Use after initial setup or if you suspect Channex is out of date.
	</p>
	<Button variant="outline" size="sm" onclick={syncNow} disabled={syncing}>
		{syncing ? 'Syncing…' : 'Sync now →'}
	</Button>
</div>
