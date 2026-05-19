<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Channel = { id: string; name: string; isOta: boolean; sortOrder: number; isActive: boolean };

	let { channels }: { channels: Channel[] } = $props();

	let newName = $state('');
	let newIsOta = $state(false);
	let newSortOrder = $state('10');
	let adding = $state(false);
</script>

<h2 class="mb-5 text-lg font-semibold">Booking Channels</h2>

{#if channels.length > 0}
	<div class="mb-5 max-w-sm space-y-2">
		{#each channels as ch}
			<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
				<span class="flex-1 font-medium">{ch.name}</span>
				{#if ch.isOta}
					<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 uppercase">OTA</span>
				{/if}
				<span class="text-muted-foreground text-xs">#{ch.sortOrder}</span>
				<span class={ch.isActive ? 'text-green-600 text-xs' : 'text-muted-foreground text-xs'}>
					{ch.isActive ? 'Active' : 'Inactive'}
				</span>
			</div>
		{/each}
	</div>
{:else}
	<p class="text-muted-foreground mb-5 text-sm">No channels yet.</p>
{/if}

<form method="POST" action="?/upsertChannel"
	use:enhance={() => {
		adding = true;
		return async ({ result, update }) => {
			adding = false;
			if (result.type === 'success') {
				toast.success('Channel added');
				newName = '';
				newIsOta = false;
				newSortOrder = '10';
			} else toast.error('Save failed');
			await update();
		};
	}}
	class="flex items-end gap-3 flex-wrap"
>
	<div class="flex flex-col gap-1">
		<Label class="text-xs">Name</Label>
		<Input name="name" placeholder="e.g. VRBO" bind:value={newName} class="h-8 w-32" required />
	</div>
	<div class="flex flex-col gap-1">
		<Label class="text-xs">Sort order</Label>
		<Input name="sortOrder" type="number" bind:value={newSortOrder} class="h-8 w-16" />
	</div>
	<div class="flex items-center gap-1.5 pb-0.5">
		<input type="checkbox" id="new-ch-ota" name="isOta"
			bind:checked={newIsOta} value="true" class="h-4 w-4" />
		<Label for="new-ch-ota" class="text-sm cursor-pointer font-normal">OTA</Label>
		<input type="hidden" name="isOta" value={String(newIsOta)} />
	</div>
	<Button type="submit" size="sm" class="h-8" disabled={adding}>
		{adding ? '…' : '+ Add channel'}
	</Button>
</form>
