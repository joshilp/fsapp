<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ─── Properties ──────────────────────────────────────────────────────────
	let savingProperty = $state<string | null>(null);

	// ─── Tax Presets ─────────────────────────────────────────────────────────
	type NewPreset = { propertyId: string; label: string; ratePercent: string };
	let newPreset = $state<NewPreset>({ propertyId: '', label: '', ratePercent: '' });
	let savingPreset = $state(false);
	let deletingPreset = $state<string | null>(null);

	// ─── Rooms ────────────────────────────────────────────────────────────────
	type NewRoom = { propertyId: string; roomNumber: string; roomTypeId: string };
	let newRoom = $state<NewRoom>({ propertyId: '', roomNumber: '', roomTypeId: '' });
	let addingRoom = $state(false);
	let togglingRoom = $state<string | null>(null);
	let roomError = $state('');

	// ─── Channels ─────────────────────────────────────────────────────────────
	type NewChannel = { name: string; isOta: boolean; sortOrder: string };
	let newChannel = $state<NewChannel>({ name: '', isOta: false, sortOrder: '10' });
	let addingChannel = $state(false);

	// ─── Room types ───────────────────────────────────────────────────────────
	type NewRoomType = { propertyId: string; name: string; category: string; sortOrder: string };
	let newRoomType = $state<NewRoomType>({ propertyId: '', name: '', category: '', sortOrder: '0' });
	let addingRoomType = $state(false);
	let deletingRoomType = $state<string | null>(null);
	let editingRoomType = $state<string | null>(null);

	// ─── Pricing ──────────────────────────────────────────────────────────────
	let pricingPropertyId = $state(data.propertiesList[0]?.id ?? '');
	let editingSeasonId = $state<string | null>(null);
	let savingSeason = $state(false);
	let savingTier = $state<string | null>(null); // seasonId being saved
	let deletingSeasonId = $state<string | null>(null);

	const pricingSeasons = $derived(
		data.rateSeasonsList.filter((s) => s.propertyId === pricingPropertyId)
	);

	function fmt(cents: number) {
		return (cents / 100).toFixed(2);
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="mb-6 text-2xl font-bold">Settings</h1>

	<Tabs.Root value="properties">
		<Tabs.List class="mb-6 flex-wrap">
			<Tabs.Trigger value="properties">Properties</Tabs.Trigger>
			<Tabs.Trigger value="taxes">Taxes</Tabs.Trigger>
			<Tabs.Trigger value="roomtypes">Room Types</Tabs.Trigger>
			<Tabs.Trigger value="rooms">Rooms</Tabs.Trigger>
			<Tabs.Trigger value="pricing">Pricing</Tabs.Trigger>
			<Tabs.Trigger value="channels">Channels</Tabs.Trigger>
			<Tabs.Trigger value="email">Email</Tabs.Trigger>
		</Tabs.List>

		<!-- ── Properties ─────────────────────────────────────────────────── -->
		<Tabs.Content value="properties">
			<div class="space-y-6">
				{#each data.propertiesList as prop}
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-4 font-semibold">{prop.name}</h2>
						<form
							method="POST"
							action="?/updateProperty"
							use:enhance={() => {
								savingProperty = prop.id;
								return async ({ update }) => {
									savingProperty = null;
									await update({ reset: false });
								};
							}}
						>
							<input type="hidden" name="id" value={prop.id} />
							<div class="grid grid-cols-2 gap-3">
								<div class="col-span-2 flex flex-col gap-1.5">
									<Label for="name-{prop.id}">Property name</Label>
									<Input id="name-{prop.id}" name="name" value={prop.name} required />
								</div>
								<div class="col-span-2 flex flex-col gap-1.5">
									<Label for="address-{prop.id}">Street address</Label>
									<Input id="address-{prop.id}" name="address" value={prop.address} />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="city-{prop.id}">City</Label>
									<Input id="city-{prop.id}" name="city" value={prop.city} />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="province-{prop.id}">Province</Label>
									<Input id="province-{prop.id}" name="province" value={prop.province} />
								</div>
								<div class="flex flex-col gap-1.5">
									<Label for="postal-{prop.id}">Postal code</Label>
									<Input id="postal-{prop.id}" name="postalCode" value={prop.postalCode ?? ''} />
								</div>
							<div class="flex flex-col gap-1.5">
								<Label for="phone-{prop.id}">Phone</Label>
								<Input id="phone-{prop.id}" name="phone" type="tel" value={prop.phone ?? ''} />
							</div>
							<div class="flex flex-col gap-1.5">
								<Label for="gst-{prop.id}">GST number</Label>
								<Input id="gst-{prop.id}" name="gstNumber" value={prop.gstNumber ?? ''} />
							</div>
							<div class="col-span-2 flex flex-col gap-1.5">
								<Label for="logo-{prop.id}">Logo URL</Label>
								<Input id="logo-{prop.id}" name="logoUrl" type="url" placeholder="https://…/logo.png" value={prop.logoUrl ?? ''} />
								<p class="text-xs text-muted-foreground">Appears on confirmation emails and the print slip. Paste any public image URL.</p>
							</div>
								<div class="flex flex-col gap-1.5">
									<Label>Check-in / Check-out times</Label>
									<div class="flex items-center gap-2">
										<Input name="checkinTime" value={prop.checkinTime} class="w-24 text-center" placeholder="14:00" />
										<span class="text-muted-foreground text-sm">→</span>
										<Input name="checkoutTime" value={prop.checkoutTime} class="w-24 text-center" placeholder="10:30" />
									</div>
								</div>
							<div class="col-span-2 flex flex-col gap-1.5">
								<Label for="policy-{prop.id}">Policy text (printed on card)</Label>
								<textarea
									id="policy-{prop.id}"
									name="policyText"
									rows="3"
									class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
								>{prop.policyText ?? ''}</textarea>
							</div>
							<!-- Cancellation policy numbers -->
							<div class="col-span-2">
								<Label class="mb-2 block">Cancellation &amp; Deposit Policy</Label>
								<div class="grid grid-cols-3 gap-3">
									<div class="flex flex-col gap-1">
										<Label for="cancelFee-{prop.id}" class="text-xs text-muted-foreground">Cancellation fee ($)</Label>
										<Input id="cancelFee-{prop.id}" name="cancellationFeeDollars" type="number" min="0" step="0.01"
											value={((prop.cancellationFeeCents ?? 2500) / 100).toFixed(2)}
											class="w-full" />
										<p class="text-[11px] text-muted-foreground">Flat fee on any cancellation</p>
									</div>
									<div class="flex flex-col gap-1">
										<Label for="noRefund-{prop.id}" class="text-xs text-muted-foreground">No-refund window (days)</Label>
										<Input id="noRefund-{prop.id}" name="noRefundDays" type="number" min="0" step="1"
											value={prop.noRefundDays ?? 30}
											class="w-full" />
										<p class="text-[11px] text-muted-foreground">Days before check-in with no refund</p>
									</div>
								</div>
								<!-- Deposit calculation -->
								<div class="mt-3 grid grid-cols-3 gap-3">
									<div class="flex flex-col gap-1">
										<Label for="depCalc-{prop.id}" class="text-xs text-muted-foreground">Deposit method</Label>
										<select
											id="depCalc-{prop.id}"
											name="depositCalcMethod"
											class="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
										>
											{#each [
												{ value: 'first_night', label: 'First N nights rate' },
												{ value: 'average', label: 'Average N nights rate' },
												{ value: 'percentage', label: 'Percentage of total' },
												{ value: 'flat', label: 'Flat amount' }
											] as opt}
												<option value={opt.value} selected={opt.value === (prop.depositCalcMethod ?? 'first_night')}>
													{opt.label}
												</option>
											{/each}
										</select>
									</div>
									<div class="flex flex-col gap-1">
										<Label for="depNights-{prop.id}" class="text-xs text-muted-foreground">Deposit nights <span class="text-[10px]">(first/avg methods)</span></Label>
										<Input id="depNights-{prop.id}" name="depositNights" type="number" min="0" step="1"
											value={prop.depositNights ?? 1}
											class="w-full" />
										<p class="text-[11px] text-muted-foreground">Nights charged as deposit</p>
									</div>
									<div class="flex flex-col gap-1">
										<Label for="depPct-{prop.id}" class="text-xs text-muted-foreground">Deposit % <span class="text-[10px]">(pct method)</span></Label>
										<Input id="depPct-{prop.id}" name="depositPercent" type="number" min="0" max="100" step="1"
											value={prop.depositPercent ?? 20}
											class="w-full" />
										<p class="text-[11px] text-muted-foreground">% of total stay</p>
									</div>
									<div class="flex flex-col gap-1">
										<Label for="depFlat-{prop.id}" class="text-xs text-muted-foreground">Flat deposit ($) <span class="text-[10px]">(flat method)</span></Label>
										<Input id="depFlat-{prop.id}" name="depositFlatDollars" type="number" min="0" step="0.01"
											value={((prop.depositFlatCents ?? 0) / 100).toFixed(2)}
											class="w-full" />
										<p class="text-[11px] text-muted-foreground">Fixed deposit amount</p>
									</div>
								</div>
							</div>
							</div>
							<div class="mt-4 flex justify-end">
								<Button type="submit" size="sm" disabled={savingProperty === prop.id}>
									{savingProperty === prop.id ? 'Saving…' : 'Save'}
								</Button>
							</div>
						</form>
					</div>
				{/each}
			</div>
		</Tabs.Content>

		<!-- ── Tax Presets ─────────────────────────────────────────────────── -->
		<Tabs.Content value="taxes">
			<div class="space-y-6">
				{#each data.propertiesList as prop}
					{@const presets = data.taxPresetsList.filter((p) => p.propertyId === prop.id)}
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-3 font-semibold">{prop.name}</h2>

						<!-- Existing presets -->
						{#if presets.length > 0}
							<div class="mb-4 space-y-2">
								{#each presets as preset}
									<div class="flex items-center gap-3 rounded-md border p-2.5 text-sm">
										<span class="flex-1 font-medium">{preset.label}</span>
										<span class="text-muted-foreground">{preset.ratePercent}%</span>
										<form
											method="POST"
											action="?/deleteTaxPreset"
											use:enhance={() => {
												deletingPreset = preset.id;
												return async ({ update }) => {
													deletingPreset = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={preset.id} />
											<Button
												type="submit"
												variant="ghost"
												size="sm"
												class="text-destructive h-7 px-2 text-xs"
												disabled={deletingPreset === preset.id}
											>
												{deletingPreset === preset.id ? '…' : 'Remove'}
											</Button>
										</form>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground mb-4 text-sm">No tax presets yet.</p>
						{/if}

						<!-- Add new preset -->
						<form
							method="POST"
							action="?/upsertTaxPreset"
							use:enhance={() => {
								savingPreset = true;
								return async ({ update }) => {
									savingPreset = false;
									newPreset = { propertyId: '', label: '', ratePercent: '' };
									await update();
								};
							}}
							class="flex items-end gap-2"
						>
							<input type="hidden" name="propertyId" value={prop.id} />
							<div class="flex flex-col gap-1">
								<Label class="text-xs">Label</Label>
								<Input name="label" placeholder="GST" bind:value={newPreset.label} class="h-8 w-24" required />
							</div>
							<div class="flex flex-col gap-1">
								<Label class="text-xs">Rate %</Label>
								<Input
									name="ratePercent"
									type="number"
									step="0.001"
									min="0"
									placeholder="5.0"
									bind:value={newPreset.ratePercent}
									class="h-8 w-20"
									required
								/>
							</div>
							<Button type="submit" size="sm" class="h-8" disabled={savingPreset}>
								{savingPreset ? '…' : '+ Add'}
							</Button>
						</form>
					</div>
				{/each}
			</div>
		</Tabs.Content>

		<!-- ── Rooms ───────────────────────────────────────────────────────── -->
		<Tabs.Content value="rooms">
			<div class="space-y-6">
				{#each data.propertiesList as prop}
					{@const propRooms = data.roomsList.filter((r) => r.propertyId === prop.id)}
					{@const propRoomTypes = data.roomTypesList.filter((rt) => rt.propertyId === prop.id)}
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-3 font-semibold">{prop.name}</h2>

						<!-- Room list -->
						{#if propRooms.length > 0}
							<div class="mb-4 overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="text-muted-foreground border-border border-b text-xs">
											<th class="pb-1 pr-4 text-left font-medium">Room #</th>
											<th class="pb-1 pr-4 text-left font-medium">Type</th>
											<th class="pb-1 pr-4 text-left font-medium">Kitchen</th>
											<th class="pb-1 text-right font-medium">Active</th>
										</tr>
									</thead>
									<tbody>
										{#each propRooms as room}
											<tr class="border-border border-b text-sm last:border-0">
												<td class="py-2 pr-4 font-mono font-medium">{room.roomNumber}</td>
												<td class="py-2 pr-4 text-gray-600">
													{room.roomType?.category ?? '—'}
													{#if room.roomType?.name}
														<span class="text-muted-foreground text-xs">· {room.roomType.name}</span>
													{/if}
												</td>
												<td class="py-2 pr-4 text-xs">
													{room.hasKitchen ? '✓' : '—'}
												</td>
												<td class="py-2 text-right">
													<form
														method="POST"
														action="?/toggleRoom"
														use:enhance={() => {
															togglingRoom = room.id;
															return async ({ update }) => {
																togglingRoom = null;
																await update();
															};
														}}
													>
														<input type="hidden" name="id" value={room.id} />
														<input type="hidden" name="isActive" value={String(room.isActive)} />
														<button
															type="submit"
															class={[
																'rounded px-2 py-0.5 text-xs font-medium transition-colors',
																room.isActive
																	? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
																	: 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
															].join(' ')}
															disabled={togglingRoom === room.id}
														>
															{togglingRoom === room.id ? '…' : room.isActive ? 'Active' : 'Inactive'}
														</button>
													</form>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p class="text-muted-foreground mb-4 text-sm">No rooms yet.</p>
						{/if}

						<!-- Add room -->
						{#if roomError}
							<p class="text-destructive mb-2 text-xs">{roomError}</p>
						{/if}
						<form
							method="POST"
							action="?/addRoom"
							use:enhance={() => {
								addingRoom = true;
								roomError = '';
								return async ({ result, update }) => {
									addingRoom = false;
									if (result.type === 'failure') {
										roomError = (result.data?.error as string) ?? 'Error';
									} else {
										newRoom = { propertyId: '', roomNumber: '', roomTypeId: '' };
									}
									await update({ reset: false });
								};
							}}
							class="grid grid-cols-2 sm:grid-cols-3 gap-2"
						>
							<input type="hidden" name="propertyId" value={prop.id} />
							<div class="flex flex-col gap-1">
								<Label class="text-xs">Room #</Label>
								<Input name="roomNumber" placeholder="33" bind:value={newRoom.roomNumber} class="h-8 w-20" required />
							</div>
							<div class="flex flex-col gap-1">
								<Label class="text-xs">Type</Label>
								<select
									name="roomTypeId"
									class="border-input bg-background h-8 rounded-md border px-2 text-sm"
									bind:value={newRoom.roomTypeId}
								>
									<option value="">— none —</option>
									{#each propRoomTypes as rt}
										<option value={rt.id}>{rt.category} · {rt.name}</option>
									{/each}
								</select>
							</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Bedrooms (BR)</Label>
							<Input name="numRooms" type="number" min="1" placeholder="1" class="h-8 w-16" />
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">King (K)</Label>
							<Input name="kingBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Queen (Q)</Label>
							<Input name="queenBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Double (D)</Label>
							<Input name="doubleBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Extras</Label>
							<div class="flex gap-2 items-center h-8">
								<label class="flex items-center gap-1 text-xs cursor-pointer">
									<input type="checkbox" name="hasKitchen" value="1" class="rounded" />
									Kit
								</label>
								<label class="flex items-center gap-1 text-xs cursor-pointer">
									<input type="checkbox" name="hasHideabed" value="1" class="rounded" />
									HB
								</label>
							</div>
						</div>
							<div class="flex flex-col gap-1 col-span-2 sm:col-span-3">
								<Label class="text-xs">Configs (one per line, for dual-config rooms — e.g. "1Q Sleeping")</Label>
								<textarea name="configs" rows="2"
									placeholder={"Leave blank for single config\n1Q Sleeping\n1Q+1D Sleeping"}
									class="border-input bg-background rounded-md border px-2 py-1 text-xs w-full resize-none" />
							</div>
							<Button type="submit" size="sm" class="h-8 col-span-2 sm:col-span-3" disabled={addingRoom}>
								{addingRoom ? '…' : '+ Add room'}
							</Button>
						</form>
					</div>
				{/each}
			</div>
		</Tabs.Content>

		<!-- ── Room Types ──────────────────────────────────────────────────── -->
		<Tabs.Content value="roomtypes">
			<div class="space-y-6">
				{#each data.propertiesList as prop}
					{@const propTypes = data.roomTypesList.filter((rt) => rt.propertyId === prop.id)}
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-3 font-semibold">{prop.name}</h2>

						{#if propTypes.length > 0}
							<div class="mb-4 space-y-2">
								{#each propTypes as rt}
									{#if editingRoomType === rt.id}
										<form method="POST" action="?/upsertRoomType"
											use:enhance={() => {
												return async ({ update }) => { editingRoomType = null; await update(); };
											}}
											class="flex items-end gap-2 flex-wrap rounded-md border p-2.5 bg-muted/20"
										>
											<input type="hidden" name="id" value={rt.id} />
											<input type="hidden" name="propertyId" value={prop.id} />
											<div class="flex flex-col gap-1">
												<label class="text-xs text-muted-foreground">Name</label>
												<input name="name" value={rt.name} required
													class="border-input bg-background rounded border px-2 py-1 text-sm w-40" />
											</div>
											<div class="flex flex-col gap-1">
												<label class="text-xs text-muted-foreground">Category</label>
												<input name="category" value={rt.category} required maxlength="4"
													class="border-input bg-background rounded border px-2 py-1 text-sm w-16 font-mono uppercase" />
											</div>
											<div class="flex flex-col gap-1">
												<label class="text-xs text-muted-foreground">Sort</label>
												<input name="sortOrder" type="number" value={rt.sortOrder}
													class="border-input bg-background rounded border px-2 py-1 text-sm w-16" />
											</div>
											<Button type="submit" size="sm" class="h-8">Save</Button>
											<Button type="button" variant="ghost" size="sm" class="h-8"
												onclick={() => { editingRoomType = null; }}>Cancel</Button>
										</form>
									{:else}
										<div class="flex items-center gap-3 rounded-md border p-2.5 text-sm">
											<span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{rt.category}</span>
											<span class="flex-1 font-medium">{rt.name}</span>
											<Button size="sm" variant="ghost" class="h-7 px-2 text-xs"
												onclick={() => { editingRoomType = rt.id; }}>Edit</Button>
											<form method="POST" action="?/deleteRoomType"
												use:enhance={() => {
													deletingRoomType = rt.id;
													return async ({ update }) => { deletingRoomType = null; await update(); };
												}}
											>
												<input type="hidden" name="id" value={rt.id} />
												<Button type="submit" variant="ghost" size="sm"
													class="text-destructive h-7 px-2 text-xs"
													disabled={deletingRoomType === rt.id}>
													{deletingRoomType === rt.id ? '…' : 'Delete'}
												</Button>
											</form>
										</div>
									{/if}
								{/each}
							</div>
						{/if}

						<form method="POST" action="?/upsertRoomType"
							use:enhance={() => {
								addingRoomType = true;
								return async ({ update }) => {
									addingRoomType = false;
									newRoomType = { propertyId: '', name: '', category: '', sortOrder: '0' };
									await update();
								};
							}}
							class="flex items-end gap-2 flex-wrap"
						>
							<input type="hidden" name="propertyId" value={prop.id} />
							<div class="flex flex-col gap-1">
								<label class="text-xs text-muted-foreground">Name</label>
								<input name="name" placeholder="2 Bed + Kitchen" required
									class="border-input bg-background rounded border px-2 py-1 text-sm w-40" />
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-muted-foreground">Category</label>
								<input name="category" placeholder="C" required maxlength="4"
									class="border-input bg-background rounded border px-2 py-1 text-sm w-16 font-mono uppercase" />
							</div>
							<div class="flex flex-col gap-1">
								<label class="text-xs text-muted-foreground">Sort</label>
								<input name="sortOrder" type="number" value="0"
									class="border-input bg-background rounded border px-2 py-1 text-sm w-16" />
							</div>
							<Button type="submit" size="sm" class="h-8" disabled={addingRoomType}>
								{addingRoomType ? '…' : '+ Add type'}
							</Button>
						</form>
					</div>
				{/each}
			</div>
		</Tabs.Content>

		<!-- ── Pricing ──────────────────────────────────────────────────────── -->
		<Tabs.Content value="pricing">
			<div class="space-y-4">
				<!-- Property selector -->
				<div class="flex items-center gap-3">
					<span class="text-sm font-medium">Property:</span>
					<div class="flex gap-1.5">
						{#each data.propertiesList as prop}
							<button onclick={() => { pricingPropertyId = prop.id; }}
								class={[
									'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
									pricingPropertyId === prop.id
										? 'bg-foreground text-background border-foreground'
										: 'border-border text-muted-foreground hover:border-foreground/40'
								].join(' ')}
							>{prop.name}</button>
						{/each}
					</div>
				</div>

				<p class="text-xs text-muted-foreground">
					Rate seasons are date ranges tied to a pricing tier. Each season can have a different
					nightly rate per room type. Long-weekend seasons should have <strong>min nights = 3</strong>.
				</p>

				<div class="space-y-3">
					{#each pricingSeasons as season (season.id)}
						{@const propTypes = data.roomTypesList.filter((rt) => rt.propertyId === pricingPropertyId)}
						<div class="bg-card border-border rounded-lg border shadow-sm overflow-hidden">
							<!-- Season header -->
							<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
								onclick={() => { editingSeasonId = editingSeasonId === season.id ? null : season.id; }}
							>
								<span class="h-4 w-4 rounded-sm border border-black/10 shrink-0"
									style="background:{season.colour}"></span>
								<div class="flex-1 min-w-0">
									<span class="font-medium text-sm">{season.name}</span>
									<span class="text-muted-foreground text-xs ml-2">{season.startDate} → {season.endDate}</span>
									{#if season.minNights > 1}
										<span class="ml-2 rounded bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 font-semibold">{season.minNights}n min</span>
									{/if}
								</div>
								<!-- Rate summary pills -->
								<div class="flex gap-1.5 flex-wrap justify-end">
									{#each season.tiers as tier}
										<span class="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
											{tier.roomType.category}: ${fmt(tier.nightlyRate)}
										</span>
									{/each}
								</div>
								<span class="text-muted-foreground text-xs ml-1">{editingSeasonId === season.id ? '▲' : '▼'}</span>
							</button>

							{#if editingSeasonId === season.id}
								<div class="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
									<!-- Edit season metadata -->
									<form method="POST" action="?/upsertSeason"
										use:enhance={() => {
											savingSeason = true;
											return async ({ update }) => { savingSeason = false; await update({ reset: false }); };
										}}
										class="grid grid-cols-2 gap-3 sm:grid-cols-4"
									>
										<input type="hidden" name="id" value={season.id} />
										<input type="hidden" name="propertyId" value={season.propertyId} />
										<input type="hidden" name="sortOrder" value={season.sortOrder} />
										<div class="flex flex-col gap-1 col-span-2">
											<label class="text-xs text-muted-foreground">Season name</label>
											<input name="name" value={season.name} required
												class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
										</div>
										<div class="flex flex-col gap-1">
											<label class="text-xs text-muted-foreground">Start date</label>
											<input name="startDate" type="date" value={season.startDate}
												class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
										</div>
										<div class="flex flex-col gap-1">
											<label class="text-xs text-muted-foreground">End date</label>
											<input name="endDate" type="date" value={season.endDate}
												class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
										</div>
										<div class="flex flex-col gap-1">
											<label class="text-xs text-muted-foreground">Colour</label>
											<div class="flex items-center gap-2">
												<input type="color" name="colour" value={season.colour}
													class="h-8 w-10 rounded border cursor-pointer" />
												<span class="font-mono text-xs text-muted-foreground">{season.colour}</span>
											</div>
										</div>
										<div class="flex flex-col gap-1">
											<label class="text-xs text-muted-foreground">Min nights</label>
											<input name="minNights" type="number" min="1" max="14" value={season.minNights}
												class="border-input bg-background rounded border px-2 py-1.5 text-sm w-20" />
										</div>
										<div class="flex items-end gap-2 col-span-2">
											<Button type="submit" size="sm" class="h-8" disabled={savingSeason}>
												{savingSeason ? '…' : 'Save dates'}
											</Button>
										</div>
									</form>
									<form method="POST" action="?/deleteSeason"
										use:enhance={() => {
											deletingSeasonId = season.id;
											return async ({ update }) => { deletingSeasonId = null; editingSeasonId = null; await update(); };
										}}
									>
										<input type="hidden" name="id" value={season.id} />
										<Button type="submit" variant="ghost" size="sm"
											class="text-destructive text-xs"
											disabled={deletingSeasonId === season.id}>
											{deletingSeasonId === season.id ? '…' : 'Delete season'}
										</Button>
									</form>

									<!-- Rate table per room type -->
									<div>
										<p class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Nightly Rates</p>
										<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
											{#each propTypes as rt}
												{@const existing = season.tiers.find((t) => t.roomTypeId === rt.id)}
												<form method="POST" action="?/upsertRateTier"
													use:enhance={() => {
														savingTier = season.id + rt.id;
														return async ({ update }) => { savingTier = null; await update({ reset: false }); };
													}}
													class="flex flex-col gap-1"
												>
													<input type="hidden" name="seasonId" value={season.id} />
													<input type="hidden" name="roomTypeId" value={rt.id} />
													<label class="text-xs text-muted-foreground">{rt.category}: {rt.name}</label>
													<div class="flex items-center gap-1">
														<span class="text-sm text-muted-foreground">$</span>
														<input name="nightlyRate" type="number" min="0" step="1"
															value={existing ? fmt(existing.nightlyRate) : ''}
															placeholder="0"
															class="border-input bg-background rounded border px-2 py-1.5 text-sm w-20 font-mono"
														/>
														<Button type="submit" variant="ghost" size="sm" class="h-8 px-2 text-xs"
															disabled={savingTier === season.id + rt.id}>
															{savingTier === season.id + rt.id ? '…' : '✓'}
														</Button>
													</div>
												</form>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Add new season -->
				<div class="bg-card border-border rounded-lg border p-4 shadow-sm">
					<p class="text-sm font-medium mb-3">Add Season</p>
					<form method="POST" action="?/upsertSeason"
						use:enhance={() => {
							savingSeason = true;
							return async ({ update }) => { savingSeason = false; await update(); };
						}}
						class="grid grid-cols-2 gap-3 sm:grid-cols-4"
					>
						<input type="hidden" name="propertyId" value={pricingPropertyId} />
						<div class="flex flex-col gap-1 col-span-2">
							<label class="text-xs text-muted-foreground">Name</label>
							<input name="name" placeholder="e.g. Easter Weekend" required
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Start date</label>
							<input name="startDate" type="date" required
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">End date</label>
							<input name="endDate" type="date" required
								class="border-input bg-background rounded border px-2 py-1.5 text-sm" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Colour</label>
							<input type="color" name="colour" value="#b7fab7"
								class="h-8 w-16 rounded border cursor-pointer" />
						</div>
						<div class="flex flex-col gap-1">
							<label class="text-xs text-muted-foreground">Min nights</label>
							<input name="minNights" type="number" min="1" value="1"
								class="border-input bg-background rounded border px-2 py-1.5 text-sm w-20" />
						</div>
						<div class="flex items-end col-span-2">
							<Button type="submit" size="sm" class="h-8" disabled={savingSeason}>
								{savingSeason ? '…' : '+ Add season'}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</Tabs.Content>

		<!-- ── Channels ────────────────────────────────────────────────────── -->
		<Tabs.Content value="channels">
			<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
				<h2 class="mb-3 font-semibold">Booking Channels</h2>

				<!-- Channel list -->
				{#if data.channelsList.length > 0}
					<div class="mb-4 space-y-2">
						{#each data.channelsList as ch}
							<div class="flex items-center gap-3 rounded-md border p-2.5 text-sm">
								<span class="flex-1 font-medium">{ch.name}</span>
								{#if ch.isOta}
									<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 uppercase">OTA</span>
								{/if}
								<span class="text-muted-foreground text-xs">sort: {ch.sortOrder}</span>
								<span class={ch.isActive ? 'text-green-600 text-xs' : 'text-muted-foreground text-xs'}>
									{ch.isActive ? 'Active' : 'Inactive'}
								</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add channel -->
				<form
					method="POST"
					action="?/upsertChannel"
					use:enhance={() => {
						addingChannel = true;
						return async ({ update }) => {
							addingChannel = false;
							newChannel = { name: '', isOta: false, sortOrder: '10' };
							await update();
						};
					}}
					class="flex items-end gap-2 flex-wrap"
				>
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Name</Label>
						<Input name="name" placeholder="e.g. VRBO" bind:value={newChannel.name} class="h-8 w-32" required />
					</div>
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Sort order</Label>
						<Input name="sortOrder" type="number" bind:value={newChannel.sortOrder} class="h-8 w-16" />
					</div>
					<div class="flex items-center gap-1.5 pb-0.5">
						<input
							type="checkbox"
							id="isOta"
							name="isOta"
							bind:checked={newChannel.isOta}
							value="true"
							class="h-4 w-4"
						/>
						<Label for="isOta" class="text-sm cursor-pointer">OTA channel</Label>
						<input type="hidden" name="isOta" value={String(newChannel.isOta)} />
					</div>
					<Button type="submit" size="sm" class="h-8" disabled={addingChannel}>
						{addingChannel ? '…' : '+ Add channel'}
					</Button>
				</form>
			</div>
	</Tabs.Content>

	<!-- ── Email Configuration ─────────────────────────────────────────── -->
	<Tabs.Content value="email">
		<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
			<h2 class="mb-1 font-semibold">Email Notifications</h2>
			<p class="text-muted-foreground mb-4 text-sm">
				Configure email sending via Resend. Set <code class="bg-muted rounded px-1">RESEND_API_KEY</code>,
				<code class="bg-muted rounded px-1">RESEND_FROM_EMAIL</code>, and optionally
				<code class="bg-muted rounded px-1">RESEND_OPERATOR_EMAIL</code> in your <code class="bg-muted rounded px-1">.env</code> file.
			</p>
			<div class="space-y-4 text-sm">
				<div class="rounded-md border p-4">
					<h3 class="mb-2 font-medium">When emails are sent</h3>
					<ul class="text-muted-foreground list-disc pl-5 space-y-1">
						<li><strong>Booking confirmation</strong> — sent to guest when a new booking is created (if guest email is on file)</li>
						<li><strong>Online booking alert</strong> — sent to <code class="bg-muted rounded px-1">RESEND_OPERATOR_EMAIL</code> when a guest books online and room assignment is needed</li>
						<li><strong>Cancellation notice</strong> — sent to guest when a booking is cancelled</li>
					</ul>
				</div>
				<div class="rounded-md border p-4">
					<h3 class="mb-2 font-medium">Environment variables</h3>
					<div class="space-y-2 font-mono text-xs">
						<div><span class="font-semibold">RESEND_API_KEY</span>=re_xxxxxxxxxxxxxxxxxxxx</div>
						<div><span class="font-semibold">RESEND_FROM_EMAIL</span>=reservations@yourmotel.com <span class="text-muted-foreground">(must be verified domain in Resend)</span></div>
						<div><span class="font-semibold">RESEND_OPERATOR_EMAIL</span>=owner@yourmotel.com <span class="text-muted-foreground">(optional — receives new online booking alerts)</span></div>
					</div>
				</div>
				<p class="text-muted-foreground text-xs">
					If <code class="bg-muted rounded px-1">RESEND_API_KEY</code> is blank, email sending is silently disabled — no errors will occur.
					Get a free API key at <a href="https://resend.com" target="_blank" class="underline">resend.com</a>.
				</p>
			</div>
		</div>
	</Tabs.Content>
	</Tabs.Root>
</div>
