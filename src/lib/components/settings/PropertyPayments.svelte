<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = {
		id: string;
		name: string;
		elavonMerchantId?: string | null;
		elavonUserId?: string | null;
		elavonPin?: string | null;
	};

	let { prop }: { prop: Prop } = $props();

	let saving   = $state(false);
	let showPin  = $state(false);

	const isConfigured = $derived(!!(prop.elavonMerchantId && prop.elavonUserId && prop.elavonPin));
</script>

<h2 class="mb-1 text-lg font-semibold">Payments</h2>
<p class="mb-6 text-sm text-muted-foreground">
	Elavon Converge credentials for <strong>{prop.name}</strong>. Used to tokenize and charge credit
	cards directly from the booking card.
</p>

{#if isConfigured}
	<div class="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
		<span>✓</span>
		<span>Elavon Converge connected — credentials on file.</span>
	</div>
{:else}
	<div class="mb-5 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
		<span>⚠</span>
		<span>No payment credentials configured. Card charging will not work until credentials are added.</span>
	</div>
{/if}

<form method="POST" action="?/updatePropertyPayments"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') toast.success('Payment credentials saved');
			else toast.error('Save failed');
			await update();
		};
	}}
	class="max-w-sm space-y-4"
>
	<input type="hidden" name="id" value={prop.id} />

	<div class="space-y-1">
		<Label class="text-xs">Merchant ID <span class="text-muted-foreground">(ssl_merchant_id)</span></Label>
		<Input name="elavonMerchantId" placeholder="e.g. 123456"
			value={prop.elavonMerchantId ?? ''}
			class="font-mono text-sm" />
	</div>

	<div class="space-y-1">
		<Label class="text-xs">API User ID <span class="text-muted-foreground">(ssl_user_id)</span></Label>
		<Input name="elavonUserId" placeholder="e.g. apiuser"
			value={prop.elavonUserId ?? ''}
			class="font-mono text-sm" />
	</div>

	<div class="space-y-1">
		<Label class="text-xs">PIN <span class="text-muted-foreground">(ssl_pin)</span></Label>
		<div class="flex gap-2">
			<Input name="elavonPin"
				type={showPin ? 'text' : 'password'}
				placeholder={prop.elavonPin ? '••••••••••••' : 'Enter PIN'}
				value={prop.elavonPin ?? ''}
				class="font-mono text-sm flex-1" />
			<Button type="button" variant="outline" size="sm" class="shrink-0"
				onclick={() => showPin = !showPin}>
				{showPin ? 'Hide' : 'Show'}
			</Button>
		</div>
	</div>

	<div class="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
		<p class="font-medium text-foreground">How to get these credentials:</p>
		<p>1. Call Elavon Software Support: <strong>1-800-377-3962</strong></p>
		<p>2. Ask them to enable <strong>tokenization</strong> and create an <strong>API User</strong></p>
		<p>3. Give them your server's outbound IP address to whitelist</p>
		<p>4. See <code class="rounded bg-muted px-1">.dev/elavon-setup-guide.md</code> for full instructions</p>
	</div>

	<Button type="submit" size="sm" disabled={saving}>
		{saving ? 'Saving…' : 'Save credentials'}
	</Button>
</form>
