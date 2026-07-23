<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string };
	type TaxPreset = { id: string; label: string; ratePercent: number; appliesToRoom: boolean; appliesToAddon: boolean };

	let { prop, presets }: { prop: Prop; presets: TaxPreset[] } = $props();

	let newLabel       = $state('');
	let newRate        = $state('');
	let newToRoom      = $state(true);
	let newToAddon     = $state(true);
	let saving         = $state(false);
	let deleting       = $state<string | null>(null);
</script>

<h2 class="mb-5 text-lg font-semibold">Taxes</h2>

{#if presets.length > 0}
	<div class="mb-5 max-w-lg space-y-2">
		{#each presets as preset}
			<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
				<span class="flex-1 font-medium">{preset.label}</span>
				<span class="tabular-nums text-muted-foreground">{preset.ratePercent}%</span>
				<!-- Clickable ROOM pill: toggles appliesToRoom -->
				<form method="POST" action="?/upsertTaxPreset" use:enhance={() => async ({ update }) => update()}>
					<input type="hidden" name="id"           value={preset.id} />
					<input type="hidden" name="propertyId"   value={prop.id} />
					<input type="hidden" name="label"        value={preset.label} />
					<input type="hidden" name="ratePercent"  value={preset.ratePercent} />
					<input type="hidden" name="appliesToRoom"  value={preset.appliesToRoom  ? '0' : '1'} />
					<input type="hidden" name="appliesToAddon" value={preset.appliesToAddon ? '1' : '0'} />
					<button type="submit" title="Toggle: applies to room charges"
						class="text-[10px] font-semibold rounded px-1.5 py-0.5 cursor-pointer {preset.appliesToRoom ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}">
						ROOM
					</button>
				</form>
				<!-- Clickable ADD-ONS pill: toggles appliesToAddon -->
				<form method="POST" action="?/upsertTaxPreset" use:enhance={() => async ({ update }) => update()}>
					<input type="hidden" name="id"           value={preset.id} />
					<input type="hidden" name="propertyId"   value={prop.id} />
					<input type="hidden" name="label"        value={preset.label} />
					<input type="hidden" name="ratePercent"  value={preset.ratePercent} />
					<input type="hidden" name="appliesToRoom"  value={preset.appliesToRoom  ? '1' : '0'} />
					<input type="hidden" name="appliesToAddon" value={preset.appliesToAddon ? '0' : '1'} />
					<button type="submit" title="Toggle: applies to taxable add-ons"
						class="text-[10px] font-semibold rounded px-1.5 py-0.5 cursor-pointer {preset.appliesToAddon ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}">
						ADD-ONS
					</button>
				</form>
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
				newLabel = ''; newRate = ''; newToRoom = true; newToAddon = true;
			} else toast.error('Save failed');
			await update();
		};
	}}
	class="space-y-3 max-w-sm"
>
	<input type="hidden" name="propertyId" value={prop.id} />
	<div class="flex items-end gap-3">
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Label</Label>
			<Input name="label" placeholder="GST" bind:value={newLabel} class="h-8 w-28" required />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Rate %</Label>
			<Input name="ratePercent" type="number" step="0.001" min="0"
				placeholder="5.0" bind:value={newRate} class="h-8 w-24" required />
		</div>
	</div>
	<div class="flex items-center gap-4 text-sm">
		<span class="text-xs text-muted-foreground font-medium">Applies to:</span>
		<label class="flex items-center gap-1.5 cursor-pointer">
			<input type="checkbox" name="appliesToRoom" value="1" bind:checked={newToRoom}
				class="h-3.5 w-3.5 rounded accent-blue-600" />
			<span class="text-xs">Room charges</span>
		</label>
		<label class="flex items-center gap-1.5 cursor-pointer">
			<input type="checkbox" name="appliesToAddon" value="1" bind:checked={newToAddon}
				class="h-3.5 w-3.5 rounded accent-purple-600" />
			<span class="text-xs">Taxable add-ons</span>
		</label>
	</div>
	<p class="text-[11px] text-muted-foreground/70">
		e.g. MRDT applies to room charges only — uncheck "Taxable add-ons" for that tax.
	</p>
	<Button type="submit" size="sm" class="h-8" disabled={saving}>
		{saving ? '…' : '+ Add'}
	</Button>
</form>
