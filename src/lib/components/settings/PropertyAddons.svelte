<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string };
	type TaxPreset = { id: string; label: string };
	type AddonPreset = {
		id: string; name: string; defaultUnitCents: number | null;
		isTaxable: boolean; taxPresetIds: string | null; postingFactor: string;
	};

	let { prop, presets, taxPresets = [] }: {
		prop: Prop;
		presets: AddonPreset[];
		taxPresets?: TaxPreset[];
	} = $props();

	const POSTING_OPTS = [
		{ value: 'per_stay',           label: 'Per stay' },
		{ value: 'per_night',          label: 'Per night' },
		{ value: 'per_adult',          label: 'Per adult' },
		{ value: 'per_adult_per_night',label: 'Per adult / night' },
	];

	function parseTaxIds(raw: string | null): string[] {
		if (!raw) return [];
		try { return JSON.parse(raw); } catch { return []; }
	}

	let newName     = $state('');
	let newUnit     = $state('');
	let newTaxable  = $state(true);
	let newPosting  = $state('per_stay');
	let newTaxIds   = $state<string[]>([]);
	let saving      = $state(false);
	let deleting    = $state<string | null>(null);

	// Inline editing state
	let editingId     = $state<string | null>(null);
	let editName      = $state('');
	let editUnit      = $state('');
	let editTaxable   = $state(true);
	let editPosting   = $state('per_stay');
	let editTaxIds    = $state<string[]>([]);
	let editSaving    = $state(false);

	function startEdit(preset: AddonPreset) {
		editingId   = preset.id;
		editName    = preset.name;
		editUnit    = preset.defaultUnitCents !== null ? (preset.defaultUnitCents / 100).toFixed(2) : '';
		editTaxable = preset.isTaxable;
		editPosting = preset.postingFactor ?? 'per_stay';
		editTaxIds  = parseTaxIds(preset.taxPresetIds);
	}

	function cancelEdit() { editingId = null; }

	function fmtDollars(cents: number | null) {
		if (cents === null) return '—';
		return '$' + (cents / 100).toFixed(2);
	}

	function toggleTaxId(arr: string[], id: string): string[] {
		return arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
	}
</script>

<h2 class="mb-1 text-lg font-semibold">Add-Ons</h2>
<p class="mb-5 text-sm text-muted-foreground">
	Pre-configured charges (pet fees, parking, etc.) available in the booking folio.
	Quantity and unit price are editable at booking time. Set which taxes apply to each add-on
	and how the charge accumulates (per stay, per night, per adult, etc.).
</p>

{#if presets.length > 0}
	<div class="mb-5 max-w-2xl space-y-2">
		<div class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
			<span>Name</span>
			<span class="w-24 text-right">Default price</span>
			<span class="w-28 text-center">Posting</span>
			<span class="w-32 text-center">Taxes</span>
			<span class="w-24"></span>
		</div>
		{#each presets as preset}
			{#if editingId === preset.id}
				<!-- Inline edit form -->
				<form method="POST" action="?/upsertAddonPreset"
					use:enhance={() => {
						editSaving = true;
						return async ({ result, update }) => {
							editSaving = false;
							if (result.type === 'success') { toast.success('Saved'); editingId = null; }
							else toast.error('Save failed');
							await update();
						};
					}}
					class="rounded-md border border-primary/40 bg-muted/30 px-3 py-3 space-y-2"
				>
					<input type="hidden" name="id"         value={preset.id} />
					<input type="hidden" name="propertyId" value={prop.id} />
					<div class="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
						<div>
							<Label class="mb-1 block text-[10px]">Name</Label>
							<Input name="name" bind:value={editName} class="h-7 text-xs" required />
						</div>
						<div>
							<Label class="mb-1 block text-[10px]">Default price</Label>
							<div class="relative w-24">
								<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
								<Input name="defaultUnitCents" type="number" step="0.01" min="0"
									bind:value={editUnit} placeholder="—" class="h-7 pl-6 text-xs w-24" />
							</div>
						</div>
						<div>
							<Label class="mb-1 block text-[10px]">Posting</Label>
							<select name="postingFactor" bind:value={editPosting}
								class="h-7 w-36 rounded-md border border-input bg-background px-2 text-xs">
								{#each POSTING_OPTS as o}<option value={o.value}>{o.label}</option>{/each}
							</select>
						</div>
					</div>
					<!-- Tax checkboxes -->
					{#if taxPresets.length}
						<div>
							<Label class="mb-1.5 block text-[10px]">Which taxes apply?</Label>
							<div class="flex flex-wrap gap-2">
								{#each taxPresets as tp}
									<label class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs
										{editTaxIds.includes(tp.id) ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-muted border-border text-muted-foreground'}">
										<input type="checkbox" name="taxPresetIds[]" value={tp.id}
											checked={editTaxIds.includes(tp.id)}
											onchange={() => editTaxIds = toggleTaxId(editTaxIds, tp.id)}
											class="sr-only" />
										{tp.label}
									</label>
								{/each}
								{#if editTaxIds.length === 0}
									<span class="text-[10px] text-muted-foreground italic">No taxes (non-taxable)</span>
								{/if}
							</div>
						</div>
					{:else}
						<!-- Fallback simple taxable radio -->
						<div class="flex items-center gap-3">
							<Label class="text-[10px]">Taxable?</Label>
							<label class="flex cursor-pointer items-center gap-1 text-xs">
								<input type="radio" name="isTaxable" value="1" checked={editTaxable} onchange={() => editTaxable = true} /> Yes
							</label>
							<label class="flex cursor-pointer items-center gap-1 text-xs">
								<input type="radio" name="isTaxable" value="0" checked={!editTaxable} onchange={() => editTaxable = false} /> No
							</label>
						</div>
					{/if}
					<!-- isTaxable derived from whether any tax IDs are selected -->
					<input type="hidden" name="isTaxable" value={editTaxIds.length > 0 ? '1' : '0'} />
					<div class="flex gap-2">
						<Button type="submit" size="sm" class="h-7 text-xs" disabled={editSaving}>
							{editSaving ? '…' : 'Save'}
						</Button>
						<Button type="button" variant="ghost" size="sm" class="h-7 px-2 text-xs" onclick={cancelEdit}>Cancel</Button>
					</div>
				</form>
			{:else}
				<!-- Display row -->
				<div class="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 rounded-md border px-3 py-2 text-sm">
					<span class="font-medium">{preset.name}</span>
					<span class="w-24 text-right tabular-nums text-muted-foreground">{fmtDollars(preset.defaultUnitCents)}</span>
					<span class="w-28 text-center">
						<span class="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
							{POSTING_OPTS.find(o => o.value === (preset.postingFactor ?? 'per_stay'))?.label ?? 'Per stay'}
						</span>
					</span>
					<span class="w-32 text-center flex flex-wrap justify-center gap-0.5">
						{#if parseTaxIds(preset.taxPresetIds).length > 0}
							{#each parseTaxIds(preset.taxPresetIds) as tid}
								{@const tp = taxPresets.find(t => t.id === tid)}
								{#if tp}
									<span class="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-800">{tp.label}</span>
								{/if}
							{/each}
						{:else if preset.isTaxable}
							<span class="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">All taxes</span>
						{:else}
							<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">No tax</span>
						{/if}
					</span>
					<div class="flex w-24 gap-1">
						<Button type="button" variant="ghost" size="sm" class="h-7 flex-1 px-2 text-xs"
							onclick={() => startEdit(preset)}>Edit</Button>
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
								class="h-7 px-2 text-xs text-destructive"
								disabled={deleting === preset.id}>
								{deleting === preset.id ? '…' : '✕'}
							</Button>
						</form>
					</div>
				</div>
			{/if}
		{/each}
	</div>
{:else}
	<p class="mb-5 text-sm text-muted-foreground italic">No add-ons configured yet.</p>
{/if}

<!-- New add-on form -->
<form method="POST" action="?/upsertAddonPreset"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				toast.success('Add-on saved');
				newName = ''; newUnit = ''; newTaxable = true; newPosting = 'per_stay'; newTaxIds = [];
			} else toast.error('Save failed');
			await update();
		};
	}}
	class="max-w-2xl rounded-md border border-border bg-muted/30 p-4 space-y-3"
>
	<input type="hidden" name="propertyId" value={prop.id} />
	<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">New add-on</p>
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Name</Label>
			<Input name="name" placeholder="e.g. Pet fee" bind:value={newName} class="h-8 w-40" required />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Default price (optional)</Label>
			<div class="relative w-28">
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
				<Input name="defaultUnitCents" type="number" step="0.01" min="0"
					placeholder="25.00" bind:value={newUnit} class="h-8 pl-6" />
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Posting</Label>
			<select name="postingFactor" bind:value={newPosting}
				class="h-8 w-40 rounded-md border border-input bg-background px-2 text-sm">
				{#each POSTING_OPTS as o}<option value={o.value}>{o.label}</option>{/each}
			</select>
		</div>
	</div>
	{#if taxPresets.length}
		<div>
			<Label class="mb-1.5 block text-xs">Which taxes apply?</Label>
			<div class="flex flex-wrap gap-2">
				{#each taxPresets as tp}
					<label class="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs
						{newTaxIds.includes(tp.id) ? 'bg-teal-100 border-teal-400 text-teal-800' : 'bg-muted border-border text-muted-foreground'}">
						<input type="checkbox" name="taxPresetIds[]" value={tp.id}
							checked={newTaxIds.includes(tp.id)}
							onchange={() => newTaxIds = toggleTaxId(newTaxIds, tp.id)}
							class="sr-only" />
						{tp.label}
					</label>
				{/each}
				{#if newTaxIds.length === 0}
					<span class="text-xs text-muted-foreground italic">None — non-taxable</span>
				{/if}
			</div>
		</div>
	{:else}
		<div class="flex items-center gap-3">
			<Label class="text-xs">Taxable?</Label>
			<label class="flex cursor-pointer items-center gap-1.5 text-sm">
				<input type="radio" name="isTaxable" value="1" checked={newTaxable} onchange={() => newTaxable = true} /> Yes
			</label>
			<label class="flex cursor-pointer items-center gap-1.5 text-sm">
				<input type="radio" name="isTaxable" value="0" checked={!newTaxable} onchange={() => newTaxable = false} /> No
			</label>
		</div>
	{/if}
	<input type="hidden" name="isTaxable" value={newTaxIds.length > 0 ? '1' : '0'} />
	<Button type="submit" size="sm" class="h-8" disabled={saving}>
		{saving ? '…' : '+ Add'}
	</Button>
	<p class="text-[11px] text-muted-foreground">
		Taxes: select which tax presets apply to this add-on specifically, or leave blank for non-taxable.
		Posting factor controls how the charge accumulates (e.g. a pet fee charged once vs. a cot charged per night).
	</p>
</form>
