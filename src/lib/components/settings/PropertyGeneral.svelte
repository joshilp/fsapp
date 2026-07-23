<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = {
		id: string; name: string; address?: string | null; city?: string | null;
		province?: string | null; postalCode?: string | null; phone?: string | null;
		gstNumber?: string | null; logoUrl?: string | null;
		checkinTime: string; checkoutTime: string;
	};

	let { prop }: { prop: Prop } = $props();
	let saving = $state(false);
</script>

<h2 class="mb-5 text-lg font-semibold">General</h2>

<form method="POST" action="?/updatePropertyGeneral"
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
	<div class="grid grid-cols-2 gap-4 max-w-lg">
		<div class="col-span-2 flex flex-col gap-1.5">
			<Label for="gen-name-{prop.id}">Property name</Label>
			<Input id="gen-name-{prop.id}" name="name" value={prop.name} required />
		</div>
		<div class="col-span-2 flex flex-col gap-1.5">
			<Label for="gen-addr-{prop.id}">Street address</Label>
			<Input id="gen-addr-{prop.id}" name="address" value={prop.address ?? ''} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="gen-city-{prop.id}">City</Label>
			<Input id="gen-city-{prop.id}" name="city" value={prop.city ?? ''} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="gen-prov-{prop.id}">Province / State</Label>
			<Input id="gen-prov-{prop.id}" name="province" value={prop.province ?? ''} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="gen-postal-{prop.id}">Postal code</Label>
			<Input id="gen-postal-{prop.id}" name="postalCode" value={prop.postalCode ?? ''} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="gen-phone-{prop.id}">Phone</Label>
			<Input id="gen-phone-{prop.id}" name="phone" type="tel" value={prop.phone ?? ''} />
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="gen-gst-{prop.id}">GST / Tax number</Label>
			<Input id="gen-gst-{prop.id}" name="gstNumber" value={prop.gstNumber ?? ''} />
		</div>
		<div class="col-span-2 flex flex-col gap-1.5">
			<Label for="gen-logo-{prop.id}">Logo URL</Label>
			<Input id="gen-logo-{prop.id}" name="logoUrl" type="url"
				placeholder="https://…/logo.png" value={prop.logoUrl ?? ''} />
			<p class="text-xs text-muted-foreground">Appears on confirmation emails and the print slip.</p>
		</div>
		<div class="col-span-2 flex flex-col gap-1.5">
			<Label>Check-in / Check-out times</Label>
			<div class="flex items-center gap-2">
				<Input name="checkinTime" value={prop.checkinTime} class="w-24 text-center" placeholder="14:00" />
				<span class="text-muted-foreground text-sm">→</span>
				<Input name="checkoutTime" value={prop.checkoutTime} class="w-24 text-center" placeholder="10:30" />
			</div>
		</div>
	</div>
	<div class="mt-6">
		<Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	</div>
</form>
