<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string };
	type AddonPreset = { id: string; name: string; defaultUnitCents: number | null; isTaxable: boolean };

	let { prop, presets }: { prop: Prop; presets: AddonPreset[] } = $props();

	let newName     = $state('');
	let newUnit     = $state('');
	let newTaxable  = $state(true);
	let saving      = $state(false);
	let deleting    = $state<string | null>(null);

	function fmtDollars(cents: number | null) {
		if (cents === null) return '—';
		return '$' + (cents / 100).toFixed(2);
	}
</script>

<h2 class="mb-1 text-lg font-semibold">Add-Ons</h2>
<p class="mb-5 text-sm text-muted-foreground">
	Pre-configured charges (pet fees, parking, etc.) available in the booking folio.
	Quantity and unit price are editable at booking time.
</p>

{#if presets.length > 0}
	<div class="mb-5 max-w-lg space-y-2">
		<div class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
			<span>Name</span>
			<span class="text-right w-20">Default price</span>
			<span class="text-center w-16">Taxable</span>
			<span class="w-16"></span>
		</div>
		{#each presets as preset}
			<div class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 rounded-md border px-3 py-2 text-sm">
				<span class="font-medium">{preset.name}</span>
				<span class="w-20 text-right tabular-nums text-muted-foreground">{fmtDollars(preset.defaultUnitCents)}</span>
				<span class="w-16 text-center">
					{#if preset.isTaxable}
						<span class="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">Taxable</span>
					{:else}
						<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">No tax</span>
					{/if}
				</span>
				<form method="POST" action="?/deleteAddonPreset"
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
						class="h-7 w-16 px-2 text-xs text-destructive"
						disabled={deleting === preset.id}>
						{deleting === preset.id ? '…' : 'Remove'}
					</Button>
				</form>
			</div>
		{/each}
	</div>
{:else}
	<p class="mb-5 text-sm text-muted-foreground italic">No add-ons configured yet.</p>
{/if}

<form method="POST" action="?/upsertAddonPreset"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Add-on saved');
				newName = ''; newUnit = ''; newTaxable = true;
			} else toast.error('Save failed');
			await update();
		};
	}}
	class="max-w-lg rounded-md border border-border bg-muted/30 p-4"
>
	<input type="hidden" name="propertyId" value={prop.id} />
	<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New add-on</p>
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Name</Label>
			<Input name="name" placeholder="e.g. Pet fee" bind:value={newName}
				class="h-8 w-40" required />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Default price (optional)</Label>
			<div class="relative w-28">
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
				<Input name="defaultUnitCents" type="number" step="0.01" min="0"
					placeholder="25.00" bind:value={newUnit}
					class="h-8 pl-6" />
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Taxable?</Label>
			<div class="flex h-8 items-center gap-2">
				<label class="flex cursor-pointer items-center gap-1.5 text-sm">
					<input type="radio" name="isTaxable" value="1"
						checked={newTaxable}
						onchange={() => newTaxable = true} />
					Yes
				</label>
				<label class="flex cursor-pointer items-center gap-1.5 text-sm">
					<input type="radio" name="isTaxable" value="0"
						checked={!newTaxable}
						onchange={() => newTaxable = false} />
					No
				</label>
			</div>
		</div>
		<Button type="submit" size="sm" class="h-8" disabled={saving}>
			{saving ? '…' : '+ Add'}
		</Button>
	</div>
	<p class="mt-2 text-[11px] text-muted-foreground">
		Leave price blank to prompt the operator to enter it at booking time.
		Taxable add-ons are included in the subtotal before taxes are applied.
	</p>
</form>
