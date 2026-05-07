<script lang="ts">
	/**
	 * RoomAssignmentDialog — shown when operator selects multiple room types
	 * from the inventory draw mode.  For each selection they can pick a specific
	 * physical room (or leave as unassigned), then continue to GroupCard.
	 */
	import CustomDialog from '$lib/components/core/CustomDialog.svelte';

	type Selection = {
		roomTypeId: string;
		roomTypeName: string;
		propertyId: string;
		propertyName: string;
		checkIn: string;
		checkOut: string;
	};

	type AvailRoom = { id: string; roomNumber: string; roomTypeName: string };

	type AssignedRoom = {
		roomId: string;
		roomNumber: string;
		propertyName: string;
		checkIn: string;
		checkOut: string;
		roomConfigs: string[];
	};

	type Props = {
		open: boolean;
		selections: Selection[];
		onConfirm: (rooms: AssignedRoom[]) => void;
	};

	let { open = $bindable(false), selections, onConfirm }: Props = $props();

	// Per-selection: available rooms + chosen room
	type RowState = {
		availRooms: AvailRoom[];
		loading: boolean;
		selectedRoomId: string;
		selectedRoomNumber: string;
	};

	let rows = $state<RowState[]>([]);
	let loadError = $state('');

	$effect(() => {
		if (open && selections.length > 0) {
			loadError = '';
			rows = selections.map(() => ({ availRooms: [], loading: true, selectedRoomId: '', selectedRoomNumber: '' }));
			selections.forEach((sel, i) => loadAvail(i, sel));
		}
	});

	async function loadAvail(i: number, sel: Selection) {
		try {
			const r = await fetch(
				`/api/rooms/available?roomTypeId=${encodeURIComponent(sel.roomTypeId)}&checkIn=${sel.checkIn}&checkOut=${sel.checkOut}`
			);
			if (r.ok) rows[i].availRooms = await r.json();
		} catch { /* ignore */ }
		finally { rows[i].loading = false; }
	}

	function confirm() {
		const assigned: AssignedRoom[] = selections.map((sel, i) => {
			const row = rows[i];
			const roomId   = row.selectedRoomId || `__unassigned_${sel.roomTypeId}`;
			const roomNum  = row.selectedRoomNumber || sel.roomTypeName + ' (unassigned)';
			return {
				roomId,
				roomNumber: roomNum,
				propertyName: sel.propertyName,
				checkIn: sel.checkIn,
				checkOut: sel.checkOut,
				roomConfigs: []
			};
		});
		open = false;
		onConfirm(assigned);
	}

	function fmtDate(iso: string) {
		return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
	}
	function nightsBetween(a: string, b: string) {
		return Math.max(0, Math.round(
			(new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000
		));
	}
</script>

<CustomDialog
	bind:open
	title="Assign Rooms"
	description="Pick a specific room for each selection, or leave unassigned to queue for later."
	dialogClass="sm:max-w-lg"
	closeOnOutsideClick={false}
	interactOutsideBehavior="ignore"
>
	{#snippet content()}
		<div class="flex flex-col gap-3 p-4">
			{#each selections as sel, i}
				{@const row = rows[i]}
				<div class="rounded-lg border border-border bg-card p-3">
					<div class="mb-2 flex items-center justify-between">
						<div>
							<p class="text-sm font-semibold">{sel.roomTypeName}</p>
							<p class="text-xs text-muted-foreground">
								{sel.propertyName} · {fmtDate(sel.checkIn)} → {fmtDate(sel.checkOut)} · {nightsBetween(sel.checkIn, sel.checkOut)} night{nightsBetween(sel.checkIn, sel.checkOut) === 1 ? '' : 's'}
							</p>
						</div>
					</div>
					{#if row?.loading}
						<p class="animate-pulse text-xs text-muted-foreground">Checking availability…</p>
					{:else if row}
						<select
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							value={row.selectedRoomId}
							onchange={(e) => {
								const val = (e.target as HTMLSelectElement).value;
								row.selectedRoomId = val;
								row.selectedRoomNumber = row.availRooms.find(r => r.id === val)?.roomNumber ?? '';
							}}
						>
							<option value="">— Unassigned (queue for later) —</option>
							{#each row.availRooms as r}
								<option value={r.id}>Room {r.roomNumber} – {r.roomTypeName}</option>
							{/each}
						</select>
						{#if row.availRooms.length === 0}
							<p class="mt-1 text-[10px] text-amber-600">No rooms available for these dates — will save as unassigned.</p>
						{:else if !row.selectedRoomId}
							<p class="mt-1 text-[10px] text-muted-foreground">{row.availRooms.length} room{row.availRooms.length === 1 ? '' : 's'} available</p>
						{:else}
							<p class="mt-1 text-[10px] text-teal-700 font-medium">✓ Room {row.selectedRoomNumber} selected</p>
						{/if}
					{/if}
				</div>
			{/each}

			{#if loadError}
				<p class="text-xs text-destructive">{loadError}</p>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end gap-2 w-full">
			<button type="button" onclick={() => { open = false; }}
				class="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">Cancel</button>
			<button type="button" onclick={confirm}
				class="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
				Continue to Group Booking →
			</button>
		</div>
	{/snippet}
</CustomDialog>
