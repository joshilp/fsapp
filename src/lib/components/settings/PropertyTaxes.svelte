<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string };
	type TaxPreset = { id: string; label: string; ratePercent: number };

	let { prop, presets }: { prop: Prop; presets: TaxPreset[] } = $props();

	let newLabel = $state('');
	let newRate = $state('');
	let saving = $state(false);
	let deleting = $state<string | null>(null);
</script>

<h2 class="mb-5 text-lg font-semibold">Taxes</h2>

{#if presets.length > 0}
	<div class="mb-5 max-w-sm space-y-2">
		{#each presets as preset}
			<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
				<span class="flex-1 font-medium">{preset.label}</span>
				<span class="tabular-nums text-muted-foreground">{preset.ratePercent}%</span>
				<form method="POST" action="?/deleteTaxPreset"
					use:enhance={() => {
						deleting = preset.id;
						return async ({ result, update }) => {
							deleting = null;
							if (result.type === 'success') toast.success('Removed');
							else toast.error('Remove failed');
							await update();
						};
					}}
				>
					<input type="hidden" name="id" value={preset.id} />
					<Button type="submit" variant="ghost" size="sm"
						class="text-destructive h-7 px-2 text-xs"
						disabled={deleting === preset.id}>
						{deleting === preset.id ? '…' : 'Remove'}
					</Button>
				</form>
			</div>
		{/each}
	</div>
{:else}
	<p class="text-muted-foreground mb-5 text-sm">No tax presets yet.</p>
{/if}

<form method="POST" action="?/upsertTaxPreset"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Tax preset added');
				newLabel = '';
				newRate = '';
			} else toast.error('Save failed');
			await update();
		};
	}}
	class="flex items-end gap-3"
>
	<input type="hidden" name="propertyId" value={prop.id} />
	<div class="flex flex-col gap-1">
		<Label class="text-xs">Label</Label>
		<Input name="label" placeholder="GST" bind:value={newLabel} class="h-8 w-28" required />
	</div>
	<div class="flex flex-col gap-1">
		<Label class="text-xs">Rate %</Label>
		<Input name="ratePercent" type="number" step="0.001" min="0"
			placeholder="5.0" bind:value={newRate} class="h-8 w-24" required />
	</div>
	<Button type="submit" size="sm" class="h-8" disabled={saving}>
		{saving ? '…' : '+ Add'}
	</Button>
</form>
