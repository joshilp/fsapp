<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	type Prop = {
		id: string; name: string;
		defaultMaxNights?: number | null;
		gapFillNights?: number;
		quarantineHours?: number;
	};
	type RoomType = { id: string; name: string; category: string };
	type LosDiscount = {
		id: string; propertyId: string; label: string; minNights: number;
		discountPercent: number; isActive: boolean; sortOrder: number;
		roomTypeId?: string | null;
		roomType?: { name: string; category: string } | null;
	};
	type PromoCode = {
		id: string; propertyId: string; code: string; label: string;
		discountPercent?: number | null; discountCents?: number | null;
		maxUses?: number | null; usedCount: number;
		expiresAt?: Date | null; isActive: boolean;
	};

	let { prop, roomTypes, losDiscounts, promoCodes }: {
		prop: Prop;
		roomTypes: RoomType[];
		losDiscounts: LosDiscount[];
		promoCodes: PromoCode[];
	} = $props();

	let deletingLos = $state<string | null>(null);
	let deletingPromo = $state<string | null>(null);
	let savingRestrictions = $state(false);

	function fmtExpiry(d: Date | null | undefined) {
		if (!d) return null;
		return new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<h2 class="mb-6 text-lg font-semibold">Rates &amp; Promotions</h2>

<!-- ── Stay Restrictions ───────────────────────────────────────────────────── -->
<section class="mb-10">
	<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay Restrictions</p>
	<p class="mb-4 text-xs text-muted-foreground">
		Control maximum stay length, booking gaps, and post-checkout room quarantine.
	</p>
	<form method="POST" action="?/updatePropertyRestrictions"
		use:enhance={() => {
			savingRestrictions = true;
			return async ({ result, update }) => {
				savingRestrictions = false;
				if (result.type === 'success') toast.success('Restrictions saved');
				else toast.error('Save failed');
				await update({ reset: false });
			};
		}}
		class="max-w-xl space-y-4 border rounded-lg p-4 bg-muted/20"
	>
		<input type="hidden" name="id" value={prop.id} />

		<div class="grid grid-cols-3 gap-4">
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium">Max stay (nights)</label>
				<input name="defaultMaxNights" type="number" min="1" max="365"
					value={prop.defaultMaxNights ?? ''}
					placeholder="∞ (no limit)"
					class="border-input bg-background rounded border px-2 py-1.5 text-sm font-mono" />
				<p class="text-[10px] text-muted-foreground">Property-wide default. Industry standard: 21. Can be overridden per room type.</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium">Gap fill (nights)</label>
				<input name="gapFillNights" type="number" min="0" max="7"
					value={prop.gapFillNights ?? 0}
					class="border-input bg-background rounded border px-2 py-1.5 text-sm font-mono" />
				<p class="text-[10px] text-muted-foreground">Block stranded gaps shorter than this between bookings (B&B mode). 0 = disabled.</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="text-xs font-medium">Quarantine (hours)</label>
				<input name="quarantineHours" type="number" min="0" max="72"
					value={prop.quarantineHours ?? 0}
					class="border-input bg-background rounded border px-2 py-1.5 text-sm font-mono" />
				<p class="text-[10px] text-muted-foreground">Auto-block room for cleaning after checkout. 0 = disabled. 4–12 hrs typical.</p>
			</div>
		</div>

		<button type="submit" disabled={savingRestrictions}
			class="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
			{savingRestrictions ? 'Saving…' : 'Save Restrictions'}
		</button>
	</form>
</section>

<!-- ── LOS Discounts ──────────────────────────────────────────────────────── -->
<section class="mb-10">
	<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Length-of-Stay Discounts</p>
	<p class="mb-4 text-xs text-muted-foreground">Auto-apply a % discount when a guest books a minimum number of nights.</p>

	{#if losDiscounts.length > 0}
		<div class="mb-5 max-w-xl space-y-2">
			{#each losDiscounts as los}
				<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
					<div class="flex-1 min-w-0">
						<span class="font-medium">{los.label}</span>
						<span class="ml-2 text-xs text-muted-foreground">
							{los.minNights}+ nights · {los.discountPercent}% off
							{#if los.roomType} · {los.roomType.category} {los.roomType.name}{:else} · all types{/if}
						</span>
					</div>
					<form method="POST" action="?/deleteLosDiscount"
						use:enhance={() => {
							deletingLos = los.id;
							return async ({ result, update }) => {
								deletingLos = null;
								if (result.type === 'success') toast.success('Discount removed');
								else toast.error('Delete failed');
								await update();
							};
						}}>
						<input type="hidden" name="id" value={los.id} />
						<button type="submit" disabled={deletingLos === los.id}
							class="text-xs text-destructive hover:underline disabled:opacity-40">
							{deletingLos === los.id ? '…' : 'Remove'}
						</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<p class="mb-4 text-xs text-muted-foreground">No LOS discounts configured yet.</p>
	{/if}

	<!-- Add LOS discount -->
	<form method="POST" action="?/upsertLosDiscount"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') toast.success('Discount added');
				else toast.error((result as { type: 'failure'; data?: { error?: string } }).data?.error ?? 'Save failed');
				await update();
			};
		}}
		class="flex flex-wrap items-end gap-2 max-w-xl border rounded-lg p-3 bg-muted/20"
	>
		<input type="hidden" name="propertyId" value={prop.id} />
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Label</span>
			<input name="label" placeholder="Weekly stay — 10% off" required
				class="border-input bg-background rounded border px-2 py-1 text-sm w-44" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Min nights</span>
			<input name="minNights" type="number" min="2" placeholder="7" required
				class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Discount %</span>
			<input name="discountPercent" type="number" min="1" max="99" step="0.1" placeholder="10" required
				class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Room type</span>
			<select name="roomTypeId"
				class="border-input bg-background rounded border px-2 py-1 text-sm">
				<option value="">All types</option>
				{#each roomTypes as rt}
					<option value={rt.id}>{rt.category} · {rt.name}</option>
				{/each}
			</select>
		</div>
		<button type="submit" class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
			+ Add
		</button>
	</form>
</section>

<!-- ── Promo Codes ─────────────────────────────────────────────────────────── -->
<section>
	<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Promo Codes</p>
	<p class="mb-4 text-xs text-muted-foreground">Guests enter these on the booking page for a one-time or recurring discount.</p>

	{#if promoCodes.length > 0}
		<div class="mb-5 max-w-xl space-y-2">
			{#each promoCodes as pc}
				<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
					<span class="font-mono font-bold text-xs bg-muted px-1.5 py-0.5 rounded">{pc.code}</span>
					<div class="flex-1 min-w-0 text-xs text-muted-foreground truncate">
						{pc.label}
						·
						{#if pc.discountPercent}{pc.discountPercent}% off
						{:else}${((pc.discountCents ?? 0) / 100).toFixed(2)} off{/if}
						· used {pc.usedCount}{pc.maxUses ? '/' + pc.maxUses : ''}
						{#if pc.expiresAt} · expires {fmtExpiry(pc.expiresAt)}{/if}
					</div>
					<form method="POST" action="?/deletePromoCode"
						use:enhance={() => {
							deletingPromo = pc.id;
							return async ({ result, update }) => {
								deletingPromo = null;
								if (result.type === 'success') toast.success('Code deactivated');
								else toast.error('Failed');
								await update();
							};
						}}>
						<input type="hidden" name="id" value={pc.id} />
						<button type="submit" disabled={deletingPromo === pc.id}
							class="text-xs text-destructive hover:underline disabled:opacity-40">
							{deletingPromo === pc.id ? '…' : 'Deactivate'}
						</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<p class="mb-4 text-xs text-muted-foreground">No promo codes yet.</p>
	{/if}

	<!-- Add promo code -->
	<form method="POST" action="?/upsertPromoCode"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') toast.success('Promo code created');
				else toast.error((result as { type: 'failure'; data?: { error?: string } }).data?.error ?? 'Save failed');
				await update();
			};
		}}
		class="flex flex-wrap items-end gap-2 max-w-xl border rounded-lg p-3 bg-muted/20"
	>
		<input type="hidden" name="propertyId" value={prop.id} />
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Code</span>
			<input name="code" placeholder="SUMMER10" required maxlength="20"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-28 font-mono uppercase" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Label (internal)</span>
			<input name="label" placeholder="Summer 2026 promo" required
				class="border-input bg-background rounded border px-2 py-1 text-sm w-40" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">% off</span>
			<input name="discountPercent" type="number" min="1" max="99" step="0.1" placeholder="10"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">$ off (flat)</span>
			<input name="discountDollars" type="number" min="1" step="0.01" placeholder="25.00"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-24 font-mono" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Max uses</span>
			<input name="maxUses" type="number" min="1" placeholder="∞"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Expires</span>
			<input name="expiresAt" type="date"
				class="border-input bg-background rounded border px-2 py-1 text-sm" />
		</div>
		<button type="submit" class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
			+ Create
		</button>
	</form>
</section>
