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
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8">
	<h1 class="mb-6 text-2xl font-bold">Settings</h1>

	<Tabs.Root value="properties">
		<Tabs.List class="mb-6">
			<Tabs.Trigger value="properties">Properties</Tabs.Trigger>
			<Tabs.Trigger value="taxes">Tax Presets</Tabs.Trigger>
			<Tabs.Trigger value="rooms">Rooms</Tabs.Trigger>
			<Tabs.Trigger value="channels">Channels</Tabs.Trigger>
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
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-3 font-semibold">{prop.name}</h2>

						<!-- Existing presets -->
						{@const presets = data.taxPresetsList.filter((p) => p.propertyId === prop.id)}
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
					<div class="bg-card border-border rounded-lg border p-5 shadow-sm">
						<h2 class="mb-3 font-semibold">{prop.name}</h2>

						{@const propRooms = data.roomsList.filter((r) => r.propertyId === prop.id)}
						{@const propRoomTypes = data.roomTypesList.filter((rt) => rt.propertyId === prop.id)}

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
							class="flex items-end gap-2"
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
							<Button type="submit" size="sm" class="h-8" disabled={addingRoom}>
								{addingRoom ? '…' : '+ Add room'}
							</Button>
						</form>
					</div>
				{/each}
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
	</Tabs.Root>
</div>
