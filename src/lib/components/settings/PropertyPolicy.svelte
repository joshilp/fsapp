<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = {
		id: string;
		policyText?: string | null;
		cancellationFeeCents?: number | null;
		noRefundDays?: number | null;
		depositCalcMethod?: string | null;
		depositNights?: number | null;
		depositPercent?: number | null;
		depositFlatCents?: number | null;
	};

	let { prop }: { prop: Prop } = $props();
	let saving = $state(false);

	const DEPOSIT_METHODS = [
		{ value: 'first_night', label: 'First N nights rate' },
		{ value: 'average', label: 'Average N nights rate' },
		{ value: 'percentage', label: 'Percentage of total' },
		{ value: 'flat', label: 'Flat amount' },
	];
</script>

<h2 class="mb-5 text-lg font-semibold">Policy</h2>

<form method="POST" action="?/updatePropertyPolicy"
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
		<div class="flex flex-col gap-1.5">
			<Label for="pol-text-{prop.id}">Policy text <span class="text-xs text-muted-foreground font-normal">(printed on booking card)</span></Label>
			<textarea id="pol-text-{prop.id}" name="policyText" rows="4"
				class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none resize-none"
			>{prop.policyText ?? ''}</textarea>
		</div>

		<div>
			<p class="mb-3 text-sm font-medium">Cancellation</p>
			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-1.5">
					<Label for="pol-cancel-{prop.id}" class="text-xs text-muted-foreground">Cancellation fee ($)</Label>
					<Input id="pol-cancel-{prop.id}" name="cancellationFeeDollars" type="number" min="0" step="0.01"
						value={((prop.cancellationFeeCents ?? 2500) / 100).toFixed(2)} />
					<p class="text-[11px] text-muted-foreground">Flat fee charged on any cancellation</p>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="pol-noref-{prop.id}" class="text-xs text-muted-foreground">No-refund window (days)</Label>
					<Input id="pol-noref-{prop.id}" name="noRefundDays" type="number" min="0" step="1"
						value={prop.noRefundDays ?? 30} />
					<p class="text-[11px] text-muted-foreground">Days before check-in — no refund</p>
				</div>
			</div>
		</div>

		<div>
			<p class="mb-3 text-sm font-medium">Deposit</p>
			<div class="grid grid-cols-2 gap-4">
				<div class="col-span-2 flex flex-col gap-1.5">
					<Label for="pol-depmethod-{prop.id}" class="text-xs text-muted-foreground">Calculation method</Label>
					<select id="pol-depmethod-{prop.id}" name="depositCalcMethod"
						class="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none w-full max-w-xs"
					>
						{#each DEPOSIT_METHODS as m}
							<option value={m.value} selected={m.value === (prop.depositCalcMethod ?? 'first_night')}>
								{m.label}
							</option>
						{/each}
					</select>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="pol-depn-{prop.id}" class="text-xs text-muted-foreground">
						Deposit nights <span class="text-[10px]">(first/avg)</span>
					</Label>
					<Input id="pol-depn-{prop.id}" name="depositNights" type="number" min="0" step="1"
						value={prop.depositNights ?? 1} class="w-24" />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="pol-deppct-{prop.id}" class="text-xs text-muted-foreground">
						Deposit % <span class="text-[10px]">(percentage)</span>
					</Label>
					<Input id="pol-deppct-{prop.id}" name="depositPercent" type="number" min="0" max="100" step="1"
						value={prop.depositPercent ?? 20} class="w-24" />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="pol-depflat-{prop.id}" class="text-xs text-muted-foreground">
						Flat deposit ($) <span class="text-[10px]">(flat)</span>
					</Label>
					<Input id="pol-depflat-{prop.id}" name="depositFlatDollars" type="number" min="0" step="0.01"
						value={((prop.depositFlatCents ?? 0) / 100).toFixed(2)} class="w-24" />
				</div>
			</div>
		</div>
	</div>
	<div class="mt-6">
		<Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	</div>
</form>
