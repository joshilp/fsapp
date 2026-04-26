<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Local reactive HK statuses for instant feedback
	let hkStatuses = $state<Map<string, string>>(new Map());
	$effect(() => {
		const m = new Map<string, string>();
		for (const prop of data.properties) {
			for (const r of prop.rooms) m.set(r.id, r.housekeepingStatus);
		}
		hkStatuses = m;
	});

	const HK_CYCLE = ['clean', 'dirty', 'in_progress', 'out_of_order'] as const;
	type HkStatus = (typeof HK_CYCLE)[number];

	const STATUS_CONFIG: Record<HkStatus, { label: string; bg: string; text: string; icon: string }> = {
		clean:        { label: 'Clean',       bg: 'bg-green-100  border-green-400',  text: 'text-green-800',  icon: '✓' },
		dirty:        { label: 'Dirty',       bg: 'bg-amber-100  border-amber-400',  text: 'text-amber-800',  icon: '🧹' },
		in_progress:  { label: 'In Progress', bg: 'bg-blue-100   border-blue-400',   text: 'text-blue-800',   icon: '⟳' },
		out_of_order: { label: 'Out of Order',bg: 'bg-red-100    border-red-500',    text: 'text-red-900',    icon: '✗' }
	};

	async function cycleStatus(roomId: string, current: string) {
		const idx = HK_CYCLE.indexOf(current as HkStatus);
		const next = HK_CYCLE[(idx + 1) % HK_CYCLE.length];
		hkStatuses = new Map(hkStatuses).set(roomId, next);
		await fetch(`/api/rooms/${roomId}/status`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: next })
		});
	}

	function bedLine(r: { kingBeds: number; queenBeds: number; doubleBeds: number; hasHideabed: boolean; hasKitchen: boolean }) {
		const parts: string[] = [];
		if (r.kingBeds > 0) parts.push(`${r.kingBeds}K`);
		if (r.queenBeds > 0) parts.push(`${r.queenBeds}Q`);
		if (r.doubleBeds > 0) parts.push(`${r.doubleBeds}D`);
		if (r.hasHideabed) parts.push('HB');
		if (r.hasKitchen) parts.push('Kit');
		return parts.join(' · ') || '—';
	}
</script>

<svelte:head>
	<title>Housekeeping</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-xl font-bold">Housekeeping</h1>
			<p class="text-muted-foreground text-sm">{data.today} — tap a room to cycle status</p>
		</div>
		<a href="/booking" class="text-muted-foreground hover:text-foreground text-sm">← Back to Grid</a>
	</div>

	<!-- Legend -->
	<div class="mb-4 flex flex-wrap gap-2 text-xs">
		{#each HK_CYCLE as s}
			{@const cfg = STATUS_CONFIG[s]}
			<span class="flex items-center gap-1 rounded border px-2 py-0.5 {cfg.bg} {cfg.text}">
				<span class="font-bold">{cfg.icon}</span>{cfg.label}
			</span>
		{/each}
	</div>

	{#each data.properties as prop}
		<section class="mb-8">
			<h2 class="mb-3 border-b pb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				{prop.name}
			</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
				{#each prop.rooms as room}
					{@const status = (hkStatuses.get(room.id) ?? room.housekeepingStatus) as HkStatus}
					{@const cfg = STATUS_CONFIG[status]}
					<button
						onclick={() => cycleStatus(room.id, status)}
						class="relative rounded-lg border-2 p-3 text-left transition-all active:scale-95 {cfg.bg} {cfg.text} hover:brightness-95"
					>
						<!-- Room number -->
						<div class="flex items-start justify-between">
							<span class="text-lg font-bold leading-none">Rm {room.roomNumber}</span>
							<span class="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none">
								{cfg.icon} {cfg.label}
							</span>
						</div>

						<!-- Room type -->
						{#if room.roomType}
							<p class="mt-0.5 text-[11px] opacity-70">{room.roomType.name}</p>
						{/if}

						<!-- Bed config -->
						<p class="mt-1 text-[11px] font-medium">{bedLine(room)}</p>

						<!-- Current guest -->
						{#if room.booking}
							{@const b = room.booking}
							<div class="mt-2 border-t border-current/20 pt-1.5 text-[11px]">
								{#if b.isCheckout}
									<p class="font-semibold text-orange-700">↑ Checkout today</p>
								{:else if b.isCheckin}
									<p class="font-semibold text-blue-700">↓ Arriving today</p>
								{:else if b.status === 'checked_in'}
									<p class="font-semibold">In house</p>
								{/if}
								{#if b.guestName}
									<p class="truncate opacity-80">{b.guestName}</p>
								{/if}
								<p class="opacity-60">{b.checkInDate} → {b.checkOutDate}</p>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</section>
	{/each}
</div>
