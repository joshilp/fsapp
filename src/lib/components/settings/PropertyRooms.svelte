<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import { toast } from 'svelte-sonner';

	type Prop = { id: string; name: string };
	type RoomType = {
		id: string; propertyId: string; name: string; category: string;
		sortOrder: number; defaultRateCents?: number | null;
	};
	type Room = {
		id: string; roomNumber: string; isActive: boolean; hasKitchen: boolean;
		doorCode?: string | null; checkinInstructions?: string | null;
		roomType?: { name: string; category: string } | null;
	};

	let { prop, rooms, roomTypes }: { prop: Prop; rooms: Room[]; roomTypes: RoomType[] } = $props();

	// ── Room types state ──────────────────────────────────────────────────────
	let editingRoomTypeId = $state<string | null>(null);
	let addingRoomType = $state(false);
	let deletingRoomTypeId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let confirmDeleteName = $state('');

	// ── Rooms state ───────────────────────────────────────────────────────────
	let addingRoom = $state(false);
	let togglingRoom = $state<string | null>(null);
	let roomError = $state('');
	let newRoomNumber = $state('');
	let newRoomTypeId = $state('');

	// ── Room door code / checkin instructions inline edit ─────────────────────
	let editingRoomId      = $state<string | null>(null);
	let editDoorCode       = $state('');
	let editInstructions   = $state('');
	let roomAccessSaving   = $state(false);

	function startRoomAccessEdit(room: Room) {
		editingRoomId    = room.id;
		editDoorCode     = room.doorCode ?? '';
		editInstructions = room.checkinInstructions ?? '';
	}
</script>

<!-- ── Room Types ─────────────────────────────────────────────────────────── -->
<h2 class="mb-4 text-lg font-semibold">Rooms &amp; Types</h2>

<div class="mb-8">
	<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room Types</p>

	{#if roomTypes.length > 0}
		<div class="mb-4 max-w-xl space-y-2">
			{#each roomTypes as rt}
				{#if editingRoomTypeId === rt.id}
					<form method="POST" action="?/upsertRoomType"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') { toast.success('Saved'); editingRoomTypeId = null; }
								else toast.error('Save failed');
								await update();
							};
						}}
						class="flex items-end gap-2 flex-wrap rounded-md border p-3 bg-muted/20"
					>
						<input type="hidden" name="id" value={rt.id} />
						<input type="hidden" name="propertyId" value={prop.id} />
						<div class="flex flex-col gap-1">
							<span class="text-xs text-muted-foreground">Name</span>
							<input name="name" value={rt.name} required
								class="border-input bg-background rounded border px-2 py-1 text-sm w-40" />
						</div>
						<div class="flex flex-col gap-1">
							<span class="text-xs text-muted-foreground">Code</span>
							<input name="category" value={rt.category} required maxlength="6"
								class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono uppercase" />
						</div>
						<div class="flex flex-col gap-1">
							<span class="text-xs text-muted-foreground">Sort</span>
							<input name="sortOrder" type="number" value={rt.sortOrder}
								class="border-input bg-background rounded border px-2 py-1 text-sm w-16" />
						</div>
						<div class="flex flex-col gap-1">
							<span class="text-xs text-muted-foreground">Default rate</span>
							<div class="flex items-center gap-1">
								<span class="text-sm text-muted-foreground">$</span>
								<input name="defaultRateCents" type="number" min="0" step="1"
									value={rt.defaultRateCents ? (rt.defaultRateCents / 100).toFixed(0) : ''}
									placeholder="100"
									class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
							</div>
						</div>
						<Button type="submit" size="sm" class="h-8">Save</Button>
						<Button type="button" variant="ghost" size="sm" class="h-8"
							onclick={() => { editingRoomTypeId = null; }}>Cancel</Button>
					</form>
				{:else}
					<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
						<span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{rt.category}</span>
						<span class="flex-1 font-medium">{rt.name}</span>
						{#if rt.defaultRateCents}
							<span class="font-mono text-xs text-muted-foreground">${(rt.defaultRateCents / 100).toFixed(0)}/night</span>
						{:else}
							<span class="text-[10px] text-amber-600 font-medium">no default rate</span>
						{/if}
						<Button size="sm" variant="ghost" class="h-7 px-2 text-xs"
							onclick={() => { editingRoomTypeId = rt.id; }}>Edit</Button>
						<Button type="button" variant="ghost" size="sm"
							class="text-destructive h-7 px-2 text-xs"
							disabled={deletingRoomTypeId === rt.id}
							onclick={() => { confirmDeleteId = rt.id; confirmDeleteName = rt.name; }}>
							{deletingRoomTypeId === rt.id ? '…' : 'Delete'}
						</Button>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Add room type -->
	<form method="POST" action="?/upsertRoomType"
		use:enhance={() => {
			addingRoomType = true;
			return async ({ result, update }) => {
				addingRoomType = false;
				if (result.type === 'success') toast.success('Room type added');
				else toast.error('Save failed');
				await update();
			};
		}}
		class="flex items-end gap-2 flex-wrap"
	>
		<input type="hidden" name="propertyId" value={prop.id} />
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Name</span>
			<input name="name" placeholder="2 Bed + Kitchen" required
				class="border-input bg-background rounded border px-2 py-1 text-sm w-44" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Code</span>
			<input name="category" placeholder="2BDK" required maxlength="6"
				title="Short code shown in the rate calendar (e.g. 1BD, 2BDK)"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono uppercase" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Sort</span>
			<input name="sortOrder" type="number" value="0"
				class="border-input bg-background rounded border px-2 py-1 text-sm w-16" />
		</div>
		<div class="flex flex-col gap-1">
			<span class="text-xs text-muted-foreground">Default rate</span>
			<div class="flex items-center gap-1">
				<span class="text-sm text-muted-foreground">$</span>
				<input name="defaultRateCents" type="number" min="0" step="1" placeholder="100"
					class="border-input bg-background rounded border px-2 py-1 text-sm w-20 font-mono" />
			</div>
		</div>
		<Button type="submit" size="sm" class="h-8" disabled={addingRoomType}>
			{addingRoomType ? '…' : '+ Add type'}
		</Button>
	</form>
</div>

<!-- ── Rooms ──────────────────────────────────────────────────────────────── -->
<div>
	<p class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rooms</p>

	{#if rooms.length > 0}
		<div class="mb-5 overflow-x-auto max-w-xl">
			<table class="w-full text-sm">
				<thead>
			<tr class="text-muted-foreground border-border border-b text-xs">
					<th class="pb-1 pr-4 text-left font-medium">Room #</th>
					<th class="pb-1 pr-4 text-left font-medium">Type</th>
					<th class="pb-1 pr-4 text-left font-medium">Kitchen</th>
					<th class="pb-1 pr-4 text-left font-medium">Door Code</th>
					<th class="pb-1 text-right font-medium">Active</th>
				</tr>
				</thead>
				<tbody>
					{#each rooms as room}
						<tr class="border-border border-b text-sm last:border-0">
							<td class="py-2 pr-4 font-mono font-medium">{room.roomNumber}</td>
							<td class="py-2 pr-4 text-muted-foreground">
								{room.roomType?.category ?? '—'}
								{#if room.roomType?.name}
									<span class="text-xs">· {room.roomType.name}</span>
								{/if}
							</td>
					<td class="py-2 pr-4 text-xs">{room.hasKitchen ? '✓' : '—'}</td>
						<td class="py-2 pr-4 text-xs">
							{#if editingRoomId === room.id}
								<form method="POST" action="?/updateRoomAccess"
									use:enhance={() => {
										roomAccessSaving = true;
										return async ({ result, update }) => {
											roomAccessSaving = false;
											if (result.type === 'success') { toast.success('Saved'); editingRoomId = null; }
											else toast.error('Save failed');
											await update();
										};
									}}
									class="flex flex-col gap-1"
								>
									<input type="hidden" name="id" value={room.id} />
									<input type="text" name="doorCode" bind:value={editDoorCode}
										placeholder="e.g. 4821" class="w-24 rounded border border-input bg-background px-2 py-0.5 text-xs font-mono" />
									<textarea name="checkinInstructions" bind:value={editInstructions}
										placeholder="Parking, Wi-Fi, lockbox…" rows="2"
										class="w-48 rounded border border-input bg-background px-2 py-0.5 text-xs resize-none"></textarea>
									<div class="flex gap-1">
										<button type="submit" disabled={roomAccessSaving}
											class="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50">Save</button>
										<button type="button" onclick={() => editingRoomId = null}
											class="rounded border border-input px-2 py-0.5 text-xs hover:bg-muted">✕</button>
									</div>
								</form>
							{:else}
								<button type="button" onclick={() => startRoomAccessEdit(room)}
									class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
									{room.doorCode ? room.doorCode : '+ set code'}
								</button>
							{/if}
						</td>
						<td class="py-2 text-right">
								<form method="POST" action="?/toggleRoom"
									use:enhance={() => {
										togglingRoom = room.id;
										return async ({ result, update }) => {
											togglingRoom = null;
											if (result.type === 'success')
												toast.success(room.isActive ? 'Room deactivated' : 'Room activated');
											else toast.error('Toggle failed');
											await update();
										};
									}}
								>
									<input type="hidden" name="id" value={room.id} />
									<input type="hidden" name="isActive" value={String(room.isActive)} />
									<button type="submit"
										class={[
											'rounded px-2 py-0.5 text-xs font-medium transition-colors',
											room.isActive
												? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
												: 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
										].join(' ')}
										disabled={togglingRoom === room.id}>
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
	<form method="POST" action="?/addRoom"
		use:enhance={() => {
			addingRoom = true;
			roomError = '';
			return async ({ result, update }) => {
				addingRoom = false;
				if (result.type === 'failure') {
					roomError = (result.data?.error as string) ?? 'Error';
				} else {
					toast.success('Room added');
					newRoomNumber = '';
					newRoomTypeId = '';
				}
				await update({ reset: false });
			};
		}}
		class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl"
	>
		<input type="hidden" name="propertyId" value={prop.id} />
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Room #</Label>
			<Input name="roomNumber" placeholder="33" bind:value={newRoomNumber} class="h-8 w-20" required />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Type</Label>
			<select name="roomTypeId"
				class="border-input bg-background h-8 rounded-md border px-2 text-sm"
				bind:value={newRoomTypeId}>
				<option value="">— none —</option>
				{#each roomTypes as rt}
					<option value={rt.id}>{rt.category} · {rt.name}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Bedrooms</Label>
			<Input name="numRooms" type="number" min="1" placeholder="1" class="h-8 w-16" />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">King beds</Label>
			<Input name="kingBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Queen beds</Label>
			<Input name="queenBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
		</div>
		<div class="flex flex-col gap-1">
			<Label class="text-xs">Double beds</Label>
			<Input name="doubleBeds" type="number" min="0" placeholder="0" class="h-8 w-16" />
		</div>
		<div class="flex items-end gap-3 col-span-2 sm:col-span-3 pb-0.5">
			<label class="flex items-center gap-1.5 text-xs cursor-pointer">
				<input type="checkbox" name="hasKitchen" value="1" class="rounded" />
				Kitchen
			</label>
			<label class="flex items-center gap-1.5 text-xs cursor-pointer">
				<input type="checkbox" name="hasHideabed" value="1" class="rounded" />
				Hideabed
			</label>
		</div>
		<div class="flex flex-col gap-1 col-span-2 sm:col-span-3">
			<Label class="text-xs">Configs <span class="font-normal text-muted-foreground">(one per line for dual-config rooms)</span></Label>
			<textarea name="configs" rows="2"
				placeholder={"Leave blank for single config\n1Q Sleeping\n1Q+1D Sleeping"}
				class="border-input bg-background rounded-md border px-2 py-1 text-xs w-full resize-none"></textarea>
		</div>
		<Button type="submit" size="sm" class="h-8 col-span-2 sm:col-span-3" disabled={addingRoom}>
			{addingRoom ? '…' : '+ Add room'}
		</Button>
	</form>
</div>

<!-- Delete room type confirmation -->
<AlertDialog.Root open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) confirmDeleteId = null; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete room type?</AlertDialog.Title>
			<AlertDialog.Description>
				<strong>{confirmDeleteName}</strong> will be permanently deleted. Rooms assigned to this type will have their type cleared. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel onclick={() => confirmDeleteId = null}>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/deleteRoomType"
				use:enhance={() => {
					deletingRoomTypeId = confirmDeleteId;
					confirmDeleteId = null;
					return async ({ result, update }) => {
						deletingRoomTypeId = null;
						if (result.type === 'success') toast.success('Room type deleted');
						else toast.error('Delete failed');
						await update();
					};
				}}
			>
				<input type="hidden" name="id" value={confirmDeleteId ?? ''} />
				<AlertDialog.Action type="submit">Delete</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
